/**
 * API client for the shared, tenant-owned letterhead ("membrete") domain —
 * post-Fase-2 remediation. Kept as its own file, not appended to
 * report_service.ts, matching how other distinct domains (signatures,
 * collaboration) already get their own service file — see
 * report-letterhead-domain-contract.md.
 */
import type {
    ReportLetterheadSummary,
    ReportLetterheadDetail,
    ReportLetterheadsListResponse,
    CreateReportLetterheadPayload,
    UpdateReportLetterheadPayload,
    ReportLetterheadVersionSummary,
    ReportLetterheadVersionDetail,
    ReportLetterheadVersionsListResponse,
    CreateReportLetterheadVersionPayload,
    ReportLetterheadLogoUploadResponse,
    CelumaLetterheadEnvelope,
} from "../models/report_letterhead";

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

/** Readable message from FastAPI JSON error `{ "detail": "..." | [...] }`. */
function parseFastApiErrorDetail(bodyText: string): string | undefined {
    try {
        const j = JSON.parse(bodyText) as { detail?: unknown };
        const d = j.detail;
        if (typeof d === "string") return d;
        if (Array.isArray(d)) {
            return d
                .map((item) =>
                    typeof item === "object" && item !== null && "msg" in item &&
                    typeof (item as { msg: unknown }).msg === "string"
                        ? (item as { msg: string }).msg
                        : "",
                )
                .filter(Boolean)
                .join("; ");
        }
        return undefined;
    } catch {
        return undefined;
    }
}

/** Same 401/403/404/409/422 distinguishing pattern as report_service.ts's
 * requestTemplateVersionJSON, duplicated here for domain isolation. */
async function requestLetterheadJSON<T>(
    url: string,
    init: RequestInit,
    fallbackMessage: string
): Promise<T> {
    let res: Response;
    try {
        res = await fetch(url, init);
    } catch {
        throw new Error("Error de red: no se pudo contactar al servidor. Verifica tu conexión.");
    }
    if (!res.ok) {
        const errText = await res.text();
        const detail = parseFastApiErrorDetail(errText);
        if (res.status === 401) throw new Error(detail ?? "Tu sesión expiró. Vuelve a iniciar sesión.");
        if (res.status === 403) throw new Error(detail ?? "No tienes permiso para realizar esta acción.");
        if (res.status === 404) throw new Error(detail ?? "No se encontró el recurso solicitado.");
        if (res.status === 409) throw new Error(detail ?? "La operación entra en conflicto con el estado actual del membrete.");
        if (res.status === 422) throw new Error(detail ?? "Los datos enviados no son válidos.");
        throw new Error(detail ?? `${fallbackMessage} (${res.status})`);
    }
    return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// ReportLetterhead CRUD
// ---------------------------------------------------------------------------

export async function listReportLetterheads(activeOnly = true): Promise<ReportLetterheadsListResponse> {
    return requestLetterheadJSON(
        `${base}/v1/report-letterheads/?active_only=${activeOnly}`,
        { method: "GET", headers: authHeaders({ Accept: "application/json" }) },
        "Error al listar membretes"
    );
}

export async function getReportLetterhead(letterheadId: string): Promise<ReportLetterheadDetail> {
    return requestLetterheadJSON(
        `${base}/v1/report-letterheads/${letterheadId}`,
        { method: "GET", headers: authHeaders({ Accept: "application/json" }) },
        "Error al obtener el membrete"
    );
}

export async function createReportLetterhead(
    payload: CreateReportLetterheadPayload
): Promise<ReportLetterheadSummary> {
    return requestLetterheadJSON(
        `${base}/v1/report-letterheads/`,
        {
            method: "POST",
            headers: authHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify(payload),
        },
        "Error al crear el membrete"
    );
}

export async function updateReportLetterhead(
    letterheadId: string,
    payload: UpdateReportLetterheadPayload
): Promise<ReportLetterheadSummary> {
    return requestLetterheadJSON(
        `${base}/v1/report-letterheads/${letterheadId}`,
        {
            method: "PUT",
            headers: authHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify(payload),
        },
        "Error al actualizar el membrete"
    );
}

export async function deleteReportLetterhead(letterheadId: string, hardDelete = false): Promise<void> {
    await requestLetterheadJSON(
        `${base}/v1/report-letterheads/${letterheadId}?hard_delete=${hardDelete}`,
        { method: "DELETE", headers: authHeaders() },
        "Error al eliminar el membrete"
    );
}

export async function duplicateReportLetterhead(letterheadId: string): Promise<ReportLetterheadSummary> {
    return requestLetterheadJSON(
        `${base}/v1/report-letterheads/${letterheadId}/duplicate`,
        { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }) },
        "Error al duplicar el membrete"
    );
}

export async function setDefaultReportLetterhead(letterheadId: string): Promise<ReportLetterheadSummary> {
    return requestLetterheadJSON(
        `${base}/v1/report-letterheads/${letterheadId}/default`,
        { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }) },
        "Error al marcar el membrete como predeterminado"
    );
}

// ---------------------------------------------------------------------------
// ReportLetterheadVersion (append-only, immutable)
// ---------------------------------------------------------------------------

export async function listReportLetterheadVersions(
    letterheadId: string
): Promise<ReportLetterheadVersionsListResponse> {
    return requestLetterheadJSON(
        `${base}/v1/report-letterheads/${letterheadId}/versions`,
        { method: "GET", headers: authHeaders({ Accept: "application/json" }) },
        "Error al listar versiones del membrete"
    );
}

export async function getReportLetterheadVersion(
    letterheadId: string,
    versionId: string
): Promise<ReportLetterheadVersionDetail> {
    return requestLetterheadJSON(
        `${base}/v1/report-letterheads/${letterheadId}/versions/${versionId}`,
        { method: "GET", headers: authHeaders({ Accept: "application/json" }) },
        "Error al obtener la versión del membrete"
    );
}

export async function createReportLetterheadVersion(
    letterheadId: string,
    payload: CreateReportLetterheadVersionPayload
): Promise<ReportLetterheadVersionDetail> {
    return requestLetterheadJSON(
        `${base}/v1/report-letterheads/${letterheadId}/versions`,
        {
            method: "POST",
            headers: authHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify(payload),
        },
        "Error al publicar la versión del membrete"
    );
}

export async function activateReportLetterheadVersion(
    letterheadId: string,
    versionId: string
): Promise<ReportLetterheadVersionSummary> {
    return requestLetterheadJSON(
        `${base}/v1/report-letterheads/${letterheadId}/versions/${versionId}/activate`,
        { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }) },
        "Error al activar la versión del membrete"
    );
}

export async function archiveReportLetterheadVersion(
    letterheadId: string,
    versionId: string
): Promise<ReportLetterheadVersionSummary> {
    return requestLetterheadJSON(
        `${base}/v1/report-letterheads/${letterheadId}/versions/${versionId}/archive`,
        { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }) },
        "Error al archivar la versión del membrete"
    );
}

export async function uploadReportLetterheadLogo(
    letterheadId: string,
    file: File
): Promise<ReportLetterheadLogoUploadResponse> {
    const form = new FormData();
    form.append("file", file);
    return requestLetterheadJSON(
        `${base}/v1/report-letterheads/${letterheadId}/logo`,
        { method: "POST", headers: authHeaders(), body: form },
        "Error al subir el logo"
    );
}

// ---------------------------------------------------------------------------
// .celuma portable file format — post-Fase-2 remediation, R12/R13
// ---------------------------------------------------------------------------

function downloadJSONAsFile(data: unknown, filename: string): void {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

export async function exportReportLetterheadVersion(
    letterheadId: string,
    versionId: string,
    filename: string
): Promise<void> {
    const envelope = await requestLetterheadJSON<CelumaLetterheadEnvelope>(
        `${base}/v1/report-letterheads/${letterheadId}/versions/${versionId}/export`,
        { method: "GET", headers: authHeaders({ Accept: "application/json" }) },
        "Error al exportar el membrete"
    );
    downloadJSONAsFile(envelope, filename);
}

export async function exportLegacyLetterhead(): Promise<void> {
    const envelope = await requestLetterheadJSON<CelumaLetterheadEnvelope>(
        `${base}/v1/report-letterheads/legacy/export`,
        { method: "GET", headers: authHeaders({ Accept: "application/json" }) },
        "Error al exportar el membrete legado"
    );
    downloadJSONAsFile(envelope, "legacy-ambassador-letterhead.celuma");
}

export async function importReportLetterhead(
    file: File
): Promise<ReportLetterheadVersionDetail> {
    const form = new FormData();
    form.append("file", file);
    return requestLetterheadJSON(
        `${base}/v1/report-letterheads/import`,
        { method: "POST", headers: authHeaders(), body: form },
        "Error al importar el membrete"
    );
}
