import type { ReportContent, ReportEnvelope, ReportTemplateJSON } from "../../../models/report";

/**
 * Anonymized report fixtures for Céluma 1.3 Fase 1 (Workstream 5). No real
 * patient data, no identifiable diagnoses, no real image files — image URLs
 * are synthetic and never fetched in tests. Mirrors the matrix documented in
 * celuma-backend/tests/fixtures/reports/README.md (same case coverage, ported
 * to TypeScript so it can be strongly typed as ReportEnvelope).
 *
 * These represent CURRENT behavior — do not edit them to make a test pass;
 * if behavior intentionally changes, update fixture + test together.
 *
 * IMPORTANT: the renderer (legacy/legacy_report_renderer_v1.tsx) reads is_visible/label/type
 * from `template.base`/`template.sections`, and only reads values/content
 * from `report.base`/`report.sections`. A fixture whose `template` doesn't
 * mirror `report`'s keys will silently render nothing — every fixture here
 * builds `template` from the same field/section definitions as `report`.
 */

const baseEnvelope = {
    order_id: "00000000-0000-0000-0000-000000000003",
    tenant_id: "00000000-0000-0000-0000-000000000001",
    branch_id: "00000000-0000-0000-0000-000000000002",
    created_by: "00000000-0000-0000-0000-000000000099",
};

/** Builds a template snapshot that mirrors a report's field/section definitions (matches production behavior: the template snapshot and the content share the same keys/labels/types). */
function templateFrom(content: ReportContent, orderOverride?: { base_order?: string[]; section_order?: string[] }): ReportTemplateJSON {
    return {
        base: content.base,
        sections: content.sections,
        base_order: orderOverride?.base_order ?? content.base_order,
        section_order: orderOverride?.section_order ?? content.section_order,
    };
}

/** Covers: una muestra, contenido corto, sin imágenes, reporte en borrador. */
const draftSingleSampleNoImagesContent: ReportContent = {
    base: {
        order_code: { is_visible: true, label: "Código de orden", value: "SYN-0001" },
        patient: { is_visible: true, label: "Paciente", value: "Paciente de Prueba Uno" },
        study_type: { is_visible: true, label: "Tipo de estudio", value: "Histopatología" },
        patient_age: { is_visible: true, label: "Edad", value: "40" },
        requesting_physician: { is_visible: true, label: "Médico solicitante", value: "Dr. Solicitante Sintético" },
    },
    sections: {
        section_macroscopic: { is_visible: true, label: "Macroscópica", type: "richtext", content: "<p>Fragmento único de tejido sintético, 1.0 x 0.5 cm.</p>" },
        section_microscopic: { is_visible: true, label: "Microscópica", type: "richtext", content: "<p>Hallazgo de prueba sin relevancia clínica.</p>" },
        images: { is_visible: true, label: "Imágenes", type: "images", content: [] },
    },
    base_order: ["order_code", "patient", "study_type", "patient_age", "requesting_physician"],
    section_order: ["section_macroscopic", "section_microscopic", "images"],
    signatureMetadata: { show_signature_section: false, require_digital_signature: false },
};

export const draftSingleSampleNoImages: ReportEnvelope = {
    ...baseEnvelope,
    id: "fixture-1",
    version_no: 1,
    status: "DRAFT",
    title: "Reporte de prueba — muestra única",
    published_at: null,
    signed_by: null,
    signed_at: null,
    template: templateFrom(draftSingleSampleNoImagesContent),
    report: draftSingleSampleNoImagesContent,
};

/** Covers: varias muestras, con imágenes, todas las secciones completas, reporte liberado. */
const publishedMultiSampleWithImagesContent: ReportContent = {
    base: {
        order_code: { is_visible: true, label: "Código de orden", value: "SYN-0002" },
        patient: { is_visible: true, label: "Paciente", value: "Paciente de Prueba Dos" },
        study_type: { is_visible: true, label: "Tipo de estudio", value: "Histopatología" },
        patient_age: { is_visible: true, label: "Edad", value: "58" },
        requesting_physician: { is_visible: true, label: "Médico solicitante", value: "Dra. Solicitante Sintética" },
    },
    sections: {
        section_macroscopic: { is_visible: true, label: "Macroscópica", type: "richtext", content: "<p>Se reciben tres fragmentos etiquetados A, B y C, correspondientes a tres muestras distintas de la misma orden.</p>" },
        section_microscopic: { is_visible: true, label: "Microscópica", type: "richtext", content: "<p>Descripción microscópica sintética de las tres muestras, sin hallazgos reales.</p>" },
        section_diagnosis: { is_visible: true, label: "Diagnóstico", type: "text", content: "Diagnóstico de prueba: hallazgo sintético benigno." },
        images: {
            is_visible: true,
            label: "Imágenes",
            type: "images",
            content: [
                { id: "img-a1", url: "https://cdn.example.invalid/synthetic/sample-a-1.png", caption: "Muestra A, corte 1 (sintético)" },
                { id: "img-b1", url: "https://cdn.example.invalid/synthetic/sample-b-1.png", caption: "Muestra B, corte 1 (sintético)" },
                { id: "img-c1", url: "https://cdn.example.invalid/synthetic/sample-c-1.png", caption: "Muestra C, corte 1 (sintético)" },
                { id: "img-c2", url: "https://cdn.example.invalid/synthetic/sample-c-2.png", caption: "Muestra C, corte 2 (sintético)" },
            ],
        },
    },
    base_order: ["order_code", "patient", "study_type", "patient_age", "requesting_physician"],
    section_order: ["section_macroscopic", "section_microscopic", "section_diagnosis", "images"],
    signatureMetadata: {
        show_signature_section: true,
        require_digital_signature: true,
        signature_url: "https://cdn.example.invalid/synthetic/signature.png",
    },
};

export const publishedMultiSampleWithImages: ReportEnvelope = {
    ...baseEnvelope,
    id: "fixture-2",
    version_no: 2,
    status: "PUBLISHED",
    title: "Reporte de prueba — múltiples muestras",
    published_at: "2026-01-15T12:00:00Z",
    signed_by: "00000000-0000-0000-0000-000000000099",
    signed_at: "2026-01-15T12:00:00Z",
    template: templateFrom(publishedMultiSampleWithImagesContent),
    report: publishedMultiSampleWithImagesContent,
};

/** Covers: secciones opcionales vacías. */
const emptyOptionalSectionsContent: ReportContent = {
    base: {
        order_code: { is_visible: true, label: "Código de orden", value: "SYN-0003" },
        patient: { is_visible: true, label: "Paciente", value: "Paciente de Prueba Tres" },
        study_type: { is_visible: true, label: "Tipo de estudio", value: "Histopatología" },
    },
    sections: {
        section_macroscopic: { is_visible: true, label: "Macroscópica", type: "richtext", content: "<p>Descripción sintética breve.</p>" },
        section_diagnosis: { is_visible: true, label: "Diagnóstico", type: "text", content: "" },
        section_extra_notes: { is_visible: false, label: "Notas adicionales", type: "text", content: "" },
        images: { is_visible: true, label: "Imágenes", type: "images", content: [] },
    },
    base_order: ["order_code", "patient", "study_type"],
    section_order: ["section_macroscopic", "section_diagnosis", "section_extra_notes", "images"],
    signatureMetadata: { show_signature_section: false, require_digital_signature: false },
};

export const emptyOptionalSections: ReportEnvelope = {
    ...baseEnvelope,
    id: "fixture-3",
    version_no: 1,
    status: "DRAFT",
    title: "Reporte de prueba — secciones vacías",
    published_at: null,
    signed_by: null,
    signed_at: null,
    template: templateFrom(emptyOptionalSectionsContent),
    report: emptyOptionalSectionsContent,
};

/** Covers: contenido de varias páginas, textos suficientemente largos para provocar saltos de página. */
const longParagraph = (n: number) =>
    `<p>Párrafo sintético de prueba de paginación, número ${n}, repetido para alcanzar una longitud suficiente y forzar múltiples páginas en el documento generado. Este texto no contiene información clínica real. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>`;

const longContentMultipageContent: ReportContent = {
    base: {
        order_code: { is_visible: true, label: "Código de orden", value: "SYN-0004" },
        patient: { is_visible: true, label: "Paciente", value: "Paciente de Prueba Cuatro" },
    },
    sections: {
        section_macroscopic: {
            is_visible: true,
            label: "Macroscópica",
            type: "richtext",
            content: Array.from({ length: 10 }, (_, i) => longParagraph(i + 1)).join(""),
        },
        section_microscopic: {
            is_visible: true,
            label: "Microscópica",
            type: "richtext",
            content: Array.from({ length: 10 }, (_, i) => longParagraph(i + 11)).join(""),
        },
        images: { is_visible: true, label: "Imágenes", type: "images", content: [] },
    },
    base_order: ["order_code", "patient"],
    section_order: ["section_macroscopic", "section_microscopic", "images"],
    signatureMetadata: { show_signature_section: false, require_digital_signature: false },
};

export const longContentMultipage: ReportEnvelope = {
    ...baseEnvelope,
    id: "fixture-4",
    version_no: 1,
    status: "APPROVED",
    title: "Reporte de prueba — contenido largo",
    published_at: null,
    signed_by: null,
    signed_at: null,
    template: templateFrom(longContentMultipageContent),
    report: longContentMultipageContent,
};

/** Covers: caracteres especiales y acentos. */
const specialCharactersAccentsContent: ReportContent = {
    base: {
        order_code: { is_visible: true, label: "Código de orden", value: "SYN-0005" },
        patient: { is_visible: true, label: "Paciente", value: "María José Muñóz Peña" },
        requesting_physician: { is_visible: true, label: "Médico solicitante", value: "Dr. Iñaki Núñez Vázquez" },
    },
    sections: {
        section_macroscopic: {
            is_visible: true,
            label: "Macroscópica",
            type: "richtext",
            content: "<p>Muestra sintética con acentos: áéíóú, ñ, ü, símbolos: 50% ± 5°C, § ¶.</p>",
        },
        images: { is_visible: true, label: "Imágenes", type: "images", content: [] },
    },
    base_order: ["order_code", "patient", "requesting_physician"],
    section_order: ["section_macroscopic", "images"],
    signatureMetadata: { show_signature_section: false, require_digital_signature: false },
};

export const specialCharactersAccents: ReportEnvelope = {
    ...baseEnvelope,
    id: "fixture-5",
    version_no: 1,
    status: "DRAFT",
    title: "Reporte de prueba — acentos y símbolos",
    published_at: null,
    signed_by: null,
    signed_at: null,
    template: templateFrom(specialCharactersAccentsContent),
    report: specialCharactersAccentsContent,
};

/**
 * Covers: reporte histórico con la estructura más antigua disponible.
 * No signatureMetadata, and empty order arrays on BOTH template and content
 * (as if base_order/section_order never existed) — resolveDisplayOrder must
 * fall back to Object.keys() and still render every field/section.
 */
const legacyOldestStructureContent: ReportContent = {
    base: {
        order_code: { is_visible: true, label: "Código de orden", value: "SYN-0006" },
        patient: { is_visible: true, label: "Paciente", value: "Paciente de Prueba Seis" },
        study_type: { is_visible: true, label: "Tipo de estudio", value: "Histopatología" },
    },
    sections: {
        section_macroscopic: { is_visible: true, label: "Macroscópica", type: "richtext", content: "<p>Descripción sintética de un reporte con estructura antigua.</p>" },
        section_microscopic: { is_visible: true, label: "Microscópica", type: "richtext", content: "<p>Descripción sintética de un reporte con estructura antigua.</p>" },
        images: { is_visible: true, label: "Imágenes", type: "images", content: [] },
    },
    base_order: [],
    section_order: [],
};

export const legacyOldestStructure: ReportEnvelope = {
    ...baseEnvelope,
    id: "fixture-6",
    version_no: 1,
    status: "PUBLISHED",
    title: "Reporte histórico",
    published_at: "2024-03-01T09:00:00Z",
    signed_by: null,
    signed_at: null,
    template: templateFrom(legacyOldestStructureContent, { base_order: [], section_order: [] }),
    report: legacyOldestStructureContent,
};

/** Covers: reporte sin paciente, cuando el flujo lo permita. */
const noPatientReportContent: ReportContent = {
    base: {
        order_code: { is_visible: true, label: "Código de orden", value: "SYN-0007" },
        patient: { is_visible: true, label: "Paciente", value: "" },
        study_type: { is_visible: true, label: "Tipo de estudio", value: "Control de calidad" },
    },
    sections: {
        section_macroscopic: { is_visible: true, label: "Macroscópica", type: "richtext", content: "<p>Muestra de control de calidad, sin paciente asociado.</p>" },
        images: { is_visible: true, label: "Imágenes", type: "images", content: [] },
    },
    base_order: ["order_code", "patient", "study_type"],
    section_order: ["section_macroscopic", "images"],
    signatureMetadata: { show_signature_section: false, require_digital_signature: false },
};

export const noPatientReport: ReportEnvelope = {
    ...baseEnvelope,
    id: "fixture-7",
    version_no: 1,
    status: "DRAFT",
    title: "Reporte de prueba — sin paciente",
    published_at: null,
    signed_by: null,
    signed_at: null,
    template: templateFrom(noPatientReportContent),
    report: noPatientReportContent,
};

export const allReportFixtures: Record<string, ReportEnvelope> = {
    draftSingleSampleNoImages,
    publishedMultiSampleWithImages,
    emptyOptionalSections,
    longContentMultipage,
    specialCharactersAccents,
    legacyOldestStructure,
    noPatientReport,
};
