import type {
    ReportEnvelope,
    ReportFullResponse,
    StudyTypeDetail,
    ReportTemplateListItem,
    ReportTemplateDetail,
    CreateReportTemplatePayload,
    UpdateReportTemplatePayload,
} from "../models/report";

const base = import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL as string) || "/api";

function getAuthToken(): string | null {
    return localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
    const token = getAuthToken();
    const headers: Record<string, string> = { ...extra };
    if (token) headers["Authorization"] = token;
    return headers;
}

// ---------------------------------------------------------------------------
// Report CRUD
// ---------------------------------------------------------------------------

export async function saveReport(report: ReportEnvelope): Promise<ReportEnvelope> {
    const res = await fetch(`${base}/v1/reports/`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(report),
    });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Error al guardar reporte: ${res.status} - ${errText}`);
    }
    return await res.json();
}

export async function saveReportVersion(report: ReportEnvelope): Promise<void> {
    const res = await fetch(`${base}/v1/reports/${report.id}/new_version`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(report),
    });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Error al guardar nueva versión del reporte: ${res.status} - ${errText}`);
    }
}

export async function getReport(reportId: string): Promise<ReportEnvelope> {
    const res = await fetch(`${base}/v1/reports/${reportId}`, {
        method: "GET",
        headers: authHeaders({ Accept: "application/json" }),
    });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Error al obtener reporte: ${res.status} - ${errText}`);
    }
    return (await res.json()) as ReportEnvelope;
}

/** Returns all data needed to render the report editor: order, patient, samples, report, template */
export async function getReportFull(reportId: string): Promise<ReportFullResponse> {
    const res = await fetch(`${base}/v1/reports/${reportId}/full`, {
        method: "GET",
        headers: authHeaders({ Accept: "application/json" }),
    });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Error al obtener reporte completo: ${res.status} - ${errText}`);
    }
    return (await res.json()) as ReportFullResponse;
}

// ---------------------------------------------------------------------------
// Study Types
// ---------------------------------------------------------------------------

export async function getStudyType(studyTypeId: string): Promise<StudyTypeDetail> {
    const res = await fetch(`${base}/v1/study-types/${studyTypeId}`, {
        method: "GET",
        headers: authHeaders({ Accept: "application/json" }),
    });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Error al obtener tipo de estudio: ${res.status} - ${errText}`);
    }
    return (await res.json()) as StudyTypeDetail;
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

export interface UploadImageResponse {
    id: string;
    url: string;
    caption?: string;
}

export async function uploadReportImage(
    sampleId: string,
    file: File,
    caption?: string
): Promise<UploadImageResponse> {
    const form = new FormData();
    form.append("file", file);
    if (caption) form.append("caption", caption);

    const res = await fetch(`${base}/v1/laboratory/samples/${sampleId}/images`, {
        method: "POST",
        headers: authHeaders(),
        body: form,
    });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Error al subir imagen: ${res.status} - ${errText}`);
    }
    return (await res.json()) as UploadImageResponse;
}

export async function deleteReportImage(sampleId: string, imageId: string): Promise<void> {
    const res = await fetch(`${base}/v1/laboratory/samples/${sampleId}/images/${imageId}`, {
        method: "DELETE",
        headers: authHeaders(),
    });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Error al eliminar imagen: ${res.status} - ${errText}`);
    }
}

export async function fetchReportImages(
    sampleId: string
): Promise<{ id: string; url: string; thumbnailUrl?: string; caption?: string }[]> {
    const res = await fetch(`${base}/v1/laboratory/samples/${sampleId}/images`, {
        method: "GET",
        headers: authHeaders({ Accept: "application/json" }),
    });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Error al obtener imágenes: ${res.status} - ${errText}`);
    }

    const payload = (await res.json()) as unknown;

    const isRecord = (value: unknown): value is Record<string, unknown> =>
        typeof value === "object" && value !== null;

    const readString = (value: unknown): string | undefined => {
        if (typeof value === "string") return value;
        if (typeof value === "number" || typeof value === "bigint") return String(value);
        return undefined;
    };

    const extractRawList = (value: unknown): Record<string, unknown>[] => {
        if (Array.isArray(value)) return value.filter(isRecord);
        if (isRecord(value) && Array.isArray(value.images)) return value.images.filter(isRecord);
        return [];
    };

    type NormalizedImage = { id: string; url: string; thumbnailUrl?: string; caption?: string };

    const normalize = (record: Record<string, unknown>): NormalizedImage | null => {
        const urlsCandidate = record["urls"];
        const urlsRecord = isRecord(urlsCandidate) ? urlsCandidate : undefined;

        const processed =
            (urlsRecord && readString(urlsRecord["processed"])) ??
            readString(record["url"]) ??
            (urlsRecord && readString(urlsRecord["thumbnail"])) ??
            undefined;
        if (!processed) return null;

        const id = readString(record["id"]) ?? readString(record["sample_image_id"]);
        if (!id) return null;

        const thumbnail =
            (urlsRecord && readString(urlsRecord["thumbnail"])) ??
            (urlsRecord && readString(urlsRecord["processed"])) ??
            processed;

        const caption =
            readString(record["label"]) ?? readString(record["caption"]) ?? "";

        return { id, url: processed, thumbnailUrl: thumbnail, caption } satisfies NormalizedImage;
    };

    return extractRawList(payload)
        .map(normalize)
        .filter((img): img is NormalizedImage => img !== null);
}

// ---------------------------------------------------------------------------
// Report state transitions
// ---------------------------------------------------------------------------

export interface ReportActionResponse {
    id: string;
    status: string;
    message: string;
}

export async function submitReport(reportId: string, changelog?: string): Promise<ReportActionResponse> {
    const res = await fetch(`${base}/v1/reports/${reportId}/submit`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ changelog }),
    });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Error al enviar reporte: ${res.status} - ${errText}`);
    }
    return await res.json();
}

export async function approveReport(reportId: string, changelog?: string): Promise<ReportActionResponse> {
    const res = await fetch(`${base}/v1/reports/${reportId}/approve`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ changelog }),
    });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Error al aprobar reporte: ${res.status} - ${errText}`);
    }
    return await res.json();
}

export async function requestChanges(reportId: string, comment: string): Promise<ReportActionResponse> {
    const res = await fetch(`${base}/v1/reports/${reportId}/request-changes`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ comment, request_changes: true }),
    });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Error al solicitar cambios: ${res.status} - ${errText}`);
    }
    return await res.json();
}

export async function signReport(reportId: string, changelog?: string): Promise<ReportActionResponse> {
    const res = await fetch(`${base}/v1/reports/${reportId}/sign`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ changelog }),
    });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Error al firmar reporte: ${res.status} - ${errText}`);
    }
    return await res.json();
}

export async function retractReport(reportId: string, changelog?: string): Promise<ReportActionResponse> {
    const res = await fetch(`${base}/v1/reports/${reportId}/retract`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ changelog }),
    });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Error al retirar reporte: ${res.status} - ${errText}`);
    }
    return await res.json();
}

// ---------------------------------------------------------------------------
// Worklist
// ---------------------------------------------------------------------------

export interface WorklistResponse {
    reports: Array<{
        id: string;
        status: string;
        tenant_id: string;
        branch: { id: string; name: string; code?: string | null };
        order: {
            id: string;
            order_code: string;
            status: string;
            requested_by?: string | null;
            patient?: { id: string; full_name: string; patient_code: string };
        };
        title?: string | null;
        diagnosis_text?: string | null;
        published_at?: string | null;
        created_at?: string | null;
        created_by?: string | null;
        signed_by?: string | null;
        signed_at?: string | null;
        version_no?: number | null;
        has_pdf: boolean;
    }>;
}

export async function getWorklist(branchId?: string): Promise<WorklistResponse> {
    const url = branchId
        ? `${base}/v1/reports/worklist?branch_id=${branchId}`
        : `${base}/v1/reports/worklist`;
    const res = await fetch(url, {
        method: "GET",
        headers: authHeaders({ Accept: "application/json" }),
    });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Error al obtener worklist: ${res.status} - ${errText}`);
    }
    return await res.json();
}

// ---------------------------------------------------------------------------
// Report Templates CRUD
// ---------------------------------------------------------------------------

export async function getReportTemplates(activeOnly = false): Promise<{ templates: ReportTemplateListItem[] }> {
    const url = `${base}/v1/reports/templates/?active_only=${activeOnly}`;
    const res = await fetch(url, {
        method: "GET",
        headers: authHeaders({ Accept: "application/json" }),
    });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Error al obtener plantillas: ${res.status} - ${errText}`);
    }
    return await res.json();
}

export async function getReportTemplateById(templateId: string): Promise<ReportTemplateDetail> {
    const res = await fetch(`${base}/v1/reports/templates/${templateId}`, {
        method: "GET",
        headers: authHeaders({ Accept: "application/json" }),
    });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Error al obtener plantilla: ${res.status} - ${errText}`);
    }
    return await res.json();
}

export async function createReportTemplate(payload: CreateReportTemplatePayload): Promise<ReportTemplateDetail> {
    const res = await fetch(`${base}/v1/reports/templates/`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Error al crear plantilla: ${res.status} - ${errText}`);
    }
    return await res.json();
}

export async function updateReportTemplate(
    templateId: string,
    payload: UpdateReportTemplatePayload
): Promise<ReportTemplateDetail> {
    const res = await fetch(`${base}/v1/reports/templates/${templateId}`, {
        method: "PUT",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Error al actualizar plantilla: ${res.status} - ${errText}`);
    }
    return await res.json();
}

export async function deleteReportTemplate(templateId: string): Promise<void> {
    const res = await fetch(`${base}/v1/reports/templates/${templateId}`, {
        method: "DELETE",
        headers: authHeaders(),
    });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Error al eliminar plantilla: ${res.status} - ${errText}`);
    }
}
