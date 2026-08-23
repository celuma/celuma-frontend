/**
 * Céluma 1.3, Phase 3, Block D — the notification-preference API client.
 *
 * Mocks `fetch` rather than `apiFetch`, so every assertion also exercises the
 * shared request layer: the Authorization header it injects and — critically —
 * its 401-means-session-expired / 403-means-permission-denied split. A
 * notification-preferences-local copy of that logic would be a second,
 * divergent logout path.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    NotificationPreferenceApiError,
    getNotificationPreferences,
    isNotificationPreferenceApiError,
    updateNotificationPreferences,
} from "../../services/notification_preference_service";
import type { NotificationPreferenceItem } from "../../models/notification_preference";

function preference(
    overrides: Partial<NotificationPreferenceItem> = {},
): NotificationPreferenceItem {
    return {
        notification_type: "REPORT_PUBLISHED",
        in_app_enabled: true,
        email_enabled: true,
        email_supported: true,
        is_explicit: false,
        updated_at: null,
        ...overrides,
    };
}

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

describe("getNotificationPreferences", () => {
    it("GETs the preference path and returns the parsed list", async () => {
        const fetchMock = mockFetch(
            jsonResponse(200, { preferences: [preference()] }),
        );

        const result = await getNotificationPreferences();

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toContain("/v1/notification-preferences");
        expect(init.method).toBe("GET");
        expect(result.preferences).toHaveLength(1);
    });

    it("sends the Authorization header apiFetch injects", async () => {
        const fetchMock = mockFetch(jsonResponse(200, { preferences: [] }));

        await getNotificationPreferences();

        expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer test-token");
    });

    it("never sends a tenant or user parameter", async () => {
        // There is nothing to send one *with* — the function takes no
        // arguments — but the URL is asserted so a future "convenience"
        // parameter cannot be added without this failing.
        const fetchMock = mockFetch(jsonResponse(200, { preferences: [] }));

        await getNotificationPreferences();

        const url = String(fetchMock.mock.calls[0][0]);
        expect(url).not.toContain("user_id");
        expect(url).not.toContain("tenant_id");
        expect(url).not.toContain("?");
    });
});

describe("updateNotificationPreferences", () => {
    it("PUTs only the changed types", async () => {
        const fetchMock = mockFetch(
            jsonResponse(200, { preferences: [preference({ email_enabled: false })] }),
        );

        await updateNotificationPreferences({
            preferences: [
                { notification_type: "REPORT_PUBLISHED", email_enabled: false },
            ],
        });

        const [, init] = fetchMock.mock.calls[0];
        expect(init.method).toBe("PUT");
        expect(JSON.parse(init.body)).toEqual({
            preferences: [
                { notification_type: "REPORT_PUBLISHED", email_enabled: false },
            ],
        });
    });

    it("never sends in_app_enabled, a user id or a tenant id", async () => {
        const fetchMock = mockFetch(jsonResponse(200, { preferences: [] }));

        await updateNotificationPreferences({
            preferences: [
                { notification_type: "REPORT_SUBMITTED", email_enabled: false },
            ],
        });

        const body = String(fetchMock.mock.calls[0][1].body);
        expect(body).not.toContain("in_app_enabled");
        expect(body).not.toContain("user_id");
        expect(body).not.toContain("tenant_id");
        expect(body).not.toContain("channel");
    });

    it("returns the server's full effective list", async () => {
        mockFetch(
            jsonResponse(200, {
                preferences: [
                    preference({ notification_type: "REPORT_SUBMITTED" }),
                    preference({
                        notification_type: "SAMPLE_STATUS_CHANGED",
                        email_supported: false,
                        email_enabled: false,
                    }),
                ],
            }),
        );

        const result = await updateNotificationPreferences({
            preferences: [
                { notification_type: "REPORT_SUBMITTED", email_enabled: true },
            ],
        });

        expect(result.preferences).toHaveLength(2);
        expect(result.preferences[1].email_supported).toBe(false);
    });
});

describe("error handling", () => {
    it("clears the session and redirects on 401", async () => {
        const assign = vi.fn();
        vi.stubGlobal("location", { ...window.location, assign, pathname: "/profile" });
        mockFetch(jsonResponse(401, { detail: "Not authenticated" }));

        await expect(getNotificationPreferences()).rejects.toThrow("Session expired");

        expect(localStorage.getItem("auth_token")).toBeNull();
        expect(assign).toHaveBeenCalledWith(
            expect.stringContaining("/login?reason=session_expired"),
        );
    });

    it("does NOT treat 403 as a session expiry", async () => {
        // Seventeen legacy routers answer 403 for a missing header; treating
        // that as logout would sign users out on an ordinary permission
        // denial anywhere in Céluma.
        const assign = vi.fn();
        vi.stubGlobal("location", { ...window.location, assign, pathname: "/profile" });
        mockFetch(jsonResponse(403, { detail: "Forbidden" }));

        await expect(getNotificationPreferences()).rejects.toThrow(
            "No tienes permiso para realizar esta acción.",
        );

        expect(localStorage.getItem("auth_token")).toBe("Bearer test-token");
        expect(assign).not.toHaveBeenCalled();
    });

    it("maps 422 to a fixed Spanish message", async () => {
        mockFetch(
            jsonResponse(422, {
                detail: "Email delivery is not available for SAMPLE_STATUS_CHANGED",
            }),
        );

        await expect(
            updateNotificationPreferences({
                preferences: [
                    { notification_type: "SAMPLE_STATUS_CHANGED", email_enabled: true },
                ],
            }),
        ).rejects.toThrow("Las preferencias seleccionadas no son válidas.");
    });

    it("never shows the backend detail string", async () => {
        mockFetch(
            jsonResponse(500, {
                detail: 'psycopg2.errors.UndefinedColumn: column "x" does not exist',
            }),
        );

        await expect(getNotificationPreferences()).rejects.toThrow(
            "Error del servidor. Inténtalo de nuevo más tarde.",
        );
        await expect(getNotificationPreferences()).rejects.not.toThrow(/psycopg2/);
    });

    it("reports a network failure in Spanish rather than as TypeError", async () => {
        mockFetch(new TypeError("Failed to fetch"));

        await expect(getNotificationPreferences()).rejects.toThrow(/Error de red/);
    });

    it("throws a typed error carrying .status", async () => {
        mockFetch(jsonResponse(429, { detail: "Too many requests" }));

        try {
            await getNotificationPreferences();
            expect.unreachable("should have thrown");
        } catch (err) {
            expect(isNotificationPreferenceApiError(err)).toBe(true);
            expect((err as NotificationPreferenceApiError).status).toBe(429);
        }
    });
});

describe("structural guarantees", () => {
    it("exports no method for anything Block D does not implement", async () => {
        const module = await import("../../services/notification_preference_service");
        const exported = Object.keys(module).sort();

        expect(exported).toEqual([
            "NotificationPreferenceApiError",
            "getNotificationPreferences",
            "isNotificationPreferenceApiError",
            "updateNotificationPreferences",
        ]);
    });

    it("uses no raw fetch of its own", async () => {
        // Everything must go through apiFetch, which owns the 401 redirect.
        // A raw `fetch(` in this module would be a second, divergent path.
        const source = await import("../../services/notification_preference_service?raw");
        expect(String(source.default)).not.toMatch(/[^.\w]fetch\s*\(/);
    });
});
