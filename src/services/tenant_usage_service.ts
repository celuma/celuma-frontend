/**
 * Céluma 1.3, Phase 4, Block F — typed client for the two Block D/E usage
 * endpoints:
 *
 *   GET  /api/v1/tenant/usage
 *   POST /api/v1/tenant/usage/reconcile
 *
 * Nothing else exists under /tenant/usage — no history listing, no per-category
 * breakdown, no second reconciliation trigger, no cross-tenant surface. This
 * file must stay that short.
 *
 * **Neither call takes a tenant identifier.** The route is `/tenant/usage`, not
 * `/tenant/{id}/usage`, and the handler's signature accepts no tenant input in
 * any form, so a `tenantId` argument here would have nowhere to go
 * (usage-rbac-contract.md §4). The scoping is structural: whatever a caller
 * passes, they get their own tenant.
 *
 * Goes through the shared `apiFetch` for the same reason
 * notification_service.ts does: it is what turns a **401** into the central
 * session-expiry redirect while leaving **403** to surface as an ordinary
 * permission error. A service-local copy of that would be a second, divergent
 * logout path.
 */
import { apiFetch } from "../lib/api_fetch";
import { parseFastApiDetail } from "../lib/api_error";
import type { ReconciliationRunResponse, TenantUsageResponse } from "../models/tenant_usage";

const base = import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL as string) || "/api";

const TENANT_USAGE_URL = `${base}/v1/tenant/usage`;
const TENANT_USAGE_RECONCILE_URL = `${TENANT_USAGE_URL}/reconcile`;

/**
 * How long the client waits for a manual reconciliation before giving up on
 * *the response* — not on the run.
 *
 * The endpoint is synchronous and HEADs every billable object before answering,
 * so for a large tenant it can take minutes (implementation-summary.md §6.3).
 * Three minutes is deliberately generous; a caller that hits it must treat the
 * outcome as **unknown** and re-read `GET /tenant/usage`, because the run very
 * likely continues server-side. See `TenantUsageTimeoutError`.
 *
 * Overridable through a non-secret Vite variable so a slow local environment
 * can raise it without a code change.
 */
export const DEFAULT_RECONCILE_TIMEOUT_MS = 180_000;

export function resolveReconcileTimeoutMs(raw: string | undefined): number {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_RECONCILE_TIMEOUT_MS;
    return Math.round(parsed);
}

export const RECONCILE_TIMEOUT_MS = resolveReconcileTimeoutMs(
    import.meta.env.VITE_USAGE_RECONCILE_TIMEOUT_MS as string | undefined,
);

/**
 * How often the dashboard re-reads `GET /tenant/usage` **while a run is in
 * progress**, in milliseconds.
 *
 * This is the one case the Block E contract asks a client to poll: a `RUNNING`
 * status is the only value expected to change on its own
 * (block-f-dependencies.md §7). Everything else — a storage counter that moves
 * on clinical writes, live user counts — has no reason to be polled at all, and
 * the dashboard does not.
 *
 * 7 s sits in the contract's 5–10 s window. The poll stops the moment the
 * status becomes terminal, and pauses entirely while the tab is hidden.
 */
export const USAGE_RUNNING_POLL_INTERVAL_MS = 7_000;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Spanish messages per status. Deliberately generic: the backend's `detail` is
 * developer-facing English and can echo internals, so it is never shown.
 *
 * 401 never reaches here — apiFetch intercepts it, clears the session and
 * redirects, throwing its "Session expired" sentinel.
 */
function usageErrorMessage(status: number, fallback: string): string {
    if (status === 403) return "No tienes permiso para consultar el uso del laboratorio.";
    if (status === 409) return "Ya hay una verificación en curso.";
    if (status === 429) return "Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.";
    if (status >= 500) return "Error del servidor. Inténtalo de nuevo más tarde.";
    return fallback;
}

/**
 * Carries the HTTP status alongside the Spanish message so the page can react
 * structurally — `status === 409` means "a run is already going", which is a
 * different UI path from a generic failure, and pattern-matching on prose to
 * find that out would be fragile.
 */
export class TenantUsageApiError extends Error {
    readonly status: number;

    constructor(status: number, message: string) {
        super(message);
        this.name = "TenantUsageApiError";
        this.status = status;
    }
}

export function isTenantUsageApiError(err: unknown): err is TenantUsageApiError {
    return err instanceof TenantUsageApiError;
}

/**
 * The client stopped waiting. **This is not a failed run.**
 *
 * A distinct type rather than a generic error because the two mean opposite
 * things to a user: a failure is a result, a timeout is the absence of one. The
 * run is probably still executing, and the honest response is to re-read the
 * dashboard and poll — never "La verificación falló"
 * (block-f-dependencies.md §9).
 */
export class TenantUsageTimeoutError extends Error {
    constructor() {
        super("La verificación puede continuar en segundo plano.");
        this.name = "TenantUsageTimeoutError";
    }
}

export function isTenantUsageTimeoutError(err: unknown): err is TenantUsageTimeoutError {
    return err instanceof TenantUsageTimeoutError;
}

/**
 * Issues the request and returns the parsed body, mapping every failure onto a
 * user-safe Spanish message.
 *
 * The 401 sentinel is re-thrown untouched so the redirect it triggered is not
 * masked by a toast, and an `AbortError` from the reconcile timeout is
 * translated into `TenantUsageTimeoutError` rather than a network error — those
 * two would otherwise be indistinguishable to the caller, and they call for
 * opposite copy.
 */
async function requestUsageJSON<T>(
    url: string,
    init: RequestInit,
    fallbackMessage: string,
): Promise<T> {
    let res: Response;
    try {
        res = await apiFetch(url, init);
    } catch (err) {
        // apiFetch throws "Session expired" on 401 after starting the redirect.
        if (err instanceof Error && err.message === "Session expired") throw err;
        // Our own deadline fired. `AbortError` is what an aborted fetch rejects
        // with; `TimeoutError` covers a caller-supplied AbortSignal.timeout.
        if (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")) {
            throw new TenantUsageTimeoutError();
        }
        throw new Error("Error de red: no se pudo contactar al servidor. Verifica tu conexión.");
    }

    if (!res.ok) {
        // Read (and discard) the body so the connection is not left dangling;
        // the parsed detail is a dev-console breadcrumb only, never shown.
        let detail: string | null = null;
        try {
            detail = parseFastApiDetail(await res.text());
        } catch {
            detail = null;
        }
        if (detail && import.meta.env.DEV) {
            console.warn(`[tenant-usage] ${res.status} ${url}: ${detail}`);
        }
        throw new TenantUsageApiError(res.status, usageErrorMessage(res.status, fallbackMessage));
    }

    return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

/**
 * The dashboard read: storage counter, limits, live user counts and the latest
 * reconciliation summary, in one cheap response (a handful of indexed lookups —
 * no S3, no recomputation). Safe to fetch on mount, on manual refresh, and on a
 * temporary poll while a run is in progress.
 *
 * Takes no arguments, by contract.
 */
export async function getTenantUsage(): Promise<TenantUsageResponse> {
    return requestUsageJSON<TenantUsageResponse>(
        TENANT_USAGE_URL,
        { method: "GET", headers: { Accept: "application/json" } },
        "No fue posible cargar la información de uso.",
    );
}

/**
 * "Verify now" — triggers a synchronous reconciliation.
 *
 * Sends **no body and no tenant identifier**. Answers `200` for both a
 * succeeded and a failed run (the run happened either way; `status` says which),
 * and `409` when one is already in flight.
 *
 * Caller contract: after this resolves *or* throws a
 * `TenantUsageTimeoutError`, re-issue `getTenantUsage()`. The run's accounting
 * half may have repaired the counter before its S3 half failed, so even a
 * FAILED run can change `storage.billable_bytes`.
 */
export async function reconcileTenantUsage(): Promise<ReconciliationRunResponse> {
    // An explicit controller rather than AbortSignal.timeout(): the deadline has
    // to be cleared once the response lands, or a three-minute timer would keep
    // the page alive long after a fast run finished.
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), RECONCILE_TIMEOUT_MS);
    try {
        return await requestUsageJSON<ReconciliationRunResponse>(
            TENANT_USAGE_RECONCILE_URL,
            { method: "POST", signal: controller.signal },
            "No fue posible ejecutar la verificación.",
        );
    } finally {
        clearTimeout(deadline);
    }
}

/** Exported for the service tests, which assert the exact wire format. */
export const __test__ = { TENANT_USAGE_URL, TENANT_USAGE_RECONCILE_URL };
