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

/** Segunda remediación post-Fase 2 (UX): línea divisoria bajo el header /
 *  sobre el footer — ver legacy-parity-contract.md. Todos opcionales; su
 *  ausencia reproduce la línea sólida de 1px que el renderer ya dibuja hoy
 *  incondicionalmente (mismo default que el backend). */
export interface DividerConfig {
    enabled: boolean;
    style: "SINGLE" | "DOUBLE";
    primary_width_px: number;
    secondary_width_px: number;
    gap_mm: number;
    color: string | null;
}

export type ReportFontFamily = "ARIAL" | "HELVETICA" | "TIMES" | "CALIBRI";
export type ReportLogoPosition = "LEFT" | "CENTER" | "RIGHT";
export type ReportHeaderAlignment = "TOP" | "CENTER" | "BOTTOM";
export type ReportFooterAlignment = "LEFT" | "CENTER" | "RIGHT";

export interface ReportTypographyConfig {
    font_family: ReportFontFamily;
    base_font_size_pt: number;
    header_font_size_pt: number;
    footer_font_size_pt: number;
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
    /** Segunda remediación post-Fase 2 (UX), todos opcionales/aditivos: */
    logo_position?: ReportLogoPosition;
    content_alignment?: ReportHeaderAlignment;
    height_mm?: number | null;
    divider?: DividerConfig;
}

export interface ReportFooterConfig {
    enabled: boolean;
    custom_text: string | null;
    show_page_number: boolean;
    /** Segunda remediación post-Fase 2 (UX), todos opcionales/aditivos:
     *  Legacy coloca su logo en el PIE, no en el header. */
    logo_storage_id?: string | null;
    logo_position?: ReportLogoPosition;
    content_alignment?: ReportFooterAlignment;
    height_mm?: number | null;
    divider?: DividerConfig;
}

export interface ReportStyleConfig {
    /** 6-digit hex color, e.g. "#4A4A4A". */
    primary_color: string;
    /** Segunda remediación post-Fase 2 (UX), todos opcionales/aditivos: */
    secondary_color?: string | null;
    typography?: ReportTypographyConfig;
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
