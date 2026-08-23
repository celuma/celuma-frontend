/**
 * Céluma 1.3, Phase 3, Block C — the single polling owner.
 *
 * These are the tests that keep the architectural rules true: only the count is
 * polled, polling starts only after authentication resolves, it pauses in a
 * hidden tab, it never overlaps itself, and it leaks neither an interval nor a
 * listener on unmount.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { useNotifications } from "../../providers/notification_context";
import {
    DEFAULT_POLL_INTERVAL_MS,
    MIN_POLL_INTERVAL_MS,
    POLL_INTERVAL_MS,
    resolvePollIntervalMs,
} from "../../providers/notification_context";
import { NotificationProvider } from "../../providers/notification_provider";
import * as notificationService from "../../services/notification_service";
import { NotificationApiError } from "../../services/notification_service";
import { AUTH_TOKEN_KEY } from "../../lib/auth_session";
import type { NotificationListItem } from "../../models/notification";

/**
 * The provider's authentication gate is the stored session token, so these
 * helpers are how a test signs in and out.
 */
function signIn() {
    localStorage.setItem(AUTH_TOKEN_KEY, "Bearer test-token");
}

function signOut() {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
}

function item(overrides: Partial<NotificationListItem> = {}): NotificationListItem {
    return {
        recipient_id: "r1",
        notification_id: "n1",
        type: "REPORT_PUBLISHED",
        severity: "INFO",
        title: "Reporte publicado — Orden ORD-1",
        body: null,
        resource_type: "report",
        resource_id: "res1",
        status: "UNREAD",
        created_at: "2026-08-04T12:00:00",
        read_at: null,
        ...overrides,
    };
}

/** Renders the provider's state as text, so assertions read off the DOM. */
function Probe() {
    const state = useNotifications();
    return (
        <div>
            <span data-testid="count">{state.unreadCount}</span>
            <span data-testid="items">{state.recentItems.length}</span>
            <span data-testid="items-unread">
                {state.recentItems.filter((i) => i.status === "UNREAD").length}
            </span>
            <span data-testid="stale">{String(state.countStale)}</span>
            <span data-testid="error">{state.error?.message ?? ""}</span>
            <button onClick={() => void state.refreshRecentItems()}>load</button>
            <button onClick={() => void state.markRead("r1").catch(() => {})}>read</button>
            <button onClick={() => void state.markAllRead().catch(() => {})}>read-all</button>
        </div>
    );
}

function renderProvider(children = <Probe />) {
    return render(
        <MemoryRouter initialEntries={["/home"]}>
            <NotificationProvider>{children}</NotificationProvider>
        </MemoryRouter>,
    );
}

/** Drives `document.visibilityState`, which is read-only by default. */
function setVisibility(state: DocumentVisibilityState) {
    Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => state,
    });
    document.dispatchEvent(new Event("visibilitychange"));
}

let countSpy: ReturnType<typeof vi.spyOn>;
let listSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    signIn();
    setVisibility("visible");
    countSpy = vi
        .spyOn(notificationService, "getUnreadNotificationCount")
        .mockResolvedValue({ unread_count: 0 });
    listSpy = vi
        .spyOn(notificationService, "listNotifications")
        .mockResolvedValue({ items: [], next_cursor: null });
});

afterEach(() => {
    signOut();
    vi.useRealTimers();
    vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Interval configuration
// ---------------------------------------------------------------------------

describe("poll interval", () => {
    it("defaults to 30 seconds", () => {
        expect(resolvePollIntervalMs(undefined)).toBe(DEFAULT_POLL_INTERVAL_MS);
        expect(DEFAULT_POLL_INTERVAL_MS).toBe(30_000);
    });

    it("never goes below the 15-second floor, whatever the env var says", () => {
        // The API's global limiter is 100 requests / 60s / client IP. Nothing
        // about an unread count justifies a tighter loop.
        expect(resolvePollIntervalMs("1000")).toBe(MIN_POLL_INTERVAL_MS);
        expect(resolvePollIntervalMs("0")).toBe(DEFAULT_POLL_INTERVAL_MS);
        expect(resolvePollIntervalMs("-5000")).toBe(DEFAULT_POLL_INTERVAL_MS);
        expect(resolvePollIntervalMs("not-a-number")).toBe(DEFAULT_POLL_INTERVAL_MS);
    });

    it("accepts a larger configured value", () => {
        expect(resolvePollIntervalMs("60000")).toBe(60_000);
    });

    it("is at least 15 seconds as actually compiled", () => {
        expect(POLL_INTERVAL_MS).toBeGreaterThanOrEqual(MIN_POLL_INTERVAL_MS);
    });
});

// ---------------------------------------------------------------------------
// Auth lifecycle
// ---------------------------------------------------------------------------

describe("polling and the auth lifecycle", () => {
    it("fetches the count once authenticated", async () => {
        countSpy.mockResolvedValue({ unread_count: 4 });

        renderProvider();

        await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("4"));
        expect(countSpy).toHaveBeenCalled();
    });

    it("does not fetch when there is no session token", async () => {
        signOut();

        renderProvider();

        await act(async () => {});
        expect(countSpy).not.toHaveBeenCalled();
    });

    it("starts polling after an in-app login, without a page reload", async () => {
        // Regression guard. The provider sits above <Routes> and never
        // remounts, so an auth source resolved once at startup (on the login
        // screen, before any token existed) would report "unauthenticated" for
        // the rest of the session and the badge would sit at zero. Found in
        // Block C local validation against the real backend.
        signOut();
        countSpy.mockResolvedValue({ unread_count: 6 });

        function LoginScreen() {
            const navigate = useNavigate();
            return (
                <button
                    onClick={() => {
                        signIn();
                        navigate("/home");
                    }}
                >
                    entrar
                </button>
            );
        }

        render(
            <MemoryRouter initialEntries={["/login"]}>
                <NotificationProvider>
                    <Probe />
                    <Routes>
                        <Route path="/login" element={<LoginScreen />} />
                        <Route path="/home" element={<div>inicio</div>} />
                    </Routes>
                </NotificationProvider>
            </MemoryRouter>,
        );
        await act(async () => {});
        expect(countSpy).not.toHaveBeenCalled();

        await act(async () => {
            screen.getByText("entrar").click();
        });

        expect(countSpy).toHaveBeenCalled();
        await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("6"));
    });

    it("stops polling on a cross-tab logout", async () => {
        countSpy.mockResolvedValue({ unread_count: 5 });
        vi.useFakeTimers();
        renderProvider();
        await act(async () => {});
        expect(screen.getByTestId("count").textContent).toBe("5");

        // Another tab cleared the token; this one may never navigate again.
        await act(async () => {
            signOut();
            window.dispatchEvent(new Event("storage"));
        });

        expect(screen.getByTestId("count").textContent).toBe("0");
        countSpy.mockClear();
        await act(async () => {
            vi.advanceTimersByTime(POLL_INTERVAL_MS * 2);
        });
        expect(countSpy).not.toHaveBeenCalled();
    });

    it("polls only the count endpoint, never the list", async () => {
        vi.useFakeTimers();
        renderProvider();
        await act(async () => {});

        countSpy.mockClear();
        // One tick at a time, flushing microtasks between them: the in-flight
        // guard deliberately drops a tick that would overlap the previous
        // request, so firing three intervals inside one synchronous
        // advanceTimersByTime would (correctly) produce a single call.
        for (let i = 0; i < 3; i++) {
            await act(async () => {
                vi.advanceTimersByTime(POLL_INTERVAL_MS);
            });
        }

        expect(countSpy).toHaveBeenCalledTimes(3);
        // The list endpoint is on-demand only. Polling it would defeat the
        // entire point of the cheap unread-count endpoint.
        expect(listSpy).not.toHaveBeenCalled();
    });

    it("stops polling and clears state on logout", async () => {
        // The real logout path: SidebarCeluma clears the stored token and then
        // navigates to /login. The route change is what re-evaluates the gate.
        countSpy.mockResolvedValue({ unread_count: 7 });

        function LogoutButton() {
            const navigate = useNavigate();
            return (
                <button
                    onClick={() => {
                        signOut();
                        navigate("/login");
                    }}
                >
                    salir
                </button>
            );
        }

        render(
            <MemoryRouter initialEntries={["/home"]}>
                <NotificationProvider>
                    <Probe />
                    <LogoutButton />
                    <Routes>
                        <Route path="/home" element={<div>inicio</div>} />
                        <Route path="/login" element={<div>login</div>} />
                    </Routes>
                </NotificationProvider>
            </MemoryRouter>,
        );
        await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("7"));

        vi.useFakeTimers();
        await act(async () => {
            screen.getByText("salir").click();
        });

        // A stale badge must not survive into the next session.
        expect(screen.getByTestId("count").textContent).toBe("0");

        countSpy.mockClear();
        await act(async () => {
            vi.advanceTimersByTime(POLL_INTERVAL_MS * 3);
        });
        expect(countSpy).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// Visibility
// ---------------------------------------------------------------------------

describe("visibility-aware polling", () => {
    it("pauses while the tab is hidden", async () => {
        vi.useFakeTimers();
        renderProvider();
        await act(async () => {});

        countSpy.mockClear();
        act(() => setVisibility("hidden"));

        await act(async () => {
            vi.advanceTimersByTime(POLL_INTERVAL_MS * 4);
        });

        expect(countSpy).not.toHaveBeenCalled();
    });

    it("refreshes immediately when the tab becomes visible again", async () => {
        vi.useFakeTimers();
        renderProvider();
        await act(async () => {});
        act(() => setVisibility("hidden"));
        countSpy.mockClear();

        await act(async () => {
            setVisibility("visible");
        });

        // Immediate catch-up, not "wait another 30 seconds".
        expect(countSpy).toHaveBeenCalledTimes(1);
    });

    it("resumes the cadence after becoming visible", async () => {
        vi.useFakeTimers();
        renderProvider();
        await act(async () => {});
        act(() => setVisibility("hidden"));
        await act(async () => {
            setVisibility("visible");
        });
        countSpy.mockClear();

        for (let i = 0; i < 2; i++) {
            await act(async () => {
                vi.advanceTimersByTime(POLL_INTERVAL_MS);
            });
        }

        expect(countSpy).toHaveBeenCalledTimes(2);
    });
});

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

describe("cleanup", () => {
    it("clears the interval on unmount — no leak", async () => {
        vi.useFakeTimers();
        const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
        const { unmount } = renderProvider();
        await act(async () => {});

        unmount();

        expect(clearIntervalSpy).toHaveBeenCalled();

        countSpy.mockClear();
        await act(async () => {
            vi.advanceTimersByTime(POLL_INTERVAL_MS * 5);
        });
        // The real assertion: nothing fires after unmount.
        expect(countSpy).not.toHaveBeenCalled();
    });

    it("removes the visibilitychange listener on unmount", async () => {
        const removeSpy = vi.spyOn(document, "removeEventListener");
        const { unmount } = renderProvider();
        await act(async () => {});

        unmount();

        expect(
            removeSpy.mock.calls.some(([event]) => event === "visibilitychange"),
        ).toBe(true);
    });

    it("does not set state from a response that lands after unmount", async () => {
        let resolveCount: (v: { unread_count: number }) => void = () => {};
        countSpy.mockReturnValue(
            new Promise((resolve) => {
                resolveCount = resolve;
            }),
        );
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

        const { unmount } = renderProvider();
        unmount();
        await act(async () => {
            resolveCount({ unread_count: 9 });
        });

        // React would warn about updating an unmounted component; the mounted
        // guard is what prevents it.
        expect(errorSpy).not.toHaveBeenCalled();
    });

    it("never runs two count requests concurrently", async () => {
        let pending = 0;
        let maxConcurrent = 0;
        countSpy.mockImplementation(async () => {
            pending += 1;
            maxConcurrent = Math.max(maxConcurrent, pending);
            await new Promise((r) => setTimeout(r, 0));
            pending -= 1;
            return { unread_count: 1 };
        });

        renderProvider();
        // Hammer it: several visibility flips plus the mount fetch.
        await act(async () => {
            setVisibility("visible");
            setVisibility("visible");
            setVisibility("visible");
        });
        await act(async () => {});

        expect(maxConcurrent).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// Failure behaviour
// ---------------------------------------------------------------------------

describe("count-poll failure", () => {
    it("keeps the last known count instead of falling back to zero", async () => {
        countSpy.mockResolvedValueOnce({ unread_count: 5 });
        vi.useFakeTimers();
        renderProvider();
        await act(async () => {});
        expect(screen.getByTestId("count").textContent).toBe("5");

        countSpy.mockRejectedValue(new Error("network"));
        await act(async () => {
            vi.advanceTimersByTime(POLL_INTERVAL_MS);
        });

        // Showing 0 would tell the user their inbox emptied when the network
        // merely hiccupped.
        expect(screen.getByTestId("count").textContent).toBe("5");
        expect(screen.getByTestId("stale").textContent).toBe("true");
    });

    it("does not populate the surfaced error from a poll failure", async () => {
        countSpy.mockRejectedValue(new Error("network"));

        renderProvider();
        await act(async () => {});

        // `error` drives a visible message; a background poll must not raise one
        // every 30 seconds.
        expect(screen.getByTestId("error").textContent).toBe("");
    });

    it("clears the stale flag once a poll succeeds again", async () => {
        countSpy.mockRejectedValueOnce(new Error("network"));
        vi.useFakeTimers();
        renderProvider();
        await act(async () => {});
        expect(screen.getByTestId("stale").textContent).toBe("true");

        countSpy.mockResolvedValue({ unread_count: 2 });
        await act(async () => {
            vi.advanceTimersByTime(POLL_INTERVAL_MS);
        });

        expect(screen.getByTestId("stale").textContent).toBe("false");
        expect(screen.getByTestId("count").textContent).toBe("2");
    });
});

// ---------------------------------------------------------------------------
// Recent items
// ---------------------------------------------------------------------------

describe("refreshRecentItems", () => {
    it("loads the list on demand and surfaces its error", async () => {
        listSpy.mockResolvedValueOnce({ items: [item(), item({ recipient_id: "r2" })], next_cursor: null });
        renderProvider();
        await act(async () => {});

        await act(async () => {
            screen.getByText("load").click();
        });
        expect(screen.getByTestId("items").textContent).toBe("2");

        listSpy.mockRejectedValueOnce(new Error("No fue posible cargar las notificaciones."));
        await act(async () => {
            screen.getByText("load").click();
        });
        expect(screen.getByTestId("error").textContent).toBe(
            "No fue posible cargar las notificaciones.",
        );
    });
});

// ---------------------------------------------------------------------------
// Read reconciliation
// ---------------------------------------------------------------------------

describe("markRead", () => {
    it("decrements the count optimistically and flips the row", async () => {
        countSpy.mockResolvedValue({ unread_count: 3 });
        listSpy.mockResolvedValue({ items: [item()], next_cursor: null });
        const readSpy = vi
            .spyOn(notificationService, "markNotificationRead")
            .mockResolvedValue({ recipient_id: "r1", status: "READ", read_at: "2026-08-05T00:00:00" });

        renderProvider();
        await act(async () => {});
        await act(async () => {
            screen.getByText("load").click();
        });

        await act(async () => {
            screen.getByText("read").click();
        });

        expect(readSpy).toHaveBeenCalledWith("r1");
        expect(screen.getByTestId("count").textContent).toBe("2");
    });

    it("never drops the count below zero", async () => {
        countSpy.mockResolvedValue({ unread_count: 0 });
        listSpy.mockResolvedValue({ items: [item()], next_cursor: null });
        vi.spyOn(notificationService, "markNotificationRead").mockResolvedValue({
            recipient_id: "r1",
            status: "READ",
            read_at: "x",
        });

        renderProvider();
        await act(async () => {});
        await act(async () => {
            screen.getByText("load").click();
        });
        await act(async () => {
            screen.getByText("read").click();
        });

        expect(screen.getByTestId("count").textContent).toBe("0");
    });

    it("does not decrement for an already-read row", async () => {
        countSpy.mockResolvedValue({ unread_count: 3 });
        listSpy.mockResolvedValue({ items: [item({ status: "READ", read_at: "x" })], next_cursor: null });
        vi.spyOn(notificationService, "markNotificationRead").mockResolvedValue({
            recipient_id: "r1",
            status: "READ",
            read_at: "x",
        });

        renderProvider();
        await act(async () => {});
        await act(async () => {
            screen.getByText("load").click();
        });
        await act(async () => {
            screen.getByText("read").click();
        });

        expect(screen.getByTestId("count").textContent).toBe("3");
    });

    it("rolls back and re-syncs when the request fails", async () => {
        countSpy.mockResolvedValue({ unread_count: 3 });
        listSpy.mockResolvedValue({ items: [item()], next_cursor: null });
        vi.spyOn(notificationService, "markNotificationRead").mockRejectedValue(
            new NotificationApiError(500, "No fue posible actualizar la notificación."),
        );

        renderProvider();
        await act(async () => {});
        await act(async () => {
            screen.getByText("load").click();
        });

        countSpy.mockClear();
        await act(async () => {
            screen.getByText("read").click();
        });

        expect(screen.getByTestId("count").textContent).toBe("3");
        expect(screen.getByTestId("error").textContent).toBe(
            "No fue posible actualizar la notificación.",
        );
        // Reconciled from the server rather than trusted locally.
        expect(countSpy).toHaveBeenCalled();
    });

    it("does not restore the unread row on a 404 — it really is gone", async () => {
        countSpy.mockResolvedValueOnce({ unread_count: 3 });
        listSpy.mockResolvedValue({ items: [item()], next_cursor: null });
        vi.spyOn(notificationService, "markNotificationRead").mockRejectedValue(
            new NotificationApiError(404, "La notificación ya no está disponible."),
        );

        renderProvider();
        await act(async () => {});
        await act(async () => {
            screen.getByText("load").click();
        });
        expect(screen.getByTestId("items-unread").textContent).toBe("1");

        // The server's own view after the failure.
        countSpy.mockResolvedValue({ unread_count: 2 });
        await act(async () => {
            screen.getByText("read").click();
        });

        // Rolling back would re-show a row the server says no longer exists;
        // the count comes from the reconciliation fetch, not local arithmetic.
        expect(screen.getByTestId("items-unread").textContent).toBe("0");
        expect(screen.getByTestId("count").textContent).toBe("2");
    });

    it("restores the unread row on a non-404 failure", async () => {
        countSpy.mockResolvedValue({ unread_count: 3 });
        listSpy.mockResolvedValue({ items: [item()], next_cursor: null });
        vi.spyOn(notificationService, "markNotificationRead").mockRejectedValue(
            new NotificationApiError(500, "No fue posible actualizar la notificación."),
        );

        renderProvider();
        await act(async () => {});
        await act(async () => {
            screen.getByText("load").click();
        });
        await act(async () => {
            screen.getByText("read").click();
        });

        expect(screen.getByTestId("items-unread").textContent).toBe("1");
    });

    it("decrements for a row the provider never loaded when told it was unread", async () => {
        // The history page's case: it holds a filtered, paginated list the
        // provider has not seen, so it passes the flag explicitly.
        countSpy.mockResolvedValue({ unread_count: 6 });
        vi.spyOn(notificationService, "markNotificationRead").mockResolvedValue({
            recipient_id: "unseen",
            status: "READ",
            read_at: "x",
        });

        function PageProbe() {
            const state = useNotifications();
            return (
                <div>
                    <span data-testid="page-count">{state.unreadCount}</span>
                    <button onClick={() => void state.markRead("unseen", true).catch(() => {})}>
                        page-read
                    </button>
                </div>
            );
        }

        renderProvider(<PageProbe />);
        await act(async () => {});
        await act(async () => {
            screen.getByText("page-read").click();
        });

        expect(screen.getByTestId("page-count").textContent).toBe("5");
    });
});

describe("markAllRead", () => {
    it("marks the loaded rows read and reconciles the count from the endpoint", async () => {
        countSpy.mockResolvedValueOnce({ unread_count: 12 });
        listSpy.mockResolvedValue({
            items: [item(), item({ recipient_id: "r2" })],
            next_cursor: null,
        });
        const allSpy = vi
            .spyOn(notificationService, "markAllNotificationsRead")
            .mockResolvedValue({ updated_count: 12 });

        renderProvider();
        await act(async () => {});
        await act(async () => {
            screen.getByText("load").click();
        });

        // The server's own count, not local arithmetic — the filtered set may
        // include rows this provider never loaded.
        countSpy.mockResolvedValue({ unread_count: 0 });
        await act(async () => {
            screen.getByText("read-all").click();
        });

        expect(allSpy).toHaveBeenCalled();
        expect(screen.getByTestId("count").textContent).toBe("0");
    });

    it("surfaces the error and re-syncs when it fails", async () => {
        countSpy.mockResolvedValue({ unread_count: 4 });
        vi.spyOn(notificationService, "markAllNotificationsRead").mockRejectedValue(
            new NotificationApiError(500, "No fue posible marcar las notificaciones como leídas."),
        );

        renderProvider();
        await act(async () => {});
        countSpy.mockClear();
        await act(async () => {
            screen.getByText("read-all").click();
        });

        expect(screen.getByTestId("error").textContent).toBe(
            "No fue posible marcar las notificaciones como leídas.",
        );
        expect(countSpy).toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// Consumers outside a provider
// ---------------------------------------------------------------------------

describe("inert default", () => {
    it("a consumer with no provider gets zero state and makes no request", async () => {
        render(<Probe />);
        await act(async () => {});

        expect(screen.getByTestId("count").textContent).toBe("0");
        expect(screen.getByTestId("items").textContent).toBe("0");
        expect(countSpy).not.toHaveBeenCalled();
        expect(listSpy).not.toHaveBeenCalled();
    });

    it("its actions are no-ops rather than throwing", async () => {
        render(<Probe />);

        await act(async () => {
            screen.getByText("load").click();
            screen.getByText("read").click();
            screen.getByText("read-all").click();
        });

        expect(screen.getByTestId("error").textContent).toBe("");
    });
});
