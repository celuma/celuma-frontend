/**
 * Laboratory-content cleanup (Céluma 1.4, issue #39). Wire types of
 * `/v1/maintenance/tenants/{tenant_id}/laboratory-cleanup/*`.
 *
 * Contract: celuma-engineering `specs/laboratory/laboratory-content-cleanup.md`, ADR 0021.
 * Counts only: the API never returns object keys, codes or clinical text here.
 */

export type CleanupStatus = "QUEUED" | "RUNNING" | "FAILED" | "COMPLETED" | "CANCELLED";
export type CleanupPhase = "QUIESCE" | "DATABASE" | "OBJECTS" | "DONE";

export interface CleanupMessage {
    code: string;
    message: string;
}

export interface CleanupPreview {
    laboratory: { id: string; name: string };
    /** Row counts deleted, by table key (e.g. `orders`, `samples`, `reports`, `invoices`, `audit_rows`). Always the complete scope. */
    delete: Record<string, number>;
    /** Minimal technical records that stay (idempotency receipts, issued-code ledger, code corrections): no removed content. */
    retain_as_evidence: Record<string, number>;
    /** Reusable master data that stays untouched. */
    preserve: Record<string, number>;
    objects: {
        delete_count: number;
        delete_bytes: number;
        by_category: Record<string, { objects: number; bytes: number }>;
        kept_shared_count: number;
    };
    blockers: CleanupMessage[];
    warnings: CleanupMessage[];
    scope_revision: string;
    /** Null while there are blockers: nothing can be confirmed. */
    preview_token: string | null;
    expires_at: string | null;
}

export interface CleanupObjectsSummary {
    total: number;
    pending: number;
    deleted: number;
    absent: number;
    /** Closed without deleting: a preserved configuration references the object (never destroyed). */
    kept: number;
    failed: number;
    pending_bytes: number;
}

export interface CleanupOperation {
    id: string;
    tenant_id: string;
    status: CleanupStatus;
    phase: CleanupPhase;
    reason: string;
    laboratory_name: string;
    approved_counts: { delete: Record<string, number>; retain_as_evidence: Record<string, number> };
    executed_counts: { deleted: Record<string, number>; retired_codes: number; objects_queued: number } | null;
    error_code: string | null;
    error_message: string | null;
    attempts: number;
    objects: CleanupObjectsSummary;
    /** True while ordinary writers of the laboratory are refused (423). */
    writers_blocked: boolean;
    can_retry: boolean;
    can_cancel: boolean;
    created_at: string | null;
    started_at: string | null;
    database_cleaned_at: string | null;
    completed_at: string | null;
    cancelled_at: string | null;
}

export interface CleanupConfirmation {
    preview_token: string;
    reason: string;
    confirm_name: string;
    password: string;
}

export const OPEN_STATUSES: CleanupStatus[] = ["QUEUED", "RUNNING", "FAILED"];
export const ACTIVE_STATUSES: CleanupStatus[] = ["QUEUED", "RUNNING"];
