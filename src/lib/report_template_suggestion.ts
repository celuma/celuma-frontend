/**
 * The report template a NEW order's form suggests (Céluma 1.4.1).
 *
 * Mirrors the defaults half of `app/services/order_report_template.py` so the
 * registration form can show, before anything is saved, what the server will
 * resolve: the sample types' template when the selected samples agree on one,
 * else the study type's, else nothing. Samples that disagree are AMBIGUOUS and
 * need an explicit choice; no candidate is taken by list order.
 *
 * Only a suggestion. The form sends `report_template_id` solely when the user
 * chose one explicitly, and the API resolves and enforces the rest. Computed
 * synchronously from catalogs already loaded, so changing samples or the study
 * type never races a request against the user's choice.
 *
 * Contract: `celuma-engineering/specs/laboratory/order-report-template.md`.
 */
import type { ReportTemplateRef, ReportTemplateSource, ReportTemplateStatus } from "../models/report_letterhead";

export interface TemplateSuggestion {
    status: Exclude<ReportTemplateStatus, "INACTIVE">;
    template: ReportTemplateRef | null;
    source: Exclude<ReportTemplateSource, "ORDER"> | null;
    /** AMBIGUOUS only: the distinct suggestions, by name then id (display order only). */
    candidates: ReportTemplateRef[];
}

interface WithDefaultTemplate {
    id: string;
    default_template?: { id: string; name: string } | null;
}

const byNameThenId = (a: ReportTemplateRef, b: ReportTemplateRef) =>
    a.name.localeCompare(b.name, "es", { sensitivity: "base" }) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * @param sampleTypeIds  the sample type of each sample row (blanks ignored)
 * @param sampleTypes    the active sample-type catalog (with `default_template`)
 * @param studyType      the selected study type, if any
 * @param activeTemplateIds  ids of the active templates, when the catalog could be read; a default that is
 *                       not among them is ignored like an unset one (the API does the same). `null` = unknown.
 */
export function suggestReportTemplate(
    sampleTypeIds: Array<string | null | undefined>,
    sampleTypes: WithDefaultTemplate[],
    studyType: WithDefaultTemplate | null | undefined,
    activeTemplateIds: ReadonlySet<string> | null = null,
): TemplateSuggestion {
    const usable = (ref?: { id: string; name: string } | null): ReportTemplateRef | null =>
        ref && (activeTemplateIds === null || activeTemplateIds.has(ref.id)) ? { id: ref.id, name: ref.name } : null;

    const byId = new Map(sampleTypes.map((t) => [t.id, t]));
    const found = new Map<string, ReportTemplateRef>();
    for (const typeId of new Set(sampleTypeIds.filter((v): v is string => Boolean(v)))) {
        const template = usable(byId.get(typeId)?.default_template);
        if (template) found.set(template.id, template);
    }
    const candidates = [...found.values()].sort(byNameThenId);
    if (candidates.length === 1) {
        return { status: "RESOLVED", template: candidates[0], source: "SAMPLE_TYPE", candidates: [] };
    }
    if (candidates.length > 1) {
        return { status: "AMBIGUOUS", template: null, source: null, candidates };
    }
    const study = usable(studyType?.default_template);
    if (study) return { status: "RESOLVED", template: study, source: "STUDY_TYPE", candidates: [] };
    return { status: "NONE", template: null, source: null, candidates: [] };
}

/** Spanish label of a template's origin, for helper text. */
export const TEMPLATE_SOURCE_LABEL: Record<ReportTemplateSource, string> = {
    ORDER: "elegida para esta orden",
    SAMPLE_TYPE: "sugerida por el tipo de muestra",
    STUDY_TYPE: "sugerida por el tipo de estudio",
};
