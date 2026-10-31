import type { ReportEnvelope, TemplateOrderInput } from "../../../models/report";
import { normalizeReportTemplateJSON, PREDEFINED_BASE_KEYS, resolveBaseFieldLabel, resolveDisplayOrder } from "../../../models/report";
import type { RepeatedFieldRow } from "./report_page_bands";

/**
 * The printable text of a general-data value, or `null` when the field has nothing to print
 * (Céluma 1.4, #44: an empty field is omitted — label and placeholder — instead of printing
 * "Sin especificar"). Missing, `null` and blank or whitespace-only text are empty; a number (`0`
 * included) or a boolean (`false` included) is a meaningful value and is printed as stored. Shared by
 * the general-data block and the repeated band so both always agree on which fields appear. It only
 * decides what is drawn: stored values are never rewritten.
 */
export function baseFieldDisplayValue(raw: unknown): string | null {
    if (typeof raw === "string") return raw.trim() === "" ? null : raw;
    if (typeof raw === "number") return Number.isFinite(raw) ? String(raw) : null;
    if (typeof raw === "boolean") return String(raw);
    return null;
}

/**
 * The visible PREDEFINED fields the template marks "repeat on every page" (Céluma 1.4, #15), with
 * their stored values, in the report's display order. Visibility, label and order are exactly the
 * ones the body uses; a hidden field never repeats and a custom field is never repeatable. A field
 * with no printable value is left out (#44), so a band whose values are all empty is not drawn.
 */
export function resolveRepeatedFieldRows(report: ReportEnvelope, snapshotTemplate: unknown): RepeatedFieldRow[] {
    const tmpl = normalizeReportTemplateJSON(
        (snapshotTemplate ?? { base: {}, sections: {} }) as unknown as TemplateOrderInput,
    );
    const contentData = report.report ?? { base: {}, sections: {} };
    const { baseOrder } = resolveDisplayOrder(tmpl, contentData);
    return baseOrder
        .map((key) => {
            const field = tmpl.base[key];
            if (!field?.is_visible || !PREDEFINED_BASE_KEYS.has(key)) return null;
            if ((field as { is_custom?: boolean }).is_custom === true) return null;
            if (field.repeat_on_every_page !== true) return null;
            const value = baseFieldDisplayValue(contentData.base[key]?.value);
            if (value === null) return null;
            return { key, label: resolveBaseFieldLabel(key, field), value: value.trim() };
        })
        .filter((row): row is RepeatedFieldRow => row !== null);
}
