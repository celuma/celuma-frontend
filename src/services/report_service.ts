// services/report_service.ts
import type { ReportEnvelope } from "../models/report";

// ==== Config base ====
const base =
    import.meta.env.DEV
        ? "/api"
        : (import.meta.env.VITE_API_BASE_URL as string) || "/api";

// ==== Guardar reporte ====
export async function saveReport(report: ReportEnvelope): Promise<void> {
    const res = await fetch(`${base}/v1/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(report),
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Error al guardar reporte: ${res.status} - ${errText}`);
    }
}

// ==== Subir imagen asociada a un reporte ====
export interface UploadImageResponse {
    id: string;
    url: string;
    caption?: string;
}

/**
 * Sube una imagen vinculada a un `sampleId`.
 * El backend debe aceptar multipart/form-data en: POST /v1/laboratory/samples/{sampleId}/images
 */
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

/**
 * Elimina una imagen ya subida.
 */
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

/**
 * Obtiene las imágenes asociadas a un sampleId
 * GET /v1/laboratory/samples/{sampleId}/images
 */
export async function fetchReportImages(
    sampleId: string
): Promise<{ id: string; url: string; caption?: string }[]> {
    const res = await fetch(
        `${base}/v1/laboratory/samples/${sampleId}/images`,
        { method: "GET", headers: { Accept: "application/json" } }
    );

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Error al obtener imágenes: ${res.status} - ${errText}`);
    }

    return (await res.json()) as { id: string; url: string; caption?: string }[];
}
