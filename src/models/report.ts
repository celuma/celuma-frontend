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

    report: {
        tipo: ReportType;
        base: ReportBase;
        secciones: ReportSections;
        flags: ReportFlags;
        images: ReportImageItem[];
    };
}
