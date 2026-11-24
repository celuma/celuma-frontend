/**
 * Céluma 1.5 (#69 review) — Patient and Requesting-physician options of the order forms.
 *
 * The option keeps the `label` string the forms already built: it is still what the select
 * searches (`optionFilterProp="label"`), what the closed field and the chips show, and what
 * the option's text reads. `code`, `name` and `detail` only let the dropdown row present it
 * like the #69 catalog selectors (full name, code chip, secondary line). Nothing here sorts:
 * options keep the API order.
 */
export interface PersonOption {
    value: string;
    /** The pre-existing label, unchanged. */
    label: string;
    code: string;
    name: string;
    /** Secondary details as shown in the label after `separator`, e.g. "Dermatología · Hospital X". */
    detail?: string;
    /** The text between the code and the name inside `label` (" - " in both forms). */
    separator: string;
    /** The text between the name and `detail` inside `label` (" · "), when the label carries details. */
    detailSeparator?: string;
    /** Details shown in the row only, not part of `label` (and so not searched). */
    extraDetail?: string;
}

const CODE_SEPARATOR = " - ";
const DETAIL_SEPARATOR = " · ";

/** "PAC-001 - Ana Ruiz" — exactly the label both order forms already used. */
export function patientOption(row: { id: string; patient_code: string; first_name?: string | null; last_name?: string | null }): PersonOption {
    const name = row.first_name ? `${row.first_name} ${row.last_name ?? ""}`.trim() : "";
    const label = `${row.patient_code}${row.first_name ? `${CODE_SEPARATOR}${row.first_name} ${row.last_name ?? ""}` : ""}`.trim();
    return { value: row.id, label, code: row.patient_code, name, separator: CODE_SEPARATOR };
}

export interface PhysicianRow {
    id: string;
    physician_code: string;
    full_name: string;
    specialty?: string | null;
    institution?: string | null;
}

const physicianDetails = (row: PhysicianRow) => [row.specialty, row.institution].filter((v): v is string => Boolean(v)).join(DETAIL_SEPARATOR);

/**
 * Registrar caso: "CODE - Nombre · especialidad · institución", searched in full (as before).
 */
export function physicianOption(row: PhysicianRow): PersonOption {
    const detail = physicianDetails(row);
    const label = `${row.physician_code}${CODE_SEPARATOR}${row.full_name}${row.specialty ? `${DETAIL_SEPARATOR}${row.specialty}` : ""}${row.institution ? `${DETAIL_SEPARATOR}${row.institution}` : ""}`.trim();
    return {
        value: row.id, label, code: row.physician_code, name: row.full_name, separator: CODE_SEPARATOR,
        ...(detail ? { detail, detailSeparator: DETAIL_SEPARATOR } : {}),
    };
}

/**
 * Editar orden: the label stays "CODE - Nombre" (chips and search unchanged); specialty and
 * institution, when the API returns them, are shown on the row's second line only.
 */
export function physicianOptionCompact(row: PhysicianRow): PersonOption {
    const detail = physicianDetails(row);
    return {
        value: row.id, label: `${row.physician_code}${CODE_SEPARATOR}${row.full_name}`, code: row.physician_code, name: row.full_name,
        separator: CODE_SEPARATOR, ...(detail ? { extraDetail: detail } : {}),
    };
}
