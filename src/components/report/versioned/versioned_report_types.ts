/**
 * TypeScript contract for `ReportRenderingSnapshotV2` (Céluma 1.3 Phase 2,
 * Block C, Story C2), mirroring the backend Pydantic contract in
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
    /** Fourth post-Phase 2 remediation (optional/additive): top padding
     *  INSIDE the paginated box. Absent = 0mm (current behavior); Legacy
     *  uses 4mm. See v2-legacy-parity-capabilities.md. */
    body_padding_top_mm?: number | null;
}

/** Second post-Phase 2 remediation (UX): divider below the header / above
 *  the footer — see legacy-parity-contract.md. All fields are optional; when
 *  absent, the renderer retains its unconditional 1px solid line (the same
 *  default as the backend). */
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

/** Fourth post-Phase 2 remediation: closed enum of typographic weights —
 *  never free-form CSS. */
export type ReportFontWeight = 400 | 500 | 600 | 700;

/**
 * Fourth post-Phase 2 remediation: logo mode for a band.
 *
 * `undefined`/absent is NOT a fourth mode: it means a "snapshot predating
 * this remediation," and each band resolves it to its previous behavior
 * (the header fell back to the neutral isotipo; the footer did not). See
 * `resolveLogoMode` in versioned_report_renderer_v2.tsx.
 */
export type ReportLogoMode = "NONE" | "CUSTOM" | "CELUMA_DEFAULT";

export type ReportSignerPlacement = "RIGHT" | "INLINE" | "HIDDEN";

export type ReportFooterLayout = "GROUPED" | "SPLIT";

export interface ReportTypographyConfig {
    font_family: ReportFontFamily;
    base_font_size_pt: number;
    header_font_size_pt: number;
    footer_font_size_pt: number;
    /** Fourth remediation (optional/additive). Absent/null retains the
     *  per-line behavior the renderer already had; an explicit value makes
     *  that property consistent across the entire band. */
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
    /** Second post-Phase 2 remediation (UX), all optional/additive: */
    logo_position?: ReportLogoPosition;
    content_alignment?: ReportHeaderAlignment;
    height_mm?: number | null;
    divider?: DividerConfig;
    /** Fourth post-Phase 2 remediation (optional/additive) — Legacy parity. */
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
    /** Second post-Phase 2 remediation (UX), all optional/additive:
     *  Legacy places its logo in the FOOTER, not the header. */
    logo_storage_id?: string | null;
    logo_position?: ReportLogoPosition;
    content_alignment?: ReportFooterAlignment;
    height_mm?: number | null;
    divider?: DividerConfig;
    /** Fourth post-Phase 2 remediation (optional/additive) — Legacy parity. */
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
    /** Second post-Phase 2 remediation (UX), all optional/additive: */
    secondary_color?: string | null;
    typography?: ReportTypographyConfig;
}

/**
 * Static, institutional signer credentials configured by an admin when
 * publishing a ReportTemplateVersion — NOT the real signer of
 * ReportVersion.signed_by/signed_at. See versioned-renderer-v2-contract.md,
 * "Institutional signer vs. actual signer".
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
