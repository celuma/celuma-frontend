/**
 * Céluma 1.3, Phase 4, Block F — the tenant usage API client.
 *
 * Mocks `fetch` (not `apiFetch`), so every assertion also exercises the shared
 * request layer: the Authorization header it injects and its
 * 401-means-session-expired / 403-means-permission-denied split.
 *
 * The structural assertions matter as much as the behavioural ones. The Block E
 * contract scopes the tenant by *not accepting one*, and these tests pin that
 * on the client side: neither call may put a tenant identifier on the wire, in
 * any position, ever.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    getTenantUsage,
    isTenantUsageApiError,
    isTenantUsageTimeoutError,
    reconcileTenantUsage,
    resolveReconcileTimeoutMs,
    DEFAULT_RECONCILE_TIMEOUT_MS,
    USAGE_RUNNING_POLL_INTERVAL_MS,
    __test__,
} from "../../services/tenant_usage_service";
import type { TenantUsageResponse } from "../../models/tenant_usage";

const { TENANT_USAGE_URL, TENANT_USAGE_RECONCILE_URL } = __test__;

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

/** An entirely uninitialized tenant — every nullable field actually null. */
const UNINITIALIZED: TenantUsageResponse = {
    storage: {
        initialized: false,
        billable_bytes: null,
        limit_bytes: null,
        unlimited: true,
        usage_ratio: null,
        usage_percent: null,
    },
    users: {
        registered_users: 0,
        active_internal_users: 0,
        active_physician_portal_users: 0,
        user_limit: null,
        unlimited: true,
        usage_ratio: null,
        usage_percent: null,
    },
    reconciliation: {
        has_run: false,
        integrity_status: "NOT_RUN",
        status: null,
        started_at: null,
        completed_at: null,
        expected_storage_bytes: null,
        actual_storage_bytes: null,
        difference_bytes: null,
        repaired: null,
        objects_checked: null,
        orphans_found: null,
        missing_objects_found: null,
        metadata_mismatches_found: null,
        error_code: null,
    },
};

beforeEach(() => {
    localStorage.setItem("auth_token", "Bearer test-token");
});

afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Wire format
// ---------------------------------------------------------------------------

describe("endpoint URLs", () => {
    it("reads from /tenant/usage", async () => {
        const fetchMock = mockFetch(jsonResponse(200, UNINITIALIZED));

        await getTenantUsage();

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe(TENANT_USAGE_URL);
        expect(url).toMatch(/\/v1\/tenant\/usage$/);
        expect(init.method).toBe("GET");
    });

    it("reconciles through /tenant/usage/reconcile with no body", async () => {
        const fetchMock = mockFetch(jsonResponse(200, { status: "SUCCEEDED", error_code: null }));

        await reconcileTenantUsage();

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe(TENANT_USAGE_RECONCILE_URL);
        expect(url).toMatch(/\/v1\/tenant\/usage\/reconcile$/);
        expect(init.method).toBe("POST");
        expect(init.body).toBeUndefined();
    });

    it("sends the stored Authorization header", async () => {
        const fetchMock = mockFetch(jsonResponse(200, UNINITIALIZED));

        await getTenantUsage();

        expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer test-token");
    });
});

describe("tenant scoping", () => {
    // The endpoint derives the tenant from the authenticated user and accepts
    // no identifier in any position; a client that sent one would be inventing
    // a parameter the API does not have.
    it("never puts a tenant identifier on the wire", async () => {
        const fetchMock = mockFetch(jsonResponse(200, UNINITIALIZED));
        await getTenantUsage();

        mockFetch(jsonResponse(200, { status: "SUCCEEDED", error_code: null }));
        await reconcileTenantUsage();

        for (const call of fetchMock.mock.calls) {
            const [url, init] = call;
            expect(String(url)).not.toContain("tenant_id");
            expect(String(url)).not.toContain("?");
            expect(init.body ?? "").not.toContain("tenant_id");
        }
    });

    it("takes no arguments — the signatures have nowhere to put one", () => {
        expect(getTenantUsage.length).toBe(0);
        expect(reconcileTenantUsage.length).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

describe("response parsing", () => {
    it("preserves every nullable field rather than defaulting it to zero", async () => {
        mockFetch(jsonResponse(200, UNINITIALIZED));

        const usage = await getTenantUsage();

        expect(usage.storage.initialized).toBe(false);
        expect(usage.storage.billable_bytes).toBeNull();
        expect(usage.storage.limit_bytes).toBeNull();
        expect(usage.storage.usage_ratio).toBeNull();
        expect(usage.storage.usage_percent).toBeNull();
        expect(usage.users.user_limit).toBeNull();
        expect(usage.users.usage_percent).toBeNull();
        expect(usage.reconciliation.status).toBeNull();
        expect(usage.reconciliation.orphans_found).toBeNull();
        expect(usage.reconciliation.missing_objects_found).toBeNull();
        expect(usage.reconciliation.metadata_mismatches_found).toBeNull();
        expect(usage.reconciliation.error_code).toBeNull();
    });

    it("keeps an over-limit percentage unclamped", async () => {
        mockFetch(
            jsonResponse(200, {
                ...UNINITIALIZED,
                storage: {
                    initialized: true,
                    billable_bytes: 1200,
                    limit_bytes: 1000,
                    unlimited: false,
                    usage_ratio: 1.2,
                    usage_percent: 120,
                },
            }),
        );

        const usage = await getTenantUsage();

        expect(usage.storage.usage_percent).toBe(120);
        expect(usage.storage.usage_ratio).toBe(1.2);
    });
});

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

describe("error mapping", () => {
    it("surfaces 403 as a permission error, not a logout", async () => {
        mockFetch(jsonResponse(403, { detail: "Permission required: admin:manage_tenant" }));

        await expect(getTenantUsage()).rejects.toMatchObject({
            name: "TenantUsageApiError",
            status: 403,
        });
        expect(window.localStorage.getItem("auth_token")).toBe("Bearer test-token");
    });

    it("carries 409 structurally so the page can tell 'already running' apart", async () => {
        mockFetch(jsonResponse(409, { detail: "Reconciliation already running" }));

        await reconcileTenantUsage().then(
            () => expect.unreachable("should have rejected"),
            (err) => {
                expect(isTenantUsageApiError(err)).toBe(true);
                expect(isTenantUsageApiError(err) && err.status).toBe(409);
                expect((err as Error).message).toBe("Ya hay una verificación en curso.");
            },
        );
    });

    it("never leaks the backend's developer-facing detail into the message", async () => {
        mockFetch(jsonResponse(500, { detail: "psycopg2.OperationalError at 10.0.0.4:5432" }));

        await expect(getTenantUsage()).rejects.toThrow(
            "Error del servidor. Inténtalo de nuevo más tarde.",
        );
    });

    it("re-throws the 401 session sentinel untouched", async () => {
        // apiFetch redirects on 401; jsdom cannot navigate, so location is
        // stubbed the way the notification-service tests already do it.
        const assign = vi.fn();
        vi.stubGlobal("location", { ...window.location, pathname: "/config/usage", assign });
        mockFetch(jsonResponse(401, { detail: "Not authenticated" }));

        await expect(getTenantUsage()).rejects.toThrow("Session expired");
        expect(assign).toHaveBeenCalledOnce();
    });

    it("reports a network failure without exposing the raw fetch error", async () => {
        mockFetch(new TypeError("Failed to fetch"));

        await expect(getTenantUsage()).rejects.toThrow(/Error de red/);
    });
});

describe("client timeout", () => {
    it("turns an aborted reconciliation into a timeout, not a failure", async () => {
        const abortError = new Error("The operation was aborted.");
        abortError.name = "AbortError";
        mockFetch(abortError);

        await reconcileTenantUsage().then(
            () => expect.unreachable("should have rejected"),
            (err) => {
                // The distinction the whole state is for: a timeout is the
                // absence of a result, never the result "it failed".
                expect(isTenantUsageTimeoutError(err)).toBe(true);
                expect(isTenantUsageApiError(err)).toBe(false);
                expect((err as Error).message).not.toMatch(/falló/i);
            },
        );
    });

    it("passes an abort signal so a slow run cannot hang the button forever", async () => {
        const fetchMock = mockFetch(jsonResponse(200, { status: "SUCCEEDED", error_code: null }));

        await reconcileTenantUsage();

        expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
        expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(false);
    });

    it("defaults to a generous deadline and ignores a nonsense override", () => {
        expect(resolveReconcileTimeoutMs(undefined)).toBe(DEFAULT_RECONCILE_TIMEOUT_MS);
        expect(resolveReconcileTimeoutMs("0")).toBe(DEFAULT_RECONCILE_TIMEOUT_MS);
        expect(resolveReconcileTimeoutMs("not-a-number")).toBe(DEFAULT_RECONCILE_TIMEOUT_MS);
        expect(resolveReconcileTimeoutMs("240000")).toBe(240_000);
        // A synchronous run that HEADs every object needs minutes, not seconds.
        expect(DEFAULT_RECONCILE_TIMEOUT_MS).toBeGreaterThanOrEqual(60_000);
    });
});

describe("polling cadence", () => {
    it("stays inside the contract's 5–10 s window for a RUNNING run", () => {
        expect(USAGE_RUNNING_POLL_INTERVAL_MS).toBeGreaterThanOrEqual(5_000);
        expect(USAGE_RUNNING_POLL_INTERVAL_MS).toBeLessThanOrEqual(10_000);
    });
});
