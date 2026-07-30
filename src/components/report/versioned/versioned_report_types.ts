/**
 * TypeScript contract for `ReportRenderingSnapshotV2` (Céluma 1.3 Fase 2,
 * Bloque C, Historia C2), mirroring the backend Pydantic contract in
 * `celuma-backend/app/schemas/report_template_version.py` field-for-field.
 * See versioned-renderer-v2-contract.md for the full rationale.
 *
 * This module only declares shapes. Runtime validation (turning `unknown`
 * JSON from the network into one of these types, or rejecting it) lives in
 * report_snapshot_validation.ts — TypeScript types alone do not validate
 * anything at the network boundary.
 */

export type ReportPaperSize = "LETTER";
export type ReportPaperOrientation = "PORTRAIT";

export interface ReportMarginsCm {
    top: number;
    right: number;
    bottom: number;
    left: number;
}

export interface ReportPaperConfig {
    size: ReportPaperSize;
    orientation: ReportPaperOrientation;
    margins_cm: ReportMarginsCm;
}

export interface ReportHeaderConfig {
    enabled: boolean;
    /** UUID of a StorageObject — never a raw URL. Resolved server-side into
     *  `ReportResolvedResources.header_logo_url` (see models/report.ts). */
    logo_storage_id: string | null;
    institution_name: string | null;
    subtitle: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
}

export interface ReportFooterConfig {
    enabled: boolean;
    custom_text: string | null;
    show_page_number: boolean;
}

export interface ReportStyleConfig {
    /** 6-digit hex color, e.g. "#4A4A4A". */
    primary_color: string;
}

/**
 * Static, institutional signer credentials configured by an admin when
 * publishing a ReportTemplateVersion — NOT the real signer of
 * ReportVersion.signed_by/signed_at. See versioned-renderer-v2-contract.md,
 * "Firmante institucional vs. firmante real".
 */
export interface ReportSignerSnapshot {
    display_name: string | null;
    specialty: string | null;
    license_number: string | null;
    affiliation: string | null;
}

export interface ReportPresentationSnapshotV2 {
    paper: ReportPaperConfig;
    header: ReportHeaderConfig;
    footer: ReportFooterConfig;
    style: ReportStyleConfig;
    signer: ReportSignerSnapshot | null;
}

/** The full, versioned rendering snapshot embedded in `report.report.rendering_snapshot`. */
export interface ReportRenderingSnapshotV2 {
    schema_version: 2;
    /** Opaque clinical structure — same untyped shape as ReportTemplateJSON. */
    template: Record<string, unknown>;
    presentation: ReportPresentationSnapshotV2;
}
