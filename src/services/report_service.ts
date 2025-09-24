import type { ReportEnvelope } from "../models/report";

// Config base URL API
const base = import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL as string) || "/api";

// Save report
export async function saveReport(report: ReportEnvelope): Promise<ReportEnvelope> {
    const res = await fetch(`${base}/v1/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
    const res = await fetch(`${base}/v1/reports/${report_id}/new_version`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(report),
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Error al guardar nueva versión del reporte: ${res.status} - ${errText}`);
    }
}

// Get report by id
export async function getReport(reportId: string): Promise<ReportEnvelope> {
    const res = await fetch(`${base}/v1/reports/${reportId}`, {
        method: "GET",
        headers: { Accept: "application/json" },
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

    const res = await fetch(`${base}/v1/laboratory/samples/${sampleId}/images`, {
        method: "POST",
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
    const res = await fetch(
        `${base}/v1/laboratory/samples/${sampleId}/images/${imageId}`,
        {
            method: "DELETE",
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
    const res = await fetch(
        `${base}/v1/laboratory/samples/${sampleId}/images`,
        {
            method: "GET",
            headers: { Accept: "application/json" },
        }
    );

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Error al obtener imágenes: ${res.status} - ${errText}`);
    }

    const payload = await res.json();
    const images = Array.isArray(payload?.images) ? payload.images : Array.isArray(payload) ? payload : [];

    return images
        .map((item: any) => {
            const urls = item?.urls ?? {};
            const processed = urls.processed ?? item?.url ?? urls.thumbnail ?? "";
            const thumbnail = urls.thumbnail ?? urls.processed ?? processed;
            const id = String(item?.id ?? item?.sample_image_id ?? "");
            if (!id || !processed) return null;
            return {
                id,
                url: processed,
                thumbnailUrl: thumbnail,
                caption: item?.label ?? item?.caption ?? "",
            };
        })
        .filter((img: any): img is { id: string; url: string; thumbnailUrl?: string; caption?: string } => Boolean(img));
}
