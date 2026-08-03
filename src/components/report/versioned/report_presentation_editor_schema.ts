/**
 * Editor-side validation for `ReportPresentationSnapshotV2` (Céluma 1.3
 * Phase 2, Block D, Story D5). Stricter than report_snapshot_validation.ts
 * on purpose: that module only needs to keep an already-rendered V2 report
 * from crashing the UI, so it is deliberately lenient on free-text fields.
 * This module exists so the admin editor can never submit a configuration
 * the backend will reject — it mirrors
 * celuma-backend/app/schemas/report_template_version.py's
 * `ReportPresentationSnapshotV2` field-for-field, including the exact
 * length limits, phone pattern, and markup rejection.
 */
import { z } from "zod";
import { HEX_COLOR_PATTERN, MAX_MARGIN_CM, MIN_MARGIN_CM } from "./report_snapshot_validation";

const PHONE_PATTERN = /^[0-9+()\-.\s]{1,50}$/;
const FORBIDDEN_MARKUP_SNIPPETS = ["<", ">", "javascript:", "onerror=", "onload=", "data:text/html"];

function containsMarkup(value: string): boolean {
    const lowered = value.toLowerCase();
    return FORBIDDEN_MARKUP_SNIPPETS.some((snippet) => lowered.includes(snippet));
}

/** A nullable/optional free-text field, bounded by `maxLength`, rejecting HTML/JS markup. */
function noMarkupText(maxLength: number) {
    return z
        .string()
        .max(maxLength, `Máximo ${maxLength} caracteres`)
        .refine((v) => !containsMarkup(v), "No se permite HTML, CSS ni JavaScript")
        .nullable()
        .optional();
}

export const marginsEditorSchema = z.object({
    top: z
        .number({ error: "Requerido" })
        .min(MIN_MARGIN_CM, `Mínimo ${MIN_MARGIN_CM}cm`)
        .max(MAX_MARGIN_CM, `Máximo ${MAX_MARGIN_CM}cm`),
    right: z
        .number({ error: "Requerido" })
        .min(MIN_MARGIN_CM, `Mínimo ${MIN_MARGIN_CM}cm`)
        .max(MAX_MARGIN_CM, `Máximo ${MAX_MARGIN_CM}cm`),
    bottom: z
        .number({ error: "Requerido" })
        .min(MIN_MARGIN_CM, `Mínimo ${MIN_MARGIN_CM}cm`)
        .max(MAX_MARGIN_CM, `Máximo ${MAX_MARGIN_CM}cm`),
    left: z
        .number({ error: "Requerido" })
        .min(MIN_MARGIN_CM, `Mínimo ${MIN_MARGIN_CM}cm`)
        .max(MAX_MARGIN_CM, `Máximo ${MAX_MARGIN_CM}cm`),
});

export const paperEditorSchema = z.object({
    size: z.literal("LETTER"),
    orientation: z.literal("PORTRAIT"),
    margins_cm: marginsEditorSchema,
});

export const headerEditorSchema = z.object({
    enabled: z.boolean(),
    logo_storage_id: z.string().nullable().optional(),
    institution_name: noMarkupText(255),
    subtitle: noMarkupText(255),
    address: noMarkupText(500),
    phone: z
        .string()
        .regex(PHONE_PATTERN, "Teléfono con caracteres no permitidos")
        .nullable()
        .optional()
        .or(z.literal("")),
    email: z.string().email("Correo inválido").nullable().optional().or(z.literal("")),
});

export const footerEditorSchema = z.object({
    enabled: z.boolean(),
    custom_text: noMarkupText(1000),
    show_page_number: z.boolean(),
});

export const styleEditorSchema = z.object({
    primary_color: z.string().regex(HEX_COLOR_PATTERN, "Debe ser un color hexadecimal de 6 dígitos, p. ej. #4A4A4A"),
});

export const signerEditorSchema = z
    .object({
        display_name: noMarkupText(255),
        specialty: noMarkupText(255),
        license_number: noMarkupText(100),
        affiliation: noMarkupText(255),
    })
    .nullable()
    .optional();

export const presentationEditorSchema = z.object({
    paper: paperEditorSchema,
    header: headerEditorSchema,
    footer: footerEditorSchema,
    style: styleEditorSchema,
    signer: signerEditorSchema,
});

export type PresentationEditorValidationResult =
    | { valid: true }
    | { valid: false; fieldErrors: Record<string, string> };

/** Validates the editor's draft `presentation` state, returning one error
 * message per invalid field path (dot-joined) for inline display. */
export function validatePresentationDraft(value: unknown): PresentationEditorValidationResult {
    const result = presentationEditorSchema.safeParse(value);
    if (result.success) return { valid: true };
    const fieldErrors: Record<string, string> = {};
    for (const issue of result.error.issues) {
        const path = issue.path.join(".");
        if (!fieldErrors[path]) fieldErrors[path] = issue.message;
    }
    return { valid: false, fieldErrors };
}
