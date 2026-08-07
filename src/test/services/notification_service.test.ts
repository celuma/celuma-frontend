/**
 * Céluma 1.3, Phase 3, Block C — the notification API client.
 *
 * Mocks `fetch` (not `apiFetch`), so every assertion also exercises the shared
 * request layer: the Authorization header it injects, and — critically — its
 * 401-means-session-expired / 403-means-permission-denied split.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    getUnreadNotificationCount,
    isNotificationApiError,
    listNotifications,
    markAllNotificationsRead,
    markNotificationRead,
    NotificationApiError,
    __test__,
} from "../../services/notification_service";

const { buildNotificationQuery } = __test__;

const RECIPIENT_ID = "8f1c0000-1111-2222-3333-444444444444";

function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

function mockFetch(response: Response | Error) {
    const fn =
        response instanceof Error
            ? vi.fn().mockRejectedValue(response)
            : vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fn);
    return fn;
}

beforeEach(() => {
    localStorage.setItem("auth_token", "Bearer test-token");
});

afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Query construction
// ---------------------------------------------------------------------------

describe("buildNotificationQuery", () => {
    it("is empty when no filter is set", () => {
        expect(buildNotificationQuery({})).toBe("");
    });

    it("repeats `type` once per value rather than comma-joining", () => {
        // The API declares type as list[NotificationType]; a comma-joined single
        // value answers 422, and the contract defines no comma form.
        const query = buildNotificationQuery({ types: ["REPORT_PUBLISHED", "REPORT_RETRACTED"] });

        expect(query).toBe("?type=REPORT_PUBLISHED&type=REPORT_RETRACTED");
        expect(query).not.toContain(",");
    });

    it("forwards the opaque cursor verbatim, percent-encoded", () => {
        const cursor = "MjAyNi0wOC0wNFQxMjowMDowMHw4ZjFj+/=";
        const query = buildNotificationQuery({ cursor });

        expect(new URLSearchParams(query.slice(1)).get("cursor")).toBe(cursor);
    });

    it("emits unread_only only when true", () => {
        expect(buildNotificationQuery({ unreadOnly: true })).toBe("?unread_only=true");
        expect(buildNotificationQuery({ unreadOnly: false })).toBe("");
    });

    it("forwards limit, since and until", () => {
        const query = buildNotificationQuery({
            limit: 20,
            since: "2026-08-01T00:00:00",
            until: "2026-08-05T00:00:00",
        });
        const params = new URLSearchParams(query.slice(1));

        expect(params.get("limit")).toBe("20");
        expect(params.get("since")).toBe("2026-08-01T00:00:00");
        expect(params.get("until")).toBe("2026-08-05T00:00:00");
    });

    it("never emits a parameter the API does not accept", () => {
        const query = buildNotificationQuery({
            cursor: "c",
            limit: 5,
            unreadOnly: true,
            types: ["REPORT_PUBLISHED"],
            since: "s",
            until: "u",
        });

        for (const forbidden of ["severity", "sort", "tenant_id", "user_id"]) {
            expect(query).not.toContain(forbidden);
        }
    });
});

// ---------------------------------------------------------------------------
// listNotifications
// ---------------------------------------------------------------------------

describe("listNotifications", () => {
    it("GETs /notifications and returns items plus the cursor", async () => {
        const fetchMock = mockFetch(
            jsonResponse(200, {
                items: [{ recipient_id: "r1", notification_id: "n1", title: "Hola" }],
                next_cursor: "CURSOR",
            }),
        );

        const result = await listNotifications();

        expect(result.items).toHaveLength(1);
        expect(result.next_cursor).toBe("CURSOR");
        const [url, init] = fetchMock.mock.calls[0];
        expect(String(url)).toContain("/v1/notifications");
        expect(init.method).toBe("GET");
    });

    it("sends the Authorization header injected by apiFetch", async () => {
        const fetchMock = mockFetch(jsonResponse(200, { items: [], next_cursor: null }));

        await listNotifications();

        const [, init] = fetchMock.mock.calls[0];
        expect(init.headers.Authorization).toBe("Bearer test-token");
    });

    it("forwards a cursor for the next page", async () => {
        const fetchMock = mockFetch(jsonResponse(200, { items: [], next_cursor: null }));

        await listNotifications({ cursor: "PAGE2", limit: 20 });

        expect(String(fetchMock.mock.calls[0][0])).toContain("cursor=PAGE2");
    });

    it("maps 400 (bad cursor / bad limit / inverted range) to a Spanish message", async () => {
        mockFetch(jsonResponse(400, { detail: "Invalid cursor" }));

        await expect(listNotifications({ cursor: "junk" })).rejects.toThrow(
            "Los parámetros de la consulta no son válidos.",
        );
    });

    it("maps 422 (unknown type value) to a filter message", async () => {
        mockFetch(jsonResponse(422, { detail: [{ msg: "value is not a valid enumeration member" }] }));

        await expect(listNotifications({ types: ["NOPE"] })).rejects.toThrow(
            "Los filtros seleccionados no son válidos.",
        );
    });

    it("wraps a network failure rather than surfacing 'Failed to fetch'", async () => {
        mockFetch(new TypeError("Failed to fetch"));

        await expect(listNotifications()).rejects.toThrow(/Error de red/);
    });

    it("never leaks the backend's detail string into the thrown message", async () => {
        mockFetch(
            jsonResponse(500, { detail: "psycopg2.errors.UndefinedTable: relation does not exist" }),
        );

        await expect(listNotifications()).rejects.toThrow("Error del servidor. Inténtalo de nuevo más tarde.");
        await expect(listNotifications()).rejects.not.toThrow(/psycopg2/);
    });
});

// ---------------------------------------------------------------------------
// getUnreadNotificationCount
// ---------------------------------------------------------------------------

describe("getUnreadNotificationCount", () => {
    it("GETs /notifications/unread-count", async () => {
        const fetchMock = mockFetch(jsonResponse(200, { unread_count: 4 }));

        const result = await getUnreadNotificationCount();

        expect(result.unread_count).toBe(4);
        expect(String(fetchMock.mock.calls[0][0])).toContain("/v1/notifications/unread-count");
    });

    it("sends no query parameters — the endpoint takes none", async () => {
        const fetchMock = mockFetch(jsonResponse(200, { unread_count: 0 }));

        await getUnreadNotificationCount();

        expect(String(fetchMock.mock.calls[0][0])).not.toContain("?");
    });
});

// ---------------------------------------------------------------------------
// markNotificationRead
// ---------------------------------------------------------------------------

describe("markNotificationRead", () => {
    it("POSTs to /notifications/{recipient_id}/read", async () => {
        const fetchMock = mockFetch(
            jsonResponse(200, { recipient_id: RECIPIENT_ID, status: "READ", read_at: "2026-08-05T23:10:04" }),
        );

        const result = await markNotificationRead(RECIPIENT_ID);

        expect(result.status).toBe("READ");
        const [url, init] = fetchMock.mock.calls[0];
        expect(String(url)).toContain(`/v1/notifications/${RECIPIENT_ID}/read`);
        expect(init.method).toBe("POST");
    });

    it("sends no request body — the endpoint takes none", async () => {
        const fetchMock = mockFetch(
            jsonResponse(200, { recipient_id: RECIPIENT_ID, status: "READ", read_at: "x" }),
        );

        await markNotificationRead(RECIPIENT_ID);

        expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
    });

    it("maps 404 (stale, foreign or malformed recipient id) to a Spanish message", async () => {
        mockFetch(jsonResponse(404, { detail: "Not found" }));

        await expect(markNotificationRead("gone")).rejects.toThrow(
            "La notificación ya no está disponible.",
        );
    });

    it("exposes the status on the thrown error so callers can branch on 404", async () => {
        mockFetch(jsonResponse(404, { detail: "Not found" }));

        try {
            await markNotificationRead("gone");
            expect.unreachable("should have thrown");
        } catch (err) {
            expect(isNotificationApiError(err)).toBe(true);
            expect((err as NotificationApiError).status).toBe(404);
        }
    });
});

// ---------------------------------------------------------------------------
// markAllNotificationsRead
// ---------------------------------------------------------------------------

describe("markAllNotificationsRead", () => {
    it("POSTs to /notifications/read-all and returns the updated count", async () => {
        const fetchMock = mockFetch(jsonResponse(200, { updated_count: 12 }));

        const result = await markAllNotificationsRead();

        expect(result.updated_count).toBe(12);
        const [url, init] = fetchMock.mock.calls[0];
        expect(String(url)).toContain("/v1/notifications/read-all");
        expect(init.method).toBe("POST");
    });

    it("narrows by the active type filters", async () => {
        const fetchMock = mockFetch(jsonResponse(200, { updated_count: 3 }));

        await markAllNotificationsRead({ types: ["REPORT_PUBLISHED", "REPORT_RETRACTED"] });

        const url = String(fetchMock.mock.calls[0][0]);
        expect(url).toContain("type=REPORT_PUBLISHED");
        expect(url).toContain("type=REPORT_RETRACTED");
    });

    it("forwards since/until", async () => {
        const fetchMock = mockFetch(jsonResponse(200, { updated_count: 1 }));

        await markAllNotificationsRead({ since: "2026-08-01T00:00:00", until: "2026-08-05T00:00:00" });

        const url = String(fetchMock.mock.calls[0][0]);
        expect(url).toContain("since=");
        expect(url).toContain("until=");
    });

    it("never sends unread_only — the endpoint rejects it", async () => {
        const fetchMock = mockFetch(jsonResponse(200, { updated_count: 0 }));

        // Even if a caller passed the shape of a list filter, the read-all
        // filter type has no unreadOnly field and none is emitted.
        await markAllNotificationsRead({ types: ["REPORT_PUBLISHED"] });

        expect(String(fetchMock.mock.calls[0][0])).not.toContain("unread_only");
    });

    it("maps 400 (inverted date range) to a Spanish message", async () => {
        mockFetch(jsonResponse(400, { detail: "since must be <= until" }));

        await expect(
            markAllNotificationsRead({ since: "2026-08-05T00:00:00", until: "2026-08-01T00:00:00" }),
        ).rejects.toThrow("Los parámetros de la consulta no son válidos.");
    });
});

// ---------------------------------------------------------------------------
// Authentication status handling
// ---------------------------------------------------------------------------

describe("401 vs 403 — the shared request layer's split", () => {
    it("401 clears the session and redirects, throwing the sentinel", async () => {
        const assign = vi.fn();
        vi.stubGlobal("location", { ...window.location, pathname: "/notifications", assign });
        mockFetch(jsonResponse(401, { detail: "Not authenticated" }));

        await expect(listNotifications()).rejects.toThrow("Session expired");

        // The token is cleared and the user is sent to login with the reason —
        // the notifications API answers 401 (unlike the other routers' 403), so
        // this is the path a missing/expired token takes.
        expect(localStorage.getItem("auth_token")).toBeNull();
        expect(assign).toHaveBeenCalledTimes(1);
        expect(String(assign.mock.calls[0][0])).toContain("/login?reason=session_expired");
    });

    it("403 is a permission error — it does NOT clear the session or redirect", async () => {
        const assign = vi.fn();
        vi.stubGlobal("location", { ...window.location, pathname: "/notifications", assign });
        mockFetch(jsonResponse(403, { detail: "Permission required" }));

        await expect(listNotifications()).rejects.toThrow(
            "No tienes permiso para realizar esta acción.",
        );

        // This is the regression guard for the legacy platform-wide behaviour:
        // seventeen other routers answer 403 for a missing header. Treating 403
        // as "log out" would sign users out of Céluma on an ordinary permission
        // denial.
        expect(localStorage.getItem("auth_token")).toBe("Bearer test-token");
        expect(assign).not.toHaveBeenCalled();
    });

    it("the 401 sentinel is distinguishable from an API error", async () => {
        vi.stubGlobal("location", { ...window.location, pathname: "/n", assign: vi.fn() });
        mockFetch(jsonResponse(401, {}));

        try {
            await getUnreadNotificationCount();
            expect.unreachable("should have thrown");
        } catch (err) {
            // Not a NotificationApiError: callers must not treat a redirect as
            // a recoverable API failure and show a toast on top of it.
            expect(isNotificationApiError(err)).toBe(false);
            expect((err as Error).message).toBe("Session expired");
        }
    });
});
