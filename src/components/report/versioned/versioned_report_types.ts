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
    /** Cuarta remediación post-Fase 2 (opcional/aditivo): relleno superior
     *  DENTRO de la caja paginable. Ausente = 0mm (comportamiento actual);
     *  Legacy usa 4mm. Ver v2-legacy-parity-capabilities.md. */
    body_padding_top_mm?: number | null;
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

/** Cuarta remediación post-Fase 2: enum cerrado de pesos tipográficos —
 *  nunca CSS libre. */
export type ReportFontWeight = 400 | 500 | 600 | 700;

/**
 * Cuarta remediación post-Fase 2: modo de logo de una banda.
 *
 * `undefined`/ausente NO es un cuarto modo: significa "snapshot anterior a
 * esta remediación", y cada banda lo resuelve al comportamiento que ya
 * tenía (el encabezado caía al isotipo neutral; el pie no). Ver
 * `resolveLogoMode` en versioned_report_renderer_v2.tsx.
 */
export type ReportLogoMode = "NONE" | "CUSTOM" | "CELUMA_DEFAULT";

export type ReportSignerPlacement = "RIGHT" | "INLINE" | "HIDDEN";

export type ReportFooterLayout = "GROUPED" | "SPLIT";

export interface ReportTypographyConfig {
    font_family: ReportFontFamily;
    base_font_size_pt: number;
    header_font_size_pt: number;
    footer_font_size_pt: number;
    /** Cuarta remediación (opcionales/aditivos). Ausente/null = el
     *  comportamiento por línea que el renderer ya tenía; un valor
     *  explícito unifica esa propiedad en toda la banda. */
    header_secondary_font_size_pt?: number | null;
    header_font_weight?: ReportFontWeight | null;
    footer_font_weight?: ReportFontWeight | null;
    body_font_weight?: ReportFontWeight | null;
    line_height?: number | null;
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
    /** Cuarta remediación post-Fase 2 (opcionales/aditivos) — paridad Legacy. */
    logo_mode?: ReportLogoMode | null;
    offset_mm?: number | null;
    content_gap_mm?: number | null;
    padding_mm?: number | null;
    signer_placement?: ReportSignerPlacement | null;
    logo_height_mm?: number | null;
    logo_max_width_mm?: number | null;
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
    /** Cuarta remediación post-Fase 2 (opcionales/aditivos) — paridad Legacy. */
    logo_mode?: ReportLogoMode | null;
    layout?: ReportFooterLayout | null;
    offset_mm?: number | null;
    content_gap_mm?: number | null;
    padding_mm?: number | null;
    logo_height_mm?: number | null;
    logo_max_width_pct?: number | null;
    text_max_width_pct?: number | null;
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
