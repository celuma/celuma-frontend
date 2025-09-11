export interface ReportBase {
    paciente: string;
    examen: string;
    folio: string;
    fechaRecepcion: string;
    especimen: string;
    diagnosticoEnvio: string | null;
}

export interface ReportSections {
    descripcionMacroscopia: string;
    descripcionMicroscopia: string;
    descripcionCitomorfologica: string | null;
    inmunofluorescenciaHTML: string | null;
    diagnostico: string;
    comentario: string;
    microscopioElectronicoHTML: string | null;
    interpretacion: string | null;
    edad: string | null;
    citologiaUrinariaHTML: string | null;
    inmunotincionesHTML: string | null;
    inmunohistoquimicaHTML: string | null;
}

export interface ReportFlags {
    incluirMacroscopia: boolean;
    incluirMicroscopia: boolean;
    incluirCitomorfologia: boolean;
    incluirIF: boolean;
    incluirDiagnostico: boolean;
    incluirComentario: boolean;
    incluirME: boolean;
    incluirInterpretacion: boolean;
    incluirEdad: boolean;
    incluirCU: boolean;
    incluirInmunotinciones: boolean;
    incluirIHQ: boolean;
}

export interface ReportImage {
    url: string;
    caption?: string;
}

export interface Report {
    id: string;
    tipo: string;
    base: ReportBase;
    secciones: ReportSections;
    flags: ReportFlags;
    images?: ReportImage[];
    createdAt?: string;
    updatedAt?: string;
}
