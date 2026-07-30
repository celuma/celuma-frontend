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

const MIN_MARGIN_CM = 0.5;
const MAX_MARGIN_CM = 4.0;
const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

const marginsSchema = z.object({
    top: z.number().min(MIN_MARGIN_CM).max(MAX_MARGIN_CM),
    right: z.number().min(MIN_MARGIN_CM).max(MAX_MARGIN_CM),
    bottom: z.number().min(MIN_MARGIN_CM).max(MAX_MARGIN_CM),
    left: z.number().min(MIN_MARGIN_CM).max(MAX_MARGIN_CM),
});

const paperSchema = z.object({
    size: z.literal("LETTER"),
    orientation: z.literal("PORTRAIT"),
    margins_cm: marginsSchema,
});

const nullableString = z.string().nullable().optional();

const headerSchema = z.object({
    enabled: z.boolean(),
    logo_storage_id: nullableString,
    institution_name: nullableString,
    subtitle: nullableString,
    address: nullableString,
    phone: nullableString,
    email: nullableString,
});

const footerSchema = z.object({
    enabled: z.boolean(),
    custom_text: nullableString,
    show_page_number: z.boolean(),
});

const styleSchema = z.object({
    primary_color: z.string().regex(HEX_COLOR_PATTERN, "must be a 6-digit hex color"),
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
