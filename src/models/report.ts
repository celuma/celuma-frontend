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
// Signature metadata — flags that control the signature block of a report.
// Persisted at the same level as base/sections inside the JSON body.
// ---------------------------------------------------------------------------

/** Signature metadata as persisted in the JSON body (mirrors the backend schema). */
export interface SignatureMetadata {
    show_signature_section?: boolean;
    require_digital_signature?: boolean;
    /** Embedded by the backend at sign-time; never set from templates. */
    signature_url?: string | null;
}

/** Same shape but with the booleans guaranteed (used by consumers). */
export interface ResolvedSignatureMetadata {
    show_signature_section: boolean;
    require_digital_signature: boolean;
    signature_url?: string | null;
}

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
    /** Optional signature configuration. Absent / partial documents resolve to false/false. */
    signatureMetadata?: SignatureMetadata;
}

/** Template returned from GET /api/v1/reports/templates/ (list) */
export interface ReportTemplateListItem {
    id: string;
    tenant_id: string;
    name: string;
    description?: string;
    is_active: boolean;
    created_at: string;
    /** Post-Fase-2 remediation: administrative preference, not ownership —
     *  see template-letterhead-association-contract.md. Legado, de solo
     *  lectura desde la segunda remediación UX — usar preferred_letterhead_id. */
    preferred_letterhead_version_id?: string | null;
    /** Segunda remediación post-Fase 2 (UX): el membrete lógico preferido
     *  (no una versión concreta) — ver template-simplification-contract.md. */
    preferred_letterhead_id?: string | null;
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
    preferred_letterhead_version_id?: string | null;
    preferred_letterhead_id?: string | null;
}

// ---------------------------------------------------------------------------
// Report Template Versions — Céluma 1.3 Fase 2, Bloque D. Mirrors
// celuma-backend/app/schemas/report_template_version.py field-for-field.
// The full `configuration` shape (ReportRenderingSnapshotV2) lives in
// components/report/versioned/versioned_report_types.ts and must always be
// validated via report_snapshot_validation.ts before use — never assumed
// valid just because it came back from the API.
// ---------------------------------------------------------------------------

export type ReportTemplateVersionStatus = "PUBLISHED" | "ACTIVE" | "ARCHIVED";

/** Lightweight version metadata — never includes `configuration`. */
export interface ReportTemplateVersionSummary {
    id: string;
    tenant_id: string;
    report_template_id: string;
    version_number: number;
    schema_version: number;
    status: ReportTemplateVersionStatus;
    created_by: string | null;
    published_at: string;
    activated_at: string | null;
    archived_at: string | null;
}

/** Full version detail, including the immutable configuration. */
export interface ReportTemplateVersionDetail extends ReportTemplateVersionSummary {
    configuration: Record<string, unknown>;
}

export interface ReportTemplateVersionsListResponse {
    versions: ReportTemplateVersionSummary[];
}

/** Payload for POST /api/v1/reports/templates/{id}/versions. */
export interface CreateReportTemplateVersionPayload {
    configuration: Record<string, unknown>;
}

/** Response from POST /api/v1/reports/templates/{id}/logo. */
export interface ReportTemplateLogoUploadResponse {
    storage_object_id: string;
    url: string;
    content_type: string;
    size_bytes: number;
}

// ---------------------------------------------------------------------------
// Report envelope — the full report object as stored/retrieved from the backend
// ---------------------------------------------------------------------------

export type ReportStatus = "DRAFT" | "IN_REVIEW" | "APPROVED" | "PUBLISHED" | "RETRACTED";

/**
 * The content of the report: same shape as ReportTemplateJSON but with
 * values filled in, plus two fields the backend embeds directly in this
 * same JSON body for V2 reports only (Céluma 1.3 Fase 2, Bloque C). Kept as
 * `unknown`/loosely-typed here deliberately — the strict shape
 * (`ReportRenderingSnapshotV2`) lives in
 * components/report/versioned/versioned_report_types.ts and must be
 * obtained through report_snapshot_validation.ts, never assumed valid just
 * because the key is present.
 */
export type ReportContent = ReportTemplateJSON & {
    /** Only present for V2 reports; absent for legacy. */
    schema_version?: number;
    /** Only present for V2 reports; absent for legacy. Validate before use. */
    rendering_snapshot?: unknown;
};

/**
 * Ephemeral resources resolved server-side from a V2 report's
 * `rendering_snapshot` (Céluma 1.3 Fase 2, Bloque C, Historia C1). Never
 * part of the snapshot itself — recomputed on every read, never persisted.
 * Absent for legacy reports and for V2 reports with nothing to resolve.
 */
export interface ReportResolvedResources {
    header_logo_url?: string | null;
    /** Segunda remediación post-Fase 2 (UX): gemelo para
     *  presentation.footer.logo_storage_id. */
    footer_logo_url?: string | null;
}

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
    /**
     * Céluma 1.3 Fase 2, Bloque B/C: V2 metadata sourced from ReportVersion.
     * Absent/null for legacy reports (schema_version absent/1 inside `report`).
     * Do NOT use this top-level field to pick a renderer — resolveReportSchemaVersion
     * reads `report.schema_version` (inside the JSON body), not this one.
     */
    schema_version?: number | null;
    template_version_id?: string | null;
    /** Post-Fase-2 remediation: administrative twin of `template_version_id`
     *  — which ReportLetterheadVersion produced this version's `presentation`
     *  block. Null for legacy reports and for V2 reports created before this
     *  remediation. */
    letterhead_version_id?: string | null;
    generated_by_renderer_version?: string | null;
    /** Resolved, ephemeral resources for the current version (e.g. header logo URL). */
    resolved_resources?: ReportResolvedResources | null;
    /**
     * Céluma 1.3 Fase 2, Bloque E: official PDF artifact status for the
     * current version. `pdf_generation_status` absent/null means no
     * generation attempt has ever run (including every historical version
     * from before this block existed) — distinct from "GENERATING"/"READY"/"FAILED".
     */
    pdf_generation_status?: "GENERATING" | "READY" | "FAILED" | null;
    pdf_generated_at?: string | null;
    pdf_sha256?: string | null;
    pdf_size_bytes?: number | null;
    pdf_page_count?: number | null;
    pdf_error_code?: string | null;
    pdf_error_message?: string | null;
}

/**
 * Céluma 1.3 Fase 2, Bloque E: response of
 * GET /api/v1/reports/internal/render-data/{report_id}/{version_no},
 * consumed only by the internal, token-authenticated render route driven by
 * the backend's headless-Chromium PDF generator. Same shape as
 * `ReportEnvelope` plus the reviewer id->name lookup needed to render a real
 * signature block.
 */
export interface InternalRenderData extends ReportEnvelope {
    signer_lookup: { id: string; name: string }[];
}

/** Full report response from GET /api/v1/reports/{id}/full */
export interface ReportFullResponse {
    order: {
        id: string;
        order_code: string;
        status: string;
        patient_id?: string | null;
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
        requesting_physician?: {
            id: string;
            full_name: string;
            physician_code: string;
            specialty?: string | null;
            institution?: string | null;
        } | null;
    };
    patient?: {
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
    } | null;
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
    order_code:             { is_visible: true,  label: "Código de orden",      value: "" },
    patient:                { is_visible: true,  label: "Paciente",             value: "" },
    study_type:             { is_visible: true,  label: "Tipo de estudio",      value: "" },
    patient_age:            { is_visible: true,  label: "Edad",                 value: "" },
    requesting_physician:   { is_visible: true,  label: "Médico solicitante",   value: "" },
};

/**
 * Predefined base fields that are new additions absent from older saved templates.
 * When merging defaults into an existing template, these keys are added with
 * `is_visible: false` so they don't silently appear in reports created before
 * the field existed.
 */
export const LEGACY_PREDEFINED_BASE_HIDDEN = new Set(["requesting_physician"]);

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

/** Merge persisted order arrays: preferred first, then fallback, then any remaining keys from the map (insertion order). */
function mergeKeyOrderMaps(preferred: string[], fallback: string[], mergedMap: Record<string, unknown>): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const k of preferred) {
        if (mergedMap[k] === undefined || seen.has(k)) continue;
        out.push(k);
        seen.add(k);
    }
    for (const k of fallback) {
        if (mergedMap[k] === undefined || seen.has(k)) continue;
        out.push(k);
        seen.add(k);
    }
    for (const k of Object.keys(mergedMap)) {
        if (!seen.has(k)) {
            out.push(k);
            seen.add(k);
        }
    }
    return out;
}

/**
 * Copies base/section field definitions from saved report JSON into the template snapshot
 * when persisted content still has blocks missing from the template revision (legacy data).
 *
 * Keeps ``templateSnapshot.signatureMetadata``; does **not** copy ``signatureMetadata`` from
 * saved content onto the snapshot (those flags live on the report body separately).
 */
export function mergePersistedContentIntoTemplateSnapshot(
    templateSnapshot: ReportTemplateJSON,
    savedContent: ReportTemplateJSON | null | undefined,
): ReportTemplateJSON {
    if (!savedContent) return templateSnapshot;

    const mergedBase: Record<string, ReportBaseFieldConfig> = { ...templateSnapshot.base };
    if (savedContent.base) {
        for (const k of Object.keys(savedContent.base)) {
            if (mergedBase[k] === undefined) {
                mergedBase[k] = { ...(savedContent.base as Record<string, ReportBaseFieldConfig>)[k] };
            }
        }
    }

    const mergedSections: Record<string, ReportSectionConfig> = { ...templateSnapshot.sections };
    if (savedContent.sections) {
        for (const k of Object.keys(savedContent.sections)) {
            if (mergedSections[k] === undefined) {
                mergedSections[k] = { ...savedContent.sections[k] } as ReportSectionConfig;
            }
        }
    }

    const base_order = mergeKeyOrderMaps(
        savedContent.base_order ?? [],
        templateSnapshot.base_order ?? resolveBaseOrder({ base: mergedBase }),
        mergedBase,
    );
    const section_order = mergeKeyOrderMaps(
        savedContent.section_order ?? [],
        templateSnapshot.section_order ?? resolveSectionOrder({ sections: mergedSections }),
        mergedSections,
    );

    return {
        ...templateSnapshot,
        base: mergedBase,
        sections: mergedSections,
        base_order,
        section_order,
        signatureMetadata: templateSnapshot.signatureMetadata,
    };
}

/** Coerce legacy or partial API payloads into a full ReportTemplateJSON with canonical order arrays. */
export function normalizeReportTemplateJSON(t: TemplateOrderInput): ReportTemplateJSON {
    return {
        base: t.base ?? {},
        sections: t.sections ?? {},
        base_order: resolveBaseOrder(t),
        section_order: resolveSectionOrder(t),
        signatureMetadata: (t as { signatureMetadata?: SignatureMetadata }).signatureMetadata,
    };
}

/**
 * Resolve the signature metadata flags for a report/template document.
 *
 * Legacy documents without `signatureMetadata` (or with an invalid value) resolve
 * to `{ false, false }` so the signature toggles stay off and the block does not
 * render. `signature_url` is preserved verbatim when present (only the backend
 * embeds it, at sign-time).
 */
export function resolveSignatureMetadata(
    doc?: { signatureMetadata?: SignatureMetadata | null } | null,
): ResolvedSignatureMetadata {
    const raw = doc?.signatureMetadata;
    if (!raw || typeof raw !== "object") {
        return { show_signature_section: false, require_digital_signature: false };
    }
    const show = Boolean(raw.show_signature_section);
    const require = show && Boolean(raw.require_digital_signature);
    return {
        show_signature_section: show,
        require_digital_signature: require,
        signature_url: raw.signature_url ?? null,
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
    // Copy signature flags from the template as defaults for new reports.
    // signature_url is never inherited from templates — only the backend embeds it.
    const tmplSig = resolveSignatureMetadata(template);
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
        signatureMetadata: {
            show_signature_section: tmplSig.show_signature_section,
            require_digital_signature: tmplSig.require_digital_signature,
        },
    };
}
