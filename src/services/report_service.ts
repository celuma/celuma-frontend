import type { ReportEnvelope } from "../models/report";

// Config base URL API
const base = import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL as string) || "/api";

// Helper function to get auth token
function getAuthToken(): string | null {
    return localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
}

// Save report
export async function saveReport(report: ReportEnvelope): Promise<ReportEnvelope> {
    const token = getAuthToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = token;

    const res = await fetch(`${base}/v1/reports/`, {
        method: "POST",
        headers,
        body: JSON.stringify(report),
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Error al guardar reporte: ${res.status} - ${errText}`);
    }
    return await res.json();
}

// Save new version of report
export async function saveReportVersion(report: ReportEnvelope): Promise<void> {
    const report_id = report.id;
    const token = getAuthToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = token;

    const res = await fetch(`${base}/v1/reports/${report_id}/new_version`, {
        method: "POST",
        headers,
        body: JSON.stringify(report),
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Error al guardar nueva versión del reporte: ${res.status} - ${errText}`);
    }
}

// Get report by id
export async function getReport(reportId: string): Promise<ReportEnvelope> {
    const token = getAuthToken();
    const headers: Record<string, string> = { Accept: "application/json" };
    if (token) headers["Authorization"] = token;

    const res = await fetch(`${base}/v1/reports/${reportId}`, {
        method: "GET",
        headers,
    });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Error al obtener reporte: ${res.status} - ${errText}`);
    }
    return (await res.json()) as ReportEnvelope;
}

// Upload image to report
export interface UploadImageResponse {
    id: string;
    url: string;
    caption?: string;
}

// Upload image with sampleId
export async function uploadReportImage(
    sampleId: string,
    file: File,
    caption?: string
): Promise<UploadImageResponse> {
    const form = new FormData();
    form.append("file", file);
    if (caption) form.append("caption", caption);

    const token = getAuthToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = token;

    const res = await fetch(`${base}/v1/laboratory/samples/${sampleId}/images`, {
        method: "POST",
        headers,
        body: form,
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Error al subir imagen: ${res.status} - ${errText}`);
    }

    return (await res.json()) as UploadImageResponse;
}

// Delete image by sampleId and imageId
export async function deleteReportImage(
    sampleId: string,
    imageId: string
): Promise<void> {
    const token = getAuthToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = token;

    const res = await fetch(
        `${base}/v1/laboratory/samples/${sampleId}/images/${imageId}`,
        {
            method: "DELETE",
            headers,
        }
    );

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Error al eliminar imagen: ${res.status} - ${errText}`);
    }
}

// Fetch images by sampleId
export async function fetchReportImages(
    sampleId: string
): Promise<{ id: string; url: string; thumbnailUrl?: string; caption?: string }[]> {
    const token = getAuthToken();
    const headers: Record<string, string> = { Accept: "application/json" };
    if (token) headers["Authorization"] = token;

    const res = await fetch(
        `${base}/v1/laboratory/samples/${sampleId}/images`,
        {
            method: "GET",
            headers,
        }
    );

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
        if (Array.isArray(value)) {
            return value.filter(isRecord);
        }
        if (isRecord(value) && Array.isArray(value.images)) {
            return value.images.filter(isRecord);
        }
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

        const id =
            readString(record["id"]) ??
            readString(record["sample_image_id"]);
        if (!id) return null;

        const thumbnail =
            (urlsRecord && readString(urlsRecord["thumbnail"])) ??
            (urlsRecord && readString(urlsRecord["processed"])) ??
            processed;

        const caption =
            readString(record["label"]) ??
            readString(record["caption"]) ??
            "";

        const normalized = {
            id,
            url: processed,
            thumbnailUrl: thumbnail,
            caption,
        } satisfies NormalizedImage;

        return normalized;
    };

    return extractRawList(payload)
        .map(normalize)
        .filter((img): img is NormalizedImage => img !== null);
}
