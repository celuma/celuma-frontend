/**
 * Runtime validation for `ReportRenderingSnapshotV2` (Céluma 1.3 Fase 2,
 * Bloque C, Historia C2). TypeScript types (versioned_report_types.ts) do
 * not validate anything at the network boundary — a report fetched from the
 * API is `unknown` until checked here. Uses Zod (already a project
 * dependency, see package.json) instead of a hand-rolled validator, mirroring
 * the backend contract in
 * celuma-backend/app/schemas/report_template_version.py field-for-field.
 *
 * A V2 report with a missing or invalid snapshot must NEVER throw an
 * uncaught exception into React — see ReportRendererResolver /
 * VersionedReportRendererV2, which turn a failed validation into the same
 * controlled UnsupportedReportVersion fallback used for unknown schema
 * versions.
 */
import { z } from "zod";
import type { ReportRenderingSnapshotV2 } from "./versioned_report_types";

// Exported so report_presentation_editor_schema.ts (Bloque D) can validate
// admin-entered values against the exact same bounds without drifting.
export const MIN_MARGIN_CM = 0.5;
export const MAX_MARGIN_CM = 4.0;
export const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

const marginsSchema = z.object({
    top: z.number().min(MIN_MARGIN_CM).max(MAX_MARGIN_CM),
    right: z.number().min(MIN_MARGIN_CM).max(MAX_MARGIN_CM),
    bottom: z.number().min(MIN_MARGIN_CM).max(MAX_MARGIN_CM),
    left: z.number().min(MIN_MARGIN_CM).max(MAX_MARGIN_CM),
});

// Cuarta remediación post-Fase 2 — paridad Legacy. Igual que en la segunda
// remediación, TODO campo nuevo debe declararse aquí aunque ya esté en
// versioned_report_types.ts: Zod trabaja en modo "strip" y descartaría
// silenciosamente cualquier clave no declarada, dejando al renderer sin los
// valores que el backend sí devolvió.
const nullableNumber = z.number().nullable().optional();
const fontWeightSchema = z
    .union([z.literal(400), z.literal(500), z.literal(600), z.literal(700)])
    .nullable()
    .optional();
const logoModeSchema = z.enum(["NONE", "CUSTOM", "CELUMA_DEFAULT"]).nullable().optional();

const paperSchema = z.object({
    size: z.literal("LETTER"),
    orientation: z.literal("PORTRAIT"),
    margins_cm: marginsSchema,
    body_padding_top_mm: nullableNumber,
});

const nullableString = z.string().nullable().optional();

// Segunda remediación post-Fase 2 (UX) — paridad Legacy. Todos opcionales:
// un snapshot V2 existente sin estos campos sigue validando igual (Zod
// strip-mode ya los habría descartado silenciosamente si no se declaran
// aquí, aunque el backend los devuelva — de ahí que sea obligatorio
// añadirlos, no solo en versioned_report_types.ts).
const dividerSchema = z
    .object({
        enabled: z.boolean(),
        style: z.enum(["SINGLE", "DOUBLE"]),
        primary_width_px: z.number(),
        secondary_width_px: z.number(),
        gap_mm: z.number(),
        color: nullableString,
    })
    .optional();

const typographySchema = z
    .object({
        font_family: z.enum(["ARIAL", "HELVETICA", "TIMES", "CALIBRI"]),
        base_font_size_pt: z.number(),
        header_font_size_pt: z.number(),
        footer_font_size_pt: z.number(),
        header_secondary_font_size_pt: nullableNumber,
        header_font_weight: fontWeightSchema,
        footer_font_weight: fontWeightSchema,
        body_font_weight: fontWeightSchema,
        line_height: nullableNumber,
    })
    .optional();

const logoPositionSchema = z.enum(["LEFT", "CENTER", "RIGHT"]).optional();

const headerSchema = z.object({
    enabled: z.boolean(),
    logo_storage_id: nullableString,
    institution_name: nullableString,
    subtitle: nullableString,
    address: nullableString,
    phone: nullableString,
    email: nullableString,
    logo_position: logoPositionSchema,
    content_alignment: z.enum(["TOP", "CENTER", "BOTTOM"]).optional(),
    height_mm: nullableNumber,
    divider: dividerSchema,
    logo_mode: logoModeSchema,
    offset_mm: nullableNumber,
    content_gap_mm: nullableNumber,
    padding_mm: nullableNumber,
    signer_placement: z.enum(["RIGHT", "INLINE", "HIDDEN"]).nullable().optional(),
    logo_height_mm: nullableNumber,
    logo_max_width_mm: nullableNumber,
});

const footerSchema = z.object({
    enabled: z.boolean(),
    custom_text: nullableString,
    show_page_number: z.boolean(),
    logo_storage_id: nullableString,
    logo_position: logoPositionSchema,
    content_alignment: z.enum(["LEFT", "CENTER", "RIGHT"]).optional(),
    height_mm: nullableNumber,
    divider: dividerSchema,
    logo_mode: logoModeSchema,
    layout: z.enum(["GROUPED", "SPLIT"]).nullable().optional(),
    offset_mm: nullableNumber,
    content_gap_mm: nullableNumber,
    padding_mm: nullableNumber,
    logo_height_mm: nullableNumber,
    logo_max_width_pct: nullableNumber,
    text_max_width_pct: nullableNumber,
});

const styleSchema = z.object({
    primary_color: z.string().regex(HEX_COLOR_PATTERN, "must be a 6-digit hex color"),
    secondary_color: nullableString,
    typography: typographySchema,
});

const signerSchema = z
    .object({
        display_name: nullableString,
        specialty: nullableString,
        license_number: nullableString,
        affiliation: nullableString,
    })
    .nullable()
    .optional();

const presentationSchema = z.object({
    paper: paperSchema,
    header: headerSchema,
    footer: footerSchema,
    style: styleSchema,
    signer: signerSchema,
});

const snapshotSchema = z.object({
    schema_version: z.literal(2),
    template: z.record(z.string(), z.unknown()),
    presentation: presentationSchema,
});

export type SnapshotValidationResult =
    | { valid: true; snapshot: ReportRenderingSnapshotV2 }
    | { valid: false; error: string };

function formatZodError(error: z.ZodError): string {
    return error.issues
        .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("; ");
}

/** Validates an already-extracted `rendering_snapshot` value. */
export function validateReportRenderingSnapshotV2(value: unknown): SnapshotValidationResult {
    const result = snapshotSchema.safeParse(value);
    if (!result.success) {
        return { valid: false, error: formatZodError(result.error) };
    }
    return { valid: true, snapshot: result.data as ReportRenderingSnapshotV2 };
}

/**
 * Extracts and validates `rendering_snapshot` from a report content object
 * (`report.report`, the JSON body — same object resolveReportSchemaVersion
 * reads `schema_version` from). Returns a controlled failure (never throws)
 * when the report has no snapshot at all, which is itself invalid for a
 * document that already resolved to schema_version 2.
 */
export function extractRenderingSnapshot(reportContent: unknown): SnapshotValidationResult {
    if (
        reportContent === null ||
        typeof reportContent !== "object" ||
        Array.isArray(reportContent)
    ) {
        return { valid: false, error: "report content is not an object" };
    }
    const snapshot = (reportContent as Record<string, unknown>).rendering_snapshot;
    if (snapshot === undefined || snapshot === null) {
        return { valid: false, error: "rendering_snapshot is missing" };
    }
    return validateReportRenderingSnapshotV2(snapshot);
}
