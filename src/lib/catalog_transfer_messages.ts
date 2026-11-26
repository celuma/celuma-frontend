/**
 * Céluma 1.5 (#65): Spanish text for the per-record issues and warnings of a catalog
 * import/copy preview (`app/services/catalog_transfer.py`).
 *
 * The backend writes them in English and tags each with a stable `code` (and the
 * `field` it concerns); the UI translates the code. A Spanish message is kept as is;
 * an unknown English one becomes a generic Spanish note, never shown raw.
 */
import { looksSpanish } from "./api_error";
import type { TransferIssue } from "../models/sample_type";

const FIELD_ES: Record<string, string> = {
    code: "El código",
    name: "El nombre",
    description: "La descripción",
    is_active: "El campo «activo»",
    provenance: "La procedencia",
    default_report_template_id: "La plantilla de reporte",
};

/** The field an issue concerns: its `field`, else the first word of the English message. */
function fieldOf(issue: TransferIssue): string {
    const raw = issue.field ?? (issue.message ?? "").match(/^([\w.]+)\s/)?.[1] ?? "";
    return FIELD_ES[raw] ?? "Un campo";
}

/** A quoted value of the English message: "Code 'BIO' appears…" → "BIO". */
function quoted(message: string | null | undefined): string | null {
    return (message ?? "").match(/'([^']*)'/)?.[1] ?? null;
}

export const GENERIC_TRANSFER_ISSUE = "Revisa este registro.";

const ISSUE_ES: Record<string, (issue: TransferIssue) => string> = {
    required: (i) => `${fieldOf(i)} es obligatorio.`,
    invalid_type: (i) => `${fieldOf(i)} tiene un tipo de dato no válido.`,
    invalid_characters: (i) => `${fieldOf(i)} contiene caracteres de control.`,
    too_long: (i) => {
        const limit = (i.message ?? "").match(/exceed (\d+)/)?.[1];
        return limit ? `${fieldOf(i)} supera el máximo de ${limit} caracteres.` : `${fieldOf(i)} es demasiado largo.`;
    },
    invalid_item: () => "El registro no es un objeto válido.",
    unknown_field_ignored: (i) => {
        const fields = (i.message ?? "").match(/^Ignored fields:\s*(.+)$/)?.[1];
        return fields ? `Se ignoraron campos desconocidos: ${fields}.` : "Se ignoraron campos desconocidos.";
    },
    provenance_ignored: () => "Se ignoró el identificador de procedencia porque no es un texto corto.",
    template_reference_dropped: () =>
        "La plantilla de reporte referida no existe en este laboratorio; el tipo de muestra se crea sin plantilla.",
    duplicate_in_source: (i) => {
        const code = quoted(i.message);
        return code ? `El código «${code}» aparece antes en el archivo.` : "El código aparece antes en el archivo.";
    },
    code_exists: (i) => {
        const code = quoted(i.message);
        // Céluma 1.5 (#94): a code of a type removed from the catalog stays reserved.
        const inactive = /\(removed/i.test(i.message ?? "")
            ? " (eliminado del catálogo; el código sigue reservado por sus muestras)"
            : /\(inactive\)/i.test(i.message ?? "") ? " (inactivo)" : "";
        return code
            ? `Ya existe un tipo de muestra con el código «${code}»${inactive}.`
            : `Ya existe un tipo de muestra con este código${inactive}.`;
    },
    name_exists: () => "Ya existe un tipo de muestra con este nombre.",
    source_inactive: () => "El tipo de estudio está inactivo; el tipo de muestra también se crea inactivo.",
};

/** The Spanish text for one issue or warning of a transfer preview. */
export function transferIssueMessage(issue: TransferIssue): string {
    const translate = ISSUE_ES[issue.code];
    if (translate) return translate(issue);
    const message = (issue.message ?? "").trim();
    return message && looksSpanish(message) ? message : GENERIC_TRANSFER_ISSUE;
}
