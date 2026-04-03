// ---------------------------------------------------------------------------
// Template JSON types
// ---------------------------------------------------------------------------

/** Field types available for custom base fields and sections */
export type TemplateFieldType = "numeric" | "text" | "richtext" | "table" | "images";

// ---------------------------------------------------------------------------
// Base fields — each field has visibility, a label, type, and a value
// (value is empty string in the template; filled when creating a report)
// ---------------------------------------------------------------------------

/** A predefined base field (e.g. order_code, patient_code) */
export interface ReportBaseFieldPredefined {
    is_visible: boolean;
    label: string;
    value: string;           // empty in template, filled in report
}

/** A custom base field created by the user — only text/numeric */
export interface ReportBaseFieldCustom extends ReportBaseFieldPredefined {
    type: "text" | "numeric";
    is_custom: true;
}

export type ReportBaseFieldConfig = ReportBaseFieldPredefined | ReportBaseFieldCustom;

// ---------------------------------------------------------------------------
// Sections — each section has visibility, a label, type, and content.
// For text/richtext/table/numeric sections: content is a string (markdown/html).
// For the images section: content is an array of TemplateImageItem.
// ---------------------------------------------------------------------------

export interface TemplateImageItem {
    id: string;
    url: string;
    caption: string;
}

/** A text-based section (text, richtext, table, numeric) */
export interface ReportSectionText {
    is_visible: boolean;
    label: string;
    type: "text" | "richtext" | "table" | "numeric";
    content: string;          // empty in template, html/text in report
}

/** A custom text-based section created by the user */
export interface ReportSectionTextCustom extends ReportSectionText {
    is_custom: true;
}

/** The images section — content is an array of image items */
export interface ReportSectionImages {
    is_visible: boolean;
    label: string;
    type: "images";
    content: TemplateImageItem[];  // empty array in template, filled in report
}

export type ReportSectionConfig =
    | ReportSectionText
    | ReportSectionTextCustom
    | ReportSectionImages;

// ---------------------------------------------------------------------------
// Full template_json structure saved in the backend
// ---------------------------------------------------------------------------

/** The structure saved in template_json on the backend */
export interface ReportTemplateJSON {
    base: Record<string, ReportBaseFieldConfig>;
    sections: Record<string, ReportSectionConfig>;
    /** Display order of base field ids (source of truth; do not rely on object key order). */
    base_order: string[];
    /** Display order of section ids (source of truth). */
    section_order: string[];
}

/** Template returned from GET /api/v1/reports/templates/ (list) */
export interface ReportTemplateListItem {
    id: string;
    tenant_id: string;
    name: string;
    description?: string;
    is_active: boolean;
    created_at: string;
}

/** Template returned from GET /api/v1/reports/templates/{id} (detail) */
export interface ReportTemplateDetail extends ReportTemplateListItem {
    template_json: ReportTemplateJSON;
    created_by: string;
}

/** Payload for POST /api/v1/reports/templates/ */
export interface CreateReportTemplatePayload {
    name: string;
    description?: string;
    template_json: ReportTemplateJSON;
}

/** Payload for PUT /api/v1/reports/templates/{id} */
export interface UpdateReportTemplatePayload {
    name?: string;
    description?: string;
    template_json?: ReportTemplateJSON;
    is_active?: boolean;
}

// ---------------------------------------------------------------------------
// Report envelope — the full report object as stored/retrieved from the backend
// ---------------------------------------------------------------------------

export type ReportStatus = "DRAFT" | "IN_REVIEW" | "APPROVED" | "PUBLISHED" | "RETRACTED";

/** The content of the report: same shape as ReportTemplateJSON but with values filled in */
export type ReportContent = ReportTemplateJSON;

/** Full report envelope returned by GET /api/v1/reports/{id} and POST /api/v1/reports/ */
export interface ReportEnvelope {
    id: string;
    version_no: number;
    status: ReportStatus;
    order_id: string;
    tenant_id: string;
    branch_id: string;
    title: string;
    published_at: string | null;
    created_by: string;
    signed_by: string | null;
    signed_at: string | null;
    /** Raw template snapshot at time of creation */
    template: ReportTemplateJSON;
    /** Content of the report (same shape as template but with values filled) */
    report: ReportContent;
}

/** Full report response from GET /api/v1/reports/{id}/full */
export interface ReportFullResponse {
    order: {
        id: string;
        order_code: string;
        status: string;
        patient_id: string;
        tenant_id: string;
        branch_id: string;
        requested_by?: string | null;
        notes?: string | null;
        billed_lock?: boolean;
        report_id?: string | null;
        study_type_id?: string | null;
        invoice_id?: string | null;
        assignees?: Array<{ id: string; name: string; email: string; avatar_url?: string | null }>;
        reviewers?: Array<{ id: string; name: string; email: string; avatar_url?: string | null; status: string; review_id?: string | null }>;
        labels?: Array<{ id: string; name: string; color: string; inherited?: boolean }>;
    };
    patient: {
        id: string;
        tenant_id: string;
        branch_id: string;
        patient_code: string;
        first_name?: string;
        last_name?: string;
        dob?: string | null;
        sex?: string | null;
        phone?: string | null;
        email?: string | null;
    };
    samples: Array<{
        id: string;
        sample_code: string;
        type: string;
        state: string;
        order_id: string;
        tenant_id: string;
        branch_id: string;
        received_at?: string | null;
    }>;
    report: ReportEnvelope;
    template?: ReportTemplateJSON | null;
}

/** Study type as returned by GET /api/v1/study-types/{id} */
export interface StudyTypeDetail {
    id: string;
    tenant_id: string;
    code: string;
    name: string;
    description?: string;
    is_active: boolean;
    created_at: string;
    default_report_template_id?: string | null;
    default_template?: {
        id: string;
        name: string;
    } | null;
}

// ---------------------------------------------------------------------------
// Defaults — all content/value fields empty (template skeleton)
// ---------------------------------------------------------------------------

/** Predefined base fields with empty value (template skeleton) */
export const DEFAULT_BASE_FIELDS: Record<string, ReportBaseFieldPredefined> = {
    order_code:         { is_visible: true, label: "Código de orden",    value: "" },
    patient:            { is_visible: true, label: "Paciente",           value: "" },
    study_type:         { is_visible: true, label: "Tipo de estudio",    value: "" },
    patient_age:        { is_visible: true, label: "Edad",               value: "" },
};

/** Predefined sections with empty content (template skeleton).
 *  images is the 3rd section by default. */
export const DEFAULT_SECTIONS: Record<string, ReportSectionConfig> = {
    section_macroscopic: { is_visible: true, label: "Macroscópica", type: "richtext", content: "" },
    section_microscopic: { is_visible: true, label: "Microscópica", type: "richtext", content: "" },
    images:              { is_visible: true, label: "Imágenes",     type: "images",   content: [] },
};

/** Default base field ids in display order (matches DEFAULT_BASE_FIELDS insertion order). */
export const DEFAULT_BASE_ORDER: string[] = Object.keys(DEFAULT_BASE_FIELDS);

/** Default section ids in display order (matches DEFAULT_SECTIONS insertion order). */
export const DEFAULT_SECTION_ORDER: string[] = Object.keys(DEFAULT_SECTIONS);

/** Input for order resolution when `base_order` may be missing (legacy API payloads). */
export type TemplateOrderInput = {
    base: Record<string, ReportBaseFieldConfig>;
    sections: Record<string, ReportSectionConfig>;
    base_order?: string[];
    section_order?: string[];
};

/**
 * Canonical display order for base fields: use base_order when present and non-empty,
 * else Object.keys(base); filter unknown ids; append any key in base missing from the list.
 */
export function resolveBaseOrder(t: Pick<TemplateOrderInput, "base" | "base_order">): string[] {
    const keysInBase = Object.keys(t.base ?? {});
    const raw = t.base_order?.length ? t.base_order : keysInBase;
    const seen = new Set<string>();
    const result: string[] = [];
    for (const k of raw) {
        if (t.base[k] !== undefined && !seen.has(k)) {
            seen.add(k);
            result.push(k);
        }
    }
    for (const k of keysInBase) {
        if (!seen.has(k)) {
            seen.add(k);
            result.push(k);
        }
    }
    return result;
}

/** Same as resolveBaseOrder for sections. */
export function resolveSectionOrder(t: Pick<TemplateOrderInput, "sections" | "section_order">): string[] {
    const keysInSections = Object.keys(t.sections ?? {});
    const raw = t.section_order?.length ? t.section_order : keysInSections;
    const seen = new Set<string>();
    const result: string[] = [];
    for (const k of raw) {
        if (t.sections[k] !== undefined && !seen.has(k)) {
            seen.add(k);
            result.push(k);
        }
    }
    for (const k of keysInSections) {
        if (!seen.has(k)) {
            seen.add(k);
            result.push(k);
        }
    }
    return result;
}

/**
 * Resolve the effective display order for a report, merging template definitions
 * with an optional saved content order.
 *
 * Priority: content.base_order (if non-empty) > template.base_order > Object.keys(template.base)
 * The template's base/sections maps are always used for metadata (labels, types, visibility).
 */
export function resolveDisplayOrder(
    template: Pick<TemplateOrderInput, "base" | "sections" | "base_order" | "section_order">,
    content?: { base_order?: string[]; section_order?: string[] } | null,
): { baseOrder: string[]; sectionOrder: string[] } {
    const contentBaseOrder = content?.base_order?.length ? content.base_order : undefined;
    const contentSectionOrder = content?.section_order?.length ? content.section_order : undefined;
    return {
        baseOrder: resolveBaseOrder({ base: template.base, base_order: contentBaseOrder ?? template.base_order }),
        sectionOrder: resolveSectionOrder({ sections: template.sections, section_order: contentSectionOrder ?? template.section_order }),
    };
}

/** Coerce legacy or partial API payloads into a full ReportTemplateJSON with canonical order arrays. */
export function normalizeReportTemplateJSON(t: TemplateOrderInput): ReportTemplateJSON {
    return {
        base: t.base ?? {},
        sections: t.sections ?? {},
        base_order: resolveBaseOrder(t),
        section_order: resolveSectionOrder(t),
    };
}

/** Builds the default template_json skeleton used when creating a new template */
export function buildDefaultTemplateJSON(): ReportTemplateJSON {
    return {
        base: Object.fromEntries(
            Object.entries(DEFAULT_BASE_FIELDS).map(([k, v]) => [k, { ...v }])
        ) as Record<string, ReportBaseFieldConfig>,
        sections: {
            section_macroscopic: { is_visible: true, label: "Macroscópica", type: "richtext", content: "" },
            section_microscopic: { is_visible: true, label: "Microscópica", type: "richtext", content: "" },
            images:              { is_visible: true, label: "Imágenes",     type: "images",   content: [] },
        },
        base_order: [...DEFAULT_BASE_ORDER],
        section_order: [...DEFAULT_SECTION_ORDER],
    };
}

/** Builds an empty ReportContent from a template (same shape, content zeroed) */
export function buildEmptyReportContent(template: ReportTemplateJSON): ReportContent {
    const bo = resolveBaseOrder(template);
    const so = resolveSectionOrder(template);
    return {
        base: Object.fromEntries(
            bo.map((k) => {
                const v = template.base[k];
                return [k, { ...v, value: "" }];
            })
        ) as Record<string, ReportBaseFieldConfig>,
        sections: Object.fromEntries(
            so.map((k) => {
                const v = template.sections[k];
                if (v.type === "images") {
                    return [k, { ...v, content: [] as TemplateImageItem[] }];
                }
                return [k, { ...v, content: (v as ReportSectionText).content || "" }];
            })
        ) as Record<string, ReportSectionConfig>,
        base_order: [...bo],
        section_order: [...so],
    };
}
