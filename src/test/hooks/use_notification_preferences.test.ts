/**
 * Céluma 1.3, Phase 3, Block D — the Profile preferences hook.
 *
 * The single most important assertion in this file is a negative one: **this
 * hook adds no interval.** Block C's `NotificationProvider` is the
 * application's only polling owner, and a preferences screen that quietly
 * started a second one would double the notification traffic against a shared
 * 100-request/60s budget while giving the badge a second source of truth.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useNotificationPreferences } from "../../hooks/use_notification_preferences";
import {
    getNotificationPreferences,
    updateNotificationPreferences,
} from "../../services/notification_preference_service";
import type { NotificationPreferenceItem } from "../../models/notification_preference";
import type { NotificationType } from "../../models/notification";

vi.mock("../../services/notification_preference_service", () => ({
    getNotificationPreferences: vi.fn(),
    updateNotificationPreferences: vi.fn(),
}));

const mockedGet = vi.mocked(getNotificationPreferences);
const mockedUpdate = vi.mocked(updateNotificationPreferences);

function preference(
    notification_type: NotificationType,
    overrides: Partial<NotificationPreferenceItem> = {},
): NotificationPreferenceItem {
    return {
        notification_type,
        in_app_enabled: true,
        email_enabled: true,
        email_supported: true,
        is_explicit: false,
        updated_at: null,
        ...overrides,
    };
}

const DEFAULT_LIST: NotificationPreferenceItem[] = [
    preference("REPORT_SUBMITTED"),
    preference("REPORT_PUBLISHED"),
    preference("SAMPLE_STATUS_CHANGED", {
        email_supported: false,
        email_enabled: false,
    }),
];

beforeEach(() => {
    localStorage.setItem("auth_token", "Bearer test-token");
    mockedGet.mockResolvedValue({ preferences: DEFAULT_LIST });
    mockedUpdate.mockResolvedValue({ preferences: DEFAULT_LIST });
});

afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
});

async function renderLoaded() {
    const view = renderHook(() => useNotificationPreferences());
    await waitFor(() => expect(view.result.current.preferences).toHaveLength(3));
    return view;
}

describe("loading", () => {
    it("loads once on mount", async () => {
        await renderLoaded();

        expect(mockedGet).toHaveBeenCalledTimes(1);
    });

    it("does not fetch before a token exists", async () => {
        localStorage.clear();

        const { result } = renderHook(() => useNotificationPreferences());
        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(mockedGet).not.toHaveBeenCalled();
    });

    it("adds no interval", async () => {
        // The structural rule from Block C: exactly one polling owner.
        //
        // Mounted without `waitFor`, deliberately: Testing Library's own
        // `waitFor` schedules a real-timer poll, and counting that would make
        // this assert something about the test helper rather than the hook.
        const setIntervalSpy = vi.spyOn(globalThis, "setInterval");

        const { unmount } = renderHook(() => useNotificationPreferences());
        await act(async () => {
            await Promise.resolve();
        });

        expect(setIntervalSpy).not.toHaveBeenCalled();
        unmount();
        setIntervalSpy.mockRestore();
    });

    it("does not re-fetch as time passes", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        try {
            await renderLoaded();
            await act(async () => {
                await vi.advanceTimersByTimeAsync(120_000);
            });

            expect(mockedGet).toHaveBeenCalledTimes(1);
        } finally {
            vi.useRealTimers();
        }
    });

    it("does not re-fetch on a re-render", async () => {
        const { rerender, result } = renderHook(() => useNotificationPreferences());
        await waitFor(() => expect(result.current.preferences).toHaveLength(3));

        rerender();
        rerender();

        expect(mockedGet).toHaveBeenCalledTimes(1);
    });

    it("surfaces a load failure without throwing", async () => {
        mockedGet.mockRejectedValue(new Error("No fue posible cargar tus preferencias."));

        const { result } = renderHook(() => useNotificationPreferences());
        await waitFor(() => expect(result.current.error).not.toBeNull());

        expect(result.current.preferences).toEqual([]);
        expect(result.current.loading).toBe(false);
    });

    it("ignores a response that resolves after unmount", async () => {
        let resolve!: (value: { preferences: NotificationPreferenceItem[] }) => void;
        mockedGet.mockReturnValue(
            new Promise((r) => {
                resolve = r;
            }),
        );
        const errors = vi.spyOn(console, "error").mockImplementation(() => {});

        const { unmount } = renderHook(() => useNotificationPreferences());
        unmount();
        await act(async () => {
            resolve({ preferences: DEFAULT_LIST });
        });

        expect(errors).not.toHaveBeenCalled();
        errors.mockRestore();
    });

    it("reload() fetches again on demand", async () => {
        const { result } = await renderLoaded();

        await act(async () => {
            await result.current.reload();
        });

        expect(mockedGet).toHaveBeenCalledTimes(2);
    });
});

describe("editing", () => {
    it("starts clean", async () => {
        const { result } = await renderLoaded();

        expect(result.current.dirty).toBe(false);
    });

    it("toggling a supported type edits local state and becomes dirty", async () => {
        const { result } = await renderLoaded();

        act(() => {
            result.current.setEmailEnabled("REPORT_PUBLISHED", false);
        });

        expect(result.current.dirty).toBe(true);
        expect(
            result.current.preferences.find(
                (item) => item.notification_type === "REPORT_PUBLISHED",
            )?.email_enabled,
        ).toBe(false);
        // Local only: nothing is written until save().
        expect(mockedUpdate).not.toHaveBeenCalled();
    });

    it("toggling back to the loaded value is no longer dirty", async () => {
        const { result } = await renderLoaded();

        act(() => {
            result.current.setEmailEnabled("REPORT_PUBLISHED", false);
        });
        act(() => {
            result.current.setEmailEnabled("REPORT_PUBLISHED", true);
        });

        expect(result.current.dirty).toBe(false);
    });

    it("refuses to change a type the backend says cannot use email", async () => {
        // So the client can never build a request the API would answer 422 to.
        const { result } = await renderLoaded();

        act(() => {
            result.current.setEmailEnabled("SAMPLE_STATUS_CHANGED", true);
        });

        expect(result.current.dirty).toBe(false);
        expect(
            result.current.preferences.find(
                (item) => item.notification_type === "SAMPLE_STATUS_CHANGED",
            )?.email_enabled,
        ).toBe(false);
    });

    it("reset() restores the last backend values, not the global defaults", async () => {
        mockedGet.mockResolvedValue({
            preferences: [
                preference("REPORT_SUBMITTED", { email_enabled: false, is_explicit: true }),
                preference("REPORT_PUBLISHED"),
                preference("SAMPLE_STATUS_CHANGED", {
                    email_supported: false,
                    email_enabled: false,
                }),
            ],
        });
        const { result } = await renderLoaded();

        act(() => {
            result.current.setEmailEnabled("REPORT_SUBMITTED", true);
            result.current.setEmailEnabled("REPORT_PUBLISHED", false);
        });
        act(() => {
            result.current.reset();
        });

        expect(result.current.dirty).toBe(false);
        // The stored override is still off — reset is not "restore defaults".
        expect(
            result.current.preferences.find(
                (item) => item.notification_type === "REPORT_SUBMITTED",
            )?.email_enabled,
        ).toBe(false);
    });
});

describe("saving", () => {
    it("sends only the changed types", async () => {
        const { result } = await renderLoaded();

        act(() => {
            result.current.setEmailEnabled("REPORT_PUBLISHED", false);
        });
        await act(async () => {
            await result.current.save();
        });

        expect(mockedUpdate).toHaveBeenCalledWith({
            preferences: [
                { notification_type: "REPORT_PUBLISHED", email_enabled: false },
            ],
        });
    });

    it("sends one batch, not one request per switch", async () => {
        const { result } = await renderLoaded();

        act(() => {
            result.current.setEmailEnabled("REPORT_PUBLISHED", false);
            result.current.setEmailEnabled("REPORT_SUBMITTED", false);
        });
        await act(async () => {
            await result.current.save();
        });

        expect(mockedUpdate).toHaveBeenCalledTimes(1);
        expect(mockedUpdate.mock.calls[0][0].preferences).toHaveLength(2);
    });

    it("does nothing when there is nothing to save", async () => {
        const { result } = await renderLoaded();

        await act(async () => {
            await result.current.save();
        });

        expect(mockedUpdate).not.toHaveBeenCalled();
    });

    it("replaces local state with the backend's effective response", async () => {
        // The server knows things the client cannot predict: which rows it
        // deleted for matching the default, and which values policy bounded.
        mockedUpdate.mockResolvedValue({
            preferences: [
                preference("REPORT_SUBMITTED"),
                preference("REPORT_PUBLISHED", {
                    email_enabled: false,
                    is_explicit: true,
                    updated_at: "2026-08-06T12:00:00",
                }),
                preference("SAMPLE_STATUS_CHANGED", {
                    email_supported: false,
                    email_enabled: false,
                }),
            ],
        });
        const { result } = await renderLoaded();

        act(() => {
            result.current.setEmailEnabled("REPORT_PUBLISHED", false);
        });
        await act(async () => {
            await result.current.save();
        });

        const saved = result.current.preferences.find(
            (item) => item.notification_type === "REPORT_PUBLISHED",
        );
        expect(saved?.is_explicit).toBe(true);
        expect(saved?.updated_at).toBe("2026-08-06T12:00:00");
        expect(result.current.dirty).toBe(false);
    });

    it("keeps the user's edits when the save fails", async () => {
        // The backend applies a batch atomically, so a rejection means
        // nothing was applied — discarding the edits would lose the user's
        // work and show them values they did not choose.
        mockedUpdate.mockRejectedValue(new Error("No fue posible guardar."));
        const { result } = await renderLoaded();

        act(() => {
            result.current.setEmailEnabled("REPORT_PUBLISHED", false);
        });
        await act(async () => {
            await expect(result.current.save()).rejects.toThrow();
        });

        expect(result.current.dirty).toBe(true);
        expect(
            result.current.preferences.find(
                (item) => item.notification_type === "REPORT_PUBLISHED",
            )?.email_enabled,
        ).toBe(false);
        expect(result.current.error).not.toBeNull();
        expect(result.current.saving).toBe(false);
    });

    it("re-throws the session-expiry sentinel untouched", async () => {
        mockedUpdate.mockRejectedValue(new Error("Session expired"));
        const { result } = await renderLoaded();

        act(() => {
            result.current.setEmailEnabled("REPORT_PUBLISHED", false);
        });
        await act(async () => {
            await expect(result.current.save()).rejects.toThrow("Session expired");
        });
    });
});

describe("isolation from the Notification Center", () => {
    it("never calls an inbox endpoint", async () => {
        const { result } = await renderLoaded();

        act(() => {
            result.current.setEmailEnabled("REPORT_PUBLISHED", false);
        });
        await act(async () => {
            await result.current.save();
        });

        // The mocked module is the *preference* service; if the hook reached
        // for the inbox it would have to import the other one, which this
        // file does not mock and which would hit a real fetch.
        expect(mockedGet).toHaveBeenCalledTimes(1);
        expect(mockedUpdate).toHaveBeenCalledTimes(1);
    });

    it("imports nothing from the notification provider", async () => {
        const source = await import("../../hooks/use_notification_preferences?raw");
        const text = String(source.default);

        expect(text).not.toContain("notification_provider");
        expect(text).not.toContain("useNotifications");
        expect(text).not.toContain("setInterval");
    });
});
