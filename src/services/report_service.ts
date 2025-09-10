import type { Report } from "../models/report";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

export async function saveReport(report: Report) {
    const res = await fetch(`${API_BASE}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(report),
    });
    if (!res.ok) {
        throw new Error("Error al guardar el reporte");
    }
    return res.json();
}

export async function uploadReportImage(sampleId: string, file: File) {
    const formData = new FormData();
    formData.append("image", file);

    const res = await fetch(`${API_BASE}/samples/${sampleId}/images`, {
        method: "POST",
        body: formData,
    });
    if (!res.ok) {
        throw new Error("Error al subir la imagen");
    }
    return res.json();
}
