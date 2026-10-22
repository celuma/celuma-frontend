import type { ReportEnvelope, TemplateOrderInput } from "../../../models/report";
import { normalizeReportTemplateJSON, PREDEFINED_BASE_KEYS, resolveBaseFieldLabel, resolveDisplayOrder } from "../../../models/report";
import type { RepeatedFieldRow } from "./report_page_bands";

/**
 * The visible PREDEFINED fields the template marks "repeat on every page" (Céluma 1.4, #15), with
 * their stored values, in the report's display order. Visibility, label and order are exactly the
 * ones the body uses; a hidden field never repeats and a custom field is never repeatable.
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
            return {
                key,
                label: resolveBaseFieldLabel(key, field),
                value: ((contentData.base[key]?.value as string) ?? "").trim(),
            };
        })
        .filter((row): row is RepeatedFieldRow => row !== null);
}
