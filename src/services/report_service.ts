import type { ReportEnvelope } from "../models/report";

function apiBase(): string {
    return import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL || "/api");
}

export async function uploadReportImage(sampleId: string, file: File): Promise<{ id?: string; url: string }> {
    if (!sampleId) throw new Error("Falta sampleId para subir imagen.");
    const formData = new FormData();
    formData.append("image", file);

    const res = await fetch(`${apiBase()}/v1/laboratory/samples/${sampleId}/images`, {
        method: "POST",
        body: formData,
    });

    if (!res.ok) {
        const hint = await safeText(res);
        throw new Error(`Error al subir la imagen (${res.status}). ${hint}`);
    }
    return res.json() as Promise<{ id?: string; url: string }>;
}

export async function saveReportEnvelope(envelope: ReportEnvelope) {
    const res = await fetch(`${apiBase()}/v1/reports/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", accept: "application/json" },
        body: JSON.stringify(envelope),
    });

    if (!res.ok) {
        const hint = await safeText(res);
        throw new Error(`Error al guardar el reporte (${res.status}). ${hint}`);
    }
    return res.json();
}

async function safeText(r: Response) {
    try { return await r.text(); } catch { return ""; }
}