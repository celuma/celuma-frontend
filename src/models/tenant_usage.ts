/**
 * Céluma 1.3, Phase 4, Block F — frontend contract for the tenant usage domain.
 *
 * Mirrors the Block E read surface documented in
 * docs/celuma-1.3/phase-4-block-e/block-f-dependencies.md §2 and
 * usage-response-semantics.md. Two endpoints exist and no more:
 *
 *   GET  /api/v1/tenant/usage
 *   POST /api/v1/tenant/usage/reconcile
 *
 * Neither takes a tenant identifier in any form — the tenant is always the
 * authenticated caller's own (usage-rbac-contract.md §4). There is deliberately
 * no `tenantId` anywhere in this module.
 *
 * ## `null` is a domain value here, never a stand-in for zero
 *
 * Every nullable field below is nullable *because the backend does not know the
 * value*, and the three nulls mean three different things
 * (usage-response-semantics.md §1):
 *
 *   storage.billable_bytes === null   usage tracking was never initialized
 *   *.limit_bytes / user_limit null   no limit is configured (unlimited)
 *   reconciliation.* counters null    not measured (disabled, or still running)
 *
 * None of them is widened to `number` with a `?? 0` default anywhere in Block F.
 * Rendering any of them as `0` would state something the backend never said —
 * a tenant with real uncounted storage shown as "0 B used" silently
 * under-reports its own data, which block-f-dependencies.md §3.1 calls the
 * single most important rule of the contract.
 *
 * ## Percentages are not recomputed here
 *
 * `usage_ratio` / `usage_percent` arrive computed by the backend, which also
 * owns *which* count consumes *which* limit. Block F never divides
 * `billable_bytes` by `limit_bytes`, or `active_internal_users` by
 * `user_limit`, to decide business meaning — see §4 of the dependencies
 * document, and `lib/usage_ui.ts` for the display-only clamping the bar width
 * is allowed to do.
 */

// ---------------------------------------------------------------------------
// Enums (API values — never displayed directly; Spanish copy lives in usage_ui)
// ---------------------------------------------------------------------------

export const INTEGRITY_STATUSES = [
    "NOT_RUN",
    "RUNNING",
    "FAILED",
    "WARNING",
    "HEALTHY",
    "ACCOUNTING_ONLY",
] as const;

/**
 * The backend's derived health summary (reconciliation-read-contract.md §3).
 *
 * `ACCOUNTING_ONLY` is the load-bearing one: a SUCCEEDED run whose S3
 * verification never happened. It is never green.
 */
export type IntegrityStatus = (typeof INTEGRITY_STATUSES)[number];

export const RECONCILIATION_STATUSES = ["RUNNING", "SUCCEEDED", "FAILED"] as const;

/** The raw run status, as opposed to the derived `integrity_status`. */
export type ReconciliationStatus = (typeof RECONCILIATION_STATUSES)[number];

export const RECONCILIATION_ERROR_CODES = [
    "s3_access_denied",
    "s3_timeout",
    "s3_unavailable",
    "unexpected_error",
    "stale_run_recovered",
] as const;

/**
 * A closed, sanitized set. The backend deliberately sends no message string
 * (reconciliation-read-contract.md §4), so the human text is Block F's and
 * lives in `lib/usage_ui.ts`. The raw code is never primary user copy.
 */
export type ReconciliationErrorCode = (typeof RECONCILIATION_ERROR_CODES)[number];

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

export interface StorageUsage {
    /** Whether a usage row exists at all. `false` is *not* "zero bytes used". */
    initialized: boolean;
    /**
     * Céluma's **billable** total — not the tenant's physical S3 footprint,
     * which differs by design. `null` exactly when `initialized` is `false`.
     */
    billable_bytes: number | null;
    /** `null` when no limit is configured. */
    limit_bytes: number | null;
    /** `true` exactly when `limit_bytes` is `null`. */
    unlimited: boolean;
    /** `billable_bytes / limit_bytes`, unrounded. `null` when either side is absent. */
    usage_ratio: number | null;
    /** `usage_ratio * 100`, rounded to 2 decimals. Never clamped — may exceed 100. */
    usage_percent: number | null;
}

export interface UserUsage {
    /** Every user row of the tenant, any status. Informational; consumes nothing. */
    registered_users: number;
    /** The licensed-seat metric — the only count that consumes `user_limit`. */
    active_internal_users: number;
    /** Disjoint from `active_internal_users`. Informational; consumes nothing. */
    active_physician_portal_users: number;
    /** `null` when no limit is configured. */
    user_limit: number | null;
    unlimited: boolean;
    /** `active_internal_users / user_limit`, unrounded. */
    usage_ratio: number | null;
    /** Rounded to 2 decimals, never clamped. */
    usage_percent: number | null;
}

export interface ReconciliationSummary {
    /** `false` = never reconciled. Every other field is then `null` / `NOT_RUN`. */
    has_run: boolean;
    integrity_status: IntegrityStatus;
    status: ReconciliationStatus | null;
    /** ISO 8601, naive UTC — parse with `parseBackendUtcDate`, never `new Date()` raw. */
    started_at: string | null;
    /** `null` while the run is still RUNNING. */
    completed_at: string | null;
    /** `null` when there was no counter to compare (the run initialized it). */
    expected_storage_bytes: number | null;
    /** Recomputed billable total, **not** physical S3 bytes. Do not relabel. */
    actual_storage_bytes: number | null;
    difference_bytes: number | null;
    repaired: boolean | null;
    objects_checked: number | null;
    /** Stored objects with no active reference. `null` = not measured. */
    orphans_found: number | null;
    /** Rows whose object was not found — an integrity incident, not a billing one. */
    missing_objects_found: number | null;
    /** Size/ETag disagreements. Distinct from missing objects; never merged. */
    metadata_mismatches_found: number | null;
    error_code: ReconciliationErrorCode | null;
}

/**
 * `GET /api/v1/tenant/usage`.
 *
 * Three conceptually distinct blocks because they are three independently
 * maintained things — a counter, live counts, and an operational history row.
 * They are **eventually consistent with each other, not a snapshot**: a
 * `RUNNING` reconciliation beside a counter that run has not yet repaired is
 * normal and correct (usage-api-contract.md §7). Nothing in Block F may assume
 * `storage.billable_bytes === reconciliation.actual_storage_bytes`.
 */
export interface TenantUsageResponse {
    storage: StorageUsage;
    users: UserUsage;
    reconciliation: ReconciliationSummary;
}

/**
 * `POST /api/v1/tenant/usage/reconcile`, Block D's response.
 *
 * Modeled only so the 200-with-`status: "FAILED"` case can be recognised as
 * "the run happened and failed" rather than an HTTP error. The dashboard never
 * renders from this body: after any completed POST the page re-issues the GET,
 * which is the one authoritative read path (block-f-dependencies.md §7).
 */
export interface ReconciliationRunResponse {
    status: ReconciliationStatus;
    error_code: ReconciliationErrorCode | null;
}
