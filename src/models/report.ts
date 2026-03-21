export type ReportType = "Histopatologia" | "Histoquimica" | "Citologia_mamaria" | "Citologia_urinaria" | "Quirurgico" | "Revision_laminillas";

export type ReportStatus = "DRAFT" | "IN_REVIEW" | "APPROVED" | "PUBLISHED" | "RETRACTED";

export interface ReportBase {
    paciente: string;
    examen: string;
    folio: string;
    fechaRecepcion: string;
    especimen: string;
    diagnosticoEnvio: string | null;
}

export interface ReportSections {
    descripcionMacroscopia: string | null;
    descripcionMicroscopia: string | null;
    descripcionCitomorfologica: string | null;
    interpretacion: string | null;
    diagnostico: string | null;
    comentario: string | null;
    inmunofluorescenciaHTML: string | null;
    inmunotincionesHTML: string | null;
    microscopioElectronicoHTML: string | null;
    citologiaUrinariaHTML: string | null;
    edad: string | null;
}

export interface ReportFlags {
    incluirMacroscopia: boolean;
    incluirMicroscopia: boolean;
    incluirCitomorfologia: boolean;
    incluirInterpretacion: boolean;
    incluirDiagnostico: boolean;
    incluirComentario: boolean;
    incluirIF: boolean;
    incluirME: boolean;
    incluirEdad: boolean;
    incluirCU: boolean;
    incluirInmunotinciones: boolean;
}

export interface ReportImageItem {
    id?: string;
    url: string;
    caption?: string;
}

export interface ReportEnvelope {
    id: string;
    tenant_id: string;
    branch_id: string;
    order_id: string;
    version_no: number;
    status: ReportStatus;
    title: string;
    diagnosis_text: string;
    created_by: string;
    published_at: string | null;
    signed_by: string | null;
    signed_at: string | null;

    report: {
        tipo: ReportType;
        base: ReportBase;
        secciones: ReportSections;
        flags: ReportFlags;
        images: ReportImageItem[];
    };
}

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
// For text/richtext/table/numeric sections: content is a string (markdown).
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
    content: string;          // empty in template, markdown/text in report
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
// Defaults — all content/value fields empty (template skeleton)
// ---------------------------------------------------------------------------

/** Predefined base fields with empty value (template skeleton) */
export const DEFAULT_BASE_FIELDS: Record<string, ReportBaseFieldPredefined> = {
    order_code:         { is_visible: true, label: "Código de orden",   value: "" },
    patient:            { is_visible: true, label: "Paciente",          value: "" },
    study_type:         { is_visible: true, label: "Tipo de estudio",   value: "" },
    patient_age:        { is_visible: true, label: "Edad",              value: "" },
    sample_received_at: { is_visible: true, label: "Fecha de recepción", value: "" },
};

/** Predefined sections with empty content (template skeleton).
 *  images is the 3rd section by default. */
export const DEFAULT_SECTIONS: Record<string, ReportSectionConfig> = {
    section_macroscopic: { is_visible: true, label: "Macroscópica", type: "richtext", content: "" },
    section_microscopic: { is_visible: true, label: "Microscópica", type: "richtext", content: "" },
    images:              { is_visible: true, label: "Imágenes",     type: "images",   content: [] },
};

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
    };
}
