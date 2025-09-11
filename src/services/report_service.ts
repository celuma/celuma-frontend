// src/services/report_service.ts
const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api/v1";

export async function uploadReportImage(sampleId: string, file: File) {
    const formData = new FormData();
    // El backend espera el campo "file"
    formData.append("file", file, file.name);

    // Según tu Swagger: /api/v1/laboratory/samples/{sample_id}/images
    const url = `${API_BASE}/laboratory/samples/${sampleId}/images`;

    const res = await fetch(url, {
        method: "POST",
        body: formData,
        headers: { accept: "application/json" }, // no seteamos Content-Type (boundary automático)
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error("Upload error:", res.status, text);
        throw new Error(text || `Error al subir la imagen (${res.status})`);
    }

    const json = await res.json();

    // Normalizamos posibles campos que devuelva la API
    const urlFromApi =
        json?.url ||
        json?.jpeg_url ||
        json?.processed?.url ||
        json?.signed_url ||
        json?.s3?.url ||
        json?.thumbnail_url ||
        json?.key;

    return { url: urlFromApi, raw: json };
}

export async function saveReport(report: unknown) {
    const url = `${API_BASE}/reports`;
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", accept: "application/json" },
        body: JSON.stringify(report),
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Error al guardar el reporte (${res.status})`);
    }

    return res.json();
}
