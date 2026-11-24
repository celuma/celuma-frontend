/**
 * Which registration field and sample row a refused request points at (Céluma 1.5, #67).
 *
 * Two shapes come from the API:
 *  - request validation (422): `detail: [{ loc: ["body", "samples", 1, "received_at"], msg }]`;
 *  - the checks against the laboratory's data (branch, patient, physicians, study type, each
 *    sample's type, the report template, the manual-code permission):
 *    `detail: { code, message, fields: ["samples.1.sample_type_id", …] }`.
 * Paths are translated to the form's field names, with a Spanish message per field; what
 * cannot be placed on a field stays in the form's summary.
 */
import { formatHttpError } from "./api_error";

export interface FieldProblem {
    /** Form field path, e.g. "samples.1.sample_type_id" or "patient_id". */
    field: string;
    message: string;
    /** Index of the sample row, when the field belongs to one. */
    row?: number;
}

export interface RegistrationProblem {
    fields: FieldProblem[];
    /** A message for the form's summary: what happened and, if nothing could be placed, why. */
    summary: string;
}

/** API body field → form field (the forms use date-only names for the dates). */
const FORM_FIELD: Record<string, string> = {
    received_at: "received_date",
    collected_at: "collected_date",
};

const FIELD_MESSAGES: Record<string, string> = {
    branch_id: "Revise la sucursal.",
    patient_id: "Revise el paciente.",
    requesting_physician_ids: "Revise los médicos solicitantes.",
    study_type_id: "Revise el tipo de estudio.",
    expediente: "Revise el expediente (máximo 100 caracteres).",
    notes: "Revise la descripción.",
    requested_by: "Revise el solicitante (máximo 255 caracteres).",
    report_template_id: "Revise la plantilla del reporte.",
    order_id: "Revise la orden.",
    sample_type_id: "Revise el tipo de muestra.",
    received_date: "Revise la fecha de recepción: es obligatoria y debe ser una fecha válida.",
    collected_date: "Revise la fecha de recolección.",
    sample_code: "Revise el código de muestra.",
};

/** Messages for the codes `app/services/registration_errors.py` emits. */
const CODE_MESSAGES: Record<string, string> = {
    branch_not_found: "La sucursal ya no está disponible.",
    branch_not_in_tenant: "La sucursal no pertenece a tu laboratorio.",
    patient_invalid: "El paciente ya no está disponible.",
    patient_or_physician_required: "Seleccione un paciente, al menos un médico solicitante o ambos.",
    requesting_physician_invalid: "Uno de los médicos solicitantes ya no está disponible.",
    requesting_physician_conflict: "Revise los médicos solicitantes.",
    study_type_not_found: "El tipo de estudio ya no está disponible.",
    study_type_not_in_tenant: "El tipo de estudio no pertenece a tu laboratorio.",
    sample_type_not_found: "Este tipo de muestra ya no está en el catálogo. Elija otro.",
    sample_type_inactive: "Este tipo de muestra fue desactivado. Elija otro.",
    report_template_not_found: "La plantilla elegida ya no está disponible.",
    report_template_invalid: "La plantilla elegida no se puede usar. Elija otra.",
    manual_code_permission_required: "No tiene permiso para escribir códigos de muestra. Use el código automático.",
};

function toFormPath(parts: Array<string | number>): { field: string; row?: number } {
    const mapped = parts.map((p) => (typeof p === "string" ? FORM_FIELD[p] ?? p : p));
    const row = mapped[0] === "samples" && typeof mapped[1] === "number" ? mapped[1] : undefined;
    return { field: mapped.join("."), row };
}

function leafMessage(field: string): string {
    const leaf = field.split(".").pop() ?? field;
    return FIELD_MESSAGES[leaf] ?? "Revise este dato.";
}

function rowPhrase(problems: FieldProblem[]): string {
    const rows = [...new Set(problems.map((p) => p.row).filter((r): r is number => r !== undefined))].sort((a, b) => a - b);
    if (rows.length === 0) return "";
    const labels = rows.map((r) => r + 1).join(", ");
    return rows.length === 1 ? ` (muestra ${labels})` : ` (muestras ${labels})`;
}

/**
 * Field problems of a refused registration. `knownFields` are the form's own fields:
 * anything else (tenant, a stale field) goes to the summary only.
 */
export function registrationProblem(status: number, body: unknown, knownFields: (field: string) => boolean): RegistrationProblem {
    const detail = (body as { detail?: unknown } | null | undefined)?.detail;
    const fields: FieldProblem[] = [];

    if (Array.isArray(detail)) {
        for (const item of detail as Array<{ loc?: unknown[] }>) {
            const loc = (item.loc ?? []).filter((p): p is string | number => typeof p === "string" || typeof p === "number");
            const parts = loc[0] === "body" ? loc.slice(1) : loc;
            if (parts.length === 0) continue;
            const { field, row } = toFormPath(parts);
            if (knownFields(field) && !fields.some((f) => f.field === field)) fields.push({ field, row, message: leafMessage(field) });
        }
    } else if (detail && typeof detail === "object") {
        const { code, fields: paths } = detail as { code?: string; fields?: unknown };
        if (Array.isArray(paths)) {
            for (const raw of paths) {
                if (typeof raw !== "string") continue;
                const parts = raw.split(".").map((p) => (/^\d+$/.test(p) ? Number(p) : p));
                const { field, row } = toFormPath(parts);
                if (!knownFields(field) || fields.some((f) => f.field === field)) continue;
                fields.push({ field, row, message: (code && CODE_MESSAGES[code]) || leafMessage(field) });
            }
        }
    }

    const text = typeof body === "string" ? body : JSON.stringify(body ?? "");
    const summary = fields.length > 0
        ? `No se registró nada. Corrija los campos marcados${rowPhrase(fields)}; los demás datos se conservaron.`
        : `No se registró nada: ${formatHttpError(status, text)} Los datos capturados se conservaron.`;
    return { fields, summary };
}
