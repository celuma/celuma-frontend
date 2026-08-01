/**
 * TypeScript types for the shared, tenant-owned letterhead ("membrete")
 * domain — post-Fase-2 remediation. Mirrors
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
}

export interface ReportLetterheadDetail extends ReportLetterheadSummary {
    created_by?: string | null;
}

export interface ReportLetterheadsListResponse {
    letterheads: ReportLetterheadSummary[];
}

/** Payload for POST /api/v1/report-letterheads/ */
export interface CreateReportLetterheadPayload {
    name: string;
    description?: string;
}

/** Payload for PUT /api/v1/report-letterheads/{id} */
export interface UpdateReportLetterheadPayload {
    name?: string;
    description?: string;
    is_active?: boolean;
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

/** Full version detail, including the immutable configuration. */
export interface ReportLetterheadVersionDetail extends ReportLetterheadVersionSummary {
    configuration: ReportPresentationSnapshotV2;
}

export interface ReportLetterheadVersionsListResponse {
    versions: ReportLetterheadVersionSummary[];
}

/** Payload for POST /api/v1/report-letterheads/{id}/versions. */
export interface CreateReportLetterheadVersionPayload {
    configuration: ReportPresentationSnapshotV2;
}

/** Payload for PUT /api/v1/report-letterheads/{id}/versions/current —
 *  segunda remediación post-Fase 2 (UX): "Guardar cambios" del editor
 *  visual, crea+activa una versión nueva atómicamente. */
export type SaveCurrentReportLetterheadVersionPayload = CreateReportLetterheadVersionPayload;

/** Response from POST /api/v1/report-letterheads/{id}/logo. */
export interface ReportLetterheadLogoUploadResponse {
    storage_object_id: string;
    url: string;
    content_type: string;
    size_bytes: number;
}

/** Response from GET /api/v1/study-types/{id}/report-defaults. */
export interface StudyTypeReportDefaults {
    template_id: string | null;
    active_template_version_id: string | null;
    letterhead_version_id: string | null;
    letterhead_name: string | null;
}

// ---------------------------------------------------------------------------
// .celuma portable file format — post-Fase-2 remediation, R12/R13.
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
