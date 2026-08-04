/**
 * TypeScript types for the shared, tenant-owned letterhead ("membrete")
 * domain — post-Phase-2 remediation. Mirrors
 * celuma-backend/app/schemas/report_letterhead.py field-for-field, the
 * same way models/report.ts mirrors the template-version schemas.
 *
 * `configuration`/`ReportPresentationSnapshotV2` is NOT redefined here —
 * it is imported from components/report/versioned/versioned_report_types.ts,
 * the same type already used inside `ReportRenderingSnapshotV2.presentation`,
 * so the two domains can never structurally diverge on the frontend either.
 */
import type { ReportPresentationSnapshotV2 } from "../components/report/versioned/versioned_report_types";

export interface ReportLetterheadSummary {
    id: string;
    tenant_id: string;
    name: string;
    description?: string | null;
    is_default: boolean;
    is_active: boolean;
    created_at: string;
    /** Third remediation: the backend precomputes valid actions so the UI
     *  shows "Delete" only when it is actually allowed, rather than always
     *  offering it and responding with 409 after the click. See
     *  letterhead-delete-deactivate-contract.md. */
    has_active_version?: boolean;
    can_hard_delete?: boolean;
    /** Human-readable blocking reasons; empty when `can_hard_delete`. */
    blocking_references?: string[];
}

export interface ReportLetterheadDetail extends ReportLetterheadSummary {
    created_by?: string | null;
}

export interface ReportLetterheadsListResponse {
    letterheads: ReportLetterheadSummary[];
}

/** Payload for POST /api/v1/report-letterheads/
 *
 *  Fourth post-Phase 2 remediation (Observation 2): `description` is
 *  optional AND nullable. `undefined` = omitted field; `null` = "no
 *  description". The backend also normalizes `""`/whitespace-only values to
 *  `null`. See optional-letterhead-description-contract.md. */
export interface CreateReportLetterheadPayload {
    name: string;
    description?: string | null;
}

/** Payload for PUT /api/v1/report-letterheads/{id}
 *
 *  `description: undefined` is NOT serialized (JSON.stringify omits it), so
 *  the backend leaves the previous value unchanged; `description: null`
 *  clears it. */
export interface UpdateReportLetterheadPayload {
    name?: string;
    description?: string | null;
    is_active?: boolean;
}

/** Normalizes a form description field to the value that must be sent in the
 *  payload: empty or whitespace-only -> `null` (clear), any other text ->
 *  the trimmed text.
 *
 *  This is an exported function rather than a loose expression in each
 *  screen because the original bug came from repeating
 *  `description || undefined` in two places: that pattern turns `""` into an
 *  "omitted field" and makes clearing the description impossible. */
export function normalizeLetterheadDescription(value: string | null | undefined): string | null {
    const trimmed = (value ?? "").trim();
    return trimmed.length > 0 ? trimmed : null;
}

export type ReportLetterheadVersionStatus = "PUBLISHED" | "ACTIVE" | "ARCHIVED";

/** Lightweight version metadata — never includes `configuration`. */
export interface ReportLetterheadVersionSummary {
    id: string;
    tenant_id: string;
    report_letterhead_id: string;
    version_number: number;
    schema_version: number;
    status: ReportLetterheadVersionStatus;
    created_by: string | null;
    published_at: string;
    activated_at: string | null;
    archived_at: string | null;
}

/** Ephemeral URLs for letterhead logos—never persisted; the single contract
 *  is "persistent storage_id + ephemeral resolved URL" (see
 *  letterhead-logo-persistence-contract.md). It intentionally has the same
 *  shape as `ReportEnvelope.resolved_resources`: the editor and renderer
 *  consume both sources with the same code. */
export interface LetterheadResolvedResources {
    header_logo_url?: string | null;
    footer_logo_url?: string | null;
}

/** Full version detail, including the immutable configuration. */
export interface ReportLetterheadVersionDetail extends ReportLetterheadVersionSummary {
    configuration: ReportPresentationSnapshotV2;
    /** Third remediation: without this, the editor could not preview an
     *  persisted logo when reopened and always fell back to the neutral logo
     *  (brief issues B and C). */
    resolved_resources?: LetterheadResolvedResources | null;
}

export interface ReportLetterheadVersionsListResponse {
    versions: ReportLetterheadVersionSummary[];
}

/** Payload for POST /api/v1/report-letterheads/{id}/versions. */
export interface CreateReportLetterheadVersionPayload {
    configuration: ReportPresentationSnapshotV2;
}

/** Payload for PUT /api/v1/report-letterheads/{id}/versions/current —
 *  second post-Phase 2 remediation (UX): the visual editor's "Save changes"
 *  atomically creates and activates a new version. */
export type SaveCurrentReportLetterheadVersionPayload = CreateReportLetterheadVersionPayload;

/** Response from POST /api/v1/report-letterheads/{id}/logo. */
export interface ReportLetterheadLogoUploadResponse {
    storage_object_id: string;
    url: string;
    content_type: string;
    size_bytes: number;
}

export type LetterheadResolutionSource = "EXPLICIT" | "TEMPLATE_PREFERRED" | "TENANT_DEFAULT";

export type V2BlockedReason =
    | "NO_TEMPLATE"
    | "NO_ACTIVE_TEMPLATE_VERSION"
    | "NO_LETTERHEAD"
    | "LETTERHEAD_MISCONFIGURED";

/** Response from GET /api/v1/study-types/{id}/report-defaults.
 *
 *  Third remediation: includes the already-resolved `presentation` and the
 *  exact blocking reason. Previously, the editor had to chain
 *  list-letterheads -> list-versions -> read-version to reconstruct it; if
 *  any step failed, it had no presentation and silently rendered Legacy
 *  (issue F). */
export interface StudyTypeReportDefaults {
    template_id: string | null;
    active_template_version_id: string | null;
    letterhead_version_id: string | null;
    letterhead_name: string | null;
    letterhead_id?: string | null;
    letterhead_resolution_source?: LetterheadResolutionSource | null;
    letterhead_presentation?: ReportPresentationSnapshotV2 | null;
    letterhead_resolved_resources?: LetterheadResolvedResources | null;
    v2_blocked_reason?: V2BlockedReason | null;
    v2_blocked_detail?: string | null;
}

// ---------------------------------------------------------------------------
// .celuma portable file format — post-Phase 2 remediation, R12/R13.
// Mirrors app/schemas/report_letterhead.py's Celuma* schemas.
// ---------------------------------------------------------------------------

export interface CelumaLetterheadAsset {
    media_type: string;
    sha256: string;
    data_base64: string;
}

export interface CelumaLetterheadEnvelope {
    format: string;
    format_version: number;
    exported_at: string;
    source: { product: string; schema_version: number };
    letterhead: {
        name: string;
        description?: string | null;
        presentation: ReportPresentationSnapshotV2;
    };
    assets: Record<string, CelumaLetterheadAsset>;
}
