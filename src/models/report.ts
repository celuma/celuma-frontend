export interface ReportBase {
    paciente: string;
    folio: string;
    examen: string;
    fechaRecepcion: string;
    especimen: string;
    diagnosticoEnvio: string | null;
}

export interface ReportSections {
    descripcionMacroscopia: string;
    descripcionMicroscopia: string;
    descripcionCitomorfologica: string | null;
    interpretacion: string | null;
    diagnostico: string;
    comentario: string;
    inmunofluorescenciaHTML: string | null;
    inmunohistoquimicaHTML: string | null;
    microscopioElectronicoHTML: string | null;
}

export interface ReportFlags {
    incluirIF: boolean;
    incluirIHQ: boolean;
    incluirME: boolean;
}

export interface Report {
    id: string;
    tipo: string;
    base: ReportBase;
    secciones: ReportSections;
    flags: ReportFlags;
    createdAt?: string;
    updatedAt?: string;
}
