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

/** Field types available for custom base fields and custom sections */
export type TemplateFieldType = "numeric" | "text" | "richtext" | "table";

/** Config for a predefined base field (e.g. order_code, patient_code) */
export interface ReportBaseFieldPredefined {
    is_visible: boolean;
    label?: string;
}

/** Config for a custom base field created by the user */
export interface ReportBaseFieldCustom {
    is_visible: boolean;
    label: string;
    type: TemplateFieldType;
    is_custom: true;
}

export type ReportBaseFieldConfig = ReportBaseFieldPredefined | ReportBaseFieldCustom;

/** Config for a predefined section (section_macroscopic, section_microscopic) */
export interface ReportSectionPredefined {
    is_visible: boolean;
    label?: string;
}

/** Config for a custom section created by the user */
export interface ReportSectionCustom {
    is_visible: boolean;
    label: string;
    type: TemplateFieldType;
    is_custom: true;
}

export type ReportSectionConfig = ReportSectionPredefined | ReportSectionCustom;

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

/** The predefined base fields present in every new template */
export const DEFAULT_BASE_FIELDS: Record<string, ReportBaseFieldPredefined> = {
    order_code:           { is_visible: true,  label: "Código de orden" },
    patient_code:         { is_visible: true,  label: "Código de paciente" },
    study_type_name:      { is_visible: true,  label: "Tipo de estudio" },
    samples_description:  { is_visible: true,  label: "Descripción de muestra" },
    diagnosis_text:       { is_visible: true,  label: "Diagnóstico de envío" },
    patient_age:          { is_visible: true,  label: "Edad" },
    received_at_sample:   { is_visible: true,  label: "Fecha de recepción" },
};

/** The predefined sections present in every new template */
export const DEFAULT_SECTIONS: Record<string, ReportSectionPredefined> = {
    section_macroscopic: { is_visible: true,  label: "Macroscópica" },
    section_microscopic: { is_visible: true,  label: "Microscópica" },
    images:              { is_visible: true,  label: "Imágenes" },
};

/** Builds the default template_json used when creating a new template */
export function buildDefaultTemplateJSON(): ReportTemplateJSON {
    return {
        base: { ...DEFAULT_BASE_FIELDS },
        sections: { ...DEFAULT_SECTIONS },
    };
}
