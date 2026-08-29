import type { ReportContent, ReportEnvelope, ReportTemplateJSON } from "../../../models/report";
import type { ReportRenderingSnapshotV2 } from "../../../components/report/versioned/versioned_report_types";

/** A real 120x40 PNG stroke — decodes to non-zero intrinsic dimensions. */
export const AUTOGRAPH_PNG_DATA_URI =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHgAAAAoCAYAAAA16j4lAAAAy0lEQVR42u3asRHDIBAEQBWh6tx/Hyh24JHHAj8cG1yMxD4z8HC01g7JjUkALIAFsAAWwAJYAAOWt5znq/0SwIGos2HDHAxbjQ31C9hRxQK4EHbVcQAXT/insQEHwFZAb4+bXnBgw79xO9zdivF2IKt27cKMqfwU2N7/EjVRSbi9FpsNSvhqjjtiOBE82EXv1iRIQF6qGzTzvWs19JBzcHqjfiXooY2O1Ks2T3b+fFkObJJWJdiNHt1B9ehOAAtgAQxYAAtgASyApUsu3GUp+zy6mK8AAAAASUVORK5CYII=";


/**
 * Anonymized V2 fixtures for Céluma 1.3 Phase 2, Block C (Story C6). No
 * real patient data, no tenant-embajador branding — every fixture uses its
 * OWN synthetic branding (or the neutral Céluma defaults), never
 * `#002060`/"Villanueva"/`report_logo.png`/etc. (see
 * ambassador-hardcoding-inventory.md and legacy-renderer-contract.md — those
 * literals belong exclusively to the legacy/ module).
 *
 * Mirrors the shape produced by the real backend (rendering_snapshot
 * embedded inside `report.report`, alongside `schema_version: 2`) — see
 * report-template-snapshot-contract.md and block-c-dependencies.md.
 */

const baseEnvelope = {
    order_id: "00000000-0000-0000-0000-000000000103",
    tenant_id: "00000000-0000-0000-0000-000000000101",
    branch_id: "00000000-0000-0000-0000-000000000102",
    created_by: "00000000-0000-0000-0000-000000000199",
};

function templateFrom(content: ReportContent): Record<string, unknown> {
    return {
        base: content.base,
        sections: content.sections,
        base_order: content.base_order,
        section_order: content.section_order,
    };
}

// ---------------------------------------------------------------------------
// Fixture 1 — complete branding: own logo, custom margins, header, footer,
// custom color, institutional signer, images, table, multi-page content,
// real digital signature.
// ---------------------------------------------------------------------------

const v2CompleteContent: ReportContent = {
    base: {
        order_code: { is_visible: true, label: "Código de orden", value: "V2-0001" },
        patient: { is_visible: true, label: "Paciente", value: "Paciente Sintético V2 Uno" },
        study_type: { is_visible: true, label: "Tipo de estudio", value: "Histopatología" },
        patient_age: { is_visible: true, label: "Edad", value: "47" },
        requesting_physician: { is_visible: true, label: "Médico solicitante", value: "Dr. Solicitante V2" },
    },
    sections: {
        section_macroscopic: {
            is_visible: true, label: "Macroscópica", type: "richtext",
            content: Array.from({ length: 6 }, (_, i) =>
                `<p>Párrafo macroscópico sintético V2 número ${i + 1}, con longitud suficiente para forzar paginación real en el harness visual.</p>`
            ).join(""),
        },
        section_microscopic: {
            is_visible: true, label: "Microscópica", type: "richtext",
            content: Array.from({ length: 6 }, (_, i) =>
                `<p>Párrafo microscópico sintético V2 número ${i + 1}, sin relevancia clínica real.</p>`
            ).join(""),
        },
        section_findings_table: {
            is_visible: true, label: "Hallazgos", type: "table",
            content: "| Parámetro | Resultado |\n| --- | --- |\n| Márgenes | Libres |\n| Tamaño | 1.2 cm |",
        },
        images: {
            is_visible: true, label: "Imágenes", type: "images",
            content: [
                { id: "v2-img-1", url: "https://cdn.example.invalid/synthetic/v2-sample-1.png", caption: "Corte 1 (sintético)" },
                { id: "v2-img-2", url: "https://cdn.example.invalid/synthetic/v2-sample-2.png", caption: "Corte 2 (sintético)" },
            ],
        },
    },
    base_order: ["order_code", "patient", "study_type", "patient_age", "requesting_physician"],
    section_order: ["section_macroscopic", "section_microscopic", "section_findings_table", "images"],
    signatureMetadata: {
        show_signature_section: true,
        require_digital_signature: true,
        // H-0c Blocker B: a REAL, loadable autograph. This used to point at
        // `cdn.example.invalid`, so every signed fixture could only ever
        // exercise the broken-image path — which is how a defect in the
        // autograph itself stayed invisible to the whole visual suite. The
        // 70px signature wrapper is fixed-height, so making it load changes
        // the ink inside that box and nothing about pagination.
        signature_url: AUTOGRAPH_PNG_DATA_URI,
    },
};

const v2CompleteSnapshot: ReportRenderingSnapshotV2 = {
    schema_version: 2,
    template: templateFrom(v2CompleteContent),
    presentation: {
        paper: { size: "LETTER", orientation: "PORTRAIT", margins_cm: { top: 1.5, right: 1.5, bottom: 1.5, left: 1.5 } },
        header: {
            enabled: true,
            logo_storage_id: "00000000-0000-0000-0000-0000000c0901",
            institution_name: "Laboratorio Sintético V2",
            subtitle: "Diagnóstico Anatomopatológico",
            address: "Calle Sintética 100, Ciudad de Prueba",
            phone: "+52 55 0000 1111",
            email: "contacto@laboratorio-sintetico.example",
        },
        footer: { enabled: true, custom_text: "Documento confidencial — Laboratorio Sintético V2", show_page_number: true },
        style: { primary_color: "#7A3B69" },
        signer: {
            display_name: "Dr. Firmante Institucional Sintético",
            specialty: "Patología Sintética",
            license_number: "SYN-000000",
            affiliation: "Instituto Sintético de Diagnóstico",
        },
    },
};

export const v2CompleteBranding: ReportEnvelope = {
    ...baseEnvelope,
    id: "fixture-v2-1",
    version_no: 1,
    status: "PUBLISHED",
    title: "Reporte V2 — branding completo",
    published_at: "2026-02-01T10:00:00Z",
    signed_by: "00000000-0000-0000-0000-000000000199",
    signed_at: "2026-02-01T10:00:00Z",
    template: v2CompleteSnapshot.template as unknown as ReportTemplateJSON,
    report: { ...v2CompleteContent, schema_version: 2, rendering_snapshot: v2CompleteSnapshot },
    schema_version: 2,
    template_version_id: "00000000-0000-0000-0000-0000000ab001",
    generated_by_renderer_version: "backend-snapshot-builder/fixture/1.0.0",
    resolved_resources: { header_logo_url: "https://fake-cdn.example.invalid/logos/v2-complete.png" },
};

// ---------------------------------------------------------------------------
// Fixture 2 — minimal: every optional field null, neutral Céluma defaults.
// ---------------------------------------------------------------------------

const v2MinimalContent: ReportContent = {
    base: {
        order_code: { is_visible: true, label: "Código de orden", value: "V2-0002" },
        patient: { is_visible: true, label: "Paciente", value: "Paciente Sintético V2 Dos" },
    },
    sections: {
        section_macroscopic: { is_visible: true, label: "Macroscópica", type: "richtext", content: "<p>Descripción macroscópica breve, sin branding configurado.</p>" },
        images: { is_visible: true, label: "Imágenes", type: "images", content: [] },
    },
    base_order: ["order_code", "patient"],
    section_order: ["section_macroscopic", "images"],
    signatureMetadata: { show_signature_section: false, require_digital_signature: false },
};

const v2MinimalSnapshot: ReportRenderingSnapshotV2 = {
    schema_version: 2,
    template: templateFrom(v2MinimalContent),
    presentation: {
        paper: { size: "LETTER", orientation: "PORTRAIT", margins_cm: { top: 1.0, right: 1.0, bottom: 1.0, left: 1.0 } },
        header: {
            enabled: true,
            logo_storage_id: null,
            institution_name: null,
            subtitle: null,
            address: null,
            phone: null,
            email: null,
        },
        footer: { enabled: true, custom_text: null, show_page_number: true },
        style: { primary_color: "#4A4A4A" },
        signer: null,
    },
};

export const v2MinimalNeutral: ReportEnvelope = {
    ...baseEnvelope,
    id: "fixture-v2-2",
    version_no: 1,
    status: "DRAFT",
    title: "Reporte V2 — configuración mínima (defaults neutrales)",
    published_at: null,
    signed_by: null,
    signed_at: null,
    template: v2MinimalSnapshot.template as unknown as ReportTemplateJSON,
    report: { ...v2MinimalContent, schema_version: 2, rendering_snapshot: v2MinimalSnapshot },
    schema_version: 2,
    template_version_id: "00000000-0000-0000-0000-0000000ab002",
    generated_by_renderer_version: "backend-snapshot-builder/fixture/1.0.0",
};

// ---------------------------------------------------------------------------
// Fixture 3 — header disabled.
// ---------------------------------------------------------------------------

const v2NoHeaderContent: ReportContent = {
    base: {
        order_code: { is_visible: true, label: "Código de orden", value: "V2-0003" },
        patient: { is_visible: true, label: "Paciente", value: "Paciente Sintético V2 Tres" },
    },
    sections: {
        section_macroscopic: { is_visible: true, label: "Macroscópica", type: "richtext", content: "<p>Reporte sin encabezado institucional.</p>" },
        images: { is_visible: true, label: "Imágenes", type: "images", content: [] },
    },
    base_order: ["order_code", "patient"],
    section_order: ["section_macroscopic", "images"],
    signatureMetadata: { show_signature_section: false, require_digital_signature: false },
};

const v2NoHeaderSnapshot: ReportRenderingSnapshotV2 = {
    schema_version: 2,
    template: templateFrom(v2NoHeaderContent),
    presentation: {
        paper: { size: "LETTER", orientation: "PORTRAIT", margins_cm: { top: 1.2, right: 1.2, bottom: 1.2, left: 1.2 } },
        header: { enabled: false, logo_storage_id: null, institution_name: null, subtitle: null, address: null, phone: null, email: null },
        footer: { enabled: true, custom_text: "Pie de página sintético", show_page_number: true },
        style: { primary_color: "#4A4A4A" },
        signer: null,
    },
};

export const v2NoHeader: ReportEnvelope = {
    ...baseEnvelope,
    id: "fixture-v2-3",
    version_no: 1,
    status: "DRAFT",
    title: "Reporte V2 — sin encabezado",
    published_at: null,
    signed_by: null,
    signed_at: null,
    template: v2NoHeaderSnapshot.template as unknown as ReportTemplateJSON,
    report: { ...v2NoHeaderContent, schema_version: 2, rendering_snapshot: v2NoHeaderSnapshot },
    schema_version: 2,
    template_version_id: "00000000-0000-0000-0000-0000000ab003",
    generated_by_renderer_version: "backend-snapshot-builder/fixture/1.0.0",
};

// ---------------------------------------------------------------------------
// Fixture 4 — footer disabled.
// ---------------------------------------------------------------------------

const v2NoFooterContent: ReportContent = {
    base: {
        order_code: { is_visible: true, label: "Código de orden", value: "V2-0004" },
        patient: { is_visible: true, label: "Paciente", value: "Paciente Sintético V2 Cuatro" },
    },
    sections: {
        section_macroscopic: { is_visible: true, label: "Macroscópica", type: "richtext", content: "<p>Reporte sin pie de página.</p>" },
        images: { is_visible: true, label: "Imágenes", type: "images", content: [] },
    },
    base_order: ["order_code", "patient"],
    section_order: ["section_macroscopic", "images"],
    signatureMetadata: { show_signature_section: false, require_digital_signature: false },
};

const v2NoFooterSnapshot: ReportRenderingSnapshotV2 = {
    schema_version: 2,
    template: templateFrom(v2NoFooterContent),
    presentation: {
        paper: { size: "LETTER", orientation: "PORTRAIT", margins_cm: { top: 1.2, right: 1.2, bottom: 1.2, left: 1.2 } },
        header: { enabled: true, logo_storage_id: null, institution_name: "Laboratorio Sin Pie", subtitle: null, address: null, phone: null, email: null },
        footer: { enabled: false, custom_text: null, show_page_number: false },
        style: { primary_color: "#3B6E8F" },
        signer: null,
    },
};

export const v2NoFooter: ReportEnvelope = {
    ...baseEnvelope,
    id: "fixture-v2-4",
    version_no: 1,
    status: "DRAFT",
    title: "Reporte V2 — sin pie de página",
    published_at: null,
    signed_by: null,
    signed_at: null,
    template: v2NoFooterSnapshot.template as unknown as ReportTemplateJSON,
    report: { ...v2NoFooterContent, schema_version: 2, rendering_snapshot: v2NoFooterSnapshot },
    schema_version: 2,
    template_version_id: "00000000-0000-0000-0000-0000000ab004",
    generated_by_renderer_version: "backend-snapshot-builder/fixture/1.0.0",
};

// ---------------------------------------------------------------------------
// Fixture 5 — tight margins (0.8-1.0cm), the specific range a real client
// requested (Céluma1.3-Fase2.md, Story C6).
// ---------------------------------------------------------------------------

const v2TightMarginsContent: ReportContent = {
    base: {
        order_code: { is_visible: true, label: "Código de orden", value: "V2-0005" },
        patient: { is_visible: true, label: "Paciente", value: "Paciente Sintético V2 Cinco" },
    },
    sections: {
        section_macroscopic: { is_visible: true, label: "Macroscópica", type: "richtext", content: "<p>Reporte con márgenes reducidos, cercanos al mínimo permitido.</p>" },
        images: { is_visible: true, label: "Imágenes", type: "images", content: [] },
    },
    base_order: ["order_code", "patient"],
    section_order: ["section_macroscopic", "images"],
    signatureMetadata: { show_signature_section: false, require_digital_signature: false },
};

const v2TightMarginsSnapshot: ReportRenderingSnapshotV2 = {
    schema_version: 2,
    template: templateFrom(v2TightMarginsContent),
    presentation: {
        paper: { size: "LETTER", orientation: "PORTRAIT", margins_cm: { top: 0.8, right: 1.0, bottom: 0.8, left: 1.0 } },
        header: { enabled: true, logo_storage_id: null, institution_name: "Laboratorio Márgenes Reducidos", subtitle: null, address: null, phone: null, email: null },
        footer: { enabled: true, custom_text: null, show_page_number: true },
        style: { primary_color: "#4A4A4A" },
        signer: null,
    },
};

export const v2TightMargins: ReportEnvelope = {
    ...baseEnvelope,
    id: "fixture-v2-5",
    version_no: 1,
    status: "DRAFT",
    title: "Reporte V2 — márgenes 0.8-1.0cm",
    published_at: null,
    signed_by: null,
    signed_at: null,
    template: v2TightMarginsSnapshot.template as unknown as ReportTemplateJSON,
    report: { ...v2TightMarginsContent, schema_version: 2, rendering_snapshot: v2TightMarginsSnapshot },
    schema_version: 2,
    template_version_id: "00000000-0000-0000-0000-0000000ab005",
    generated_by_renderer_version: "backend-snapshot-builder/fixture/1.0.0",
};

// ---------------------------------------------------------------------------
// Fixture 6 — invalid: schema_version 2 declared but NO rendering_snapshot
// at all. Must show a controlled fallback, never throw, never fall back to Legacy.
// ---------------------------------------------------------------------------

const v2MissingSnapshotContent = {
    base: {
        order_code: { is_visible: true, label: "Código de orden", value: "V2-0006" },
    },
    sections: {},
    base_order: ["order_code"],
    section_order: [],
    schema_version: 2,
    // rendering_snapshot intentionally absent.
};

export const v2MissingSnapshot: ReportEnvelope = {
    ...baseEnvelope,
    id: "fixture-v2-6",
    version_no: 1,
    status: "DRAFT",
    title: "Reporte V2 — snapshot ausente (inválido)",
    published_at: null,
    signed_by: null,
    signed_at: null,
    template: { base: {}, sections: {}, base_order: [], section_order: [] },
    report: v2MissingSnapshotContent as unknown as ReportContent,
};

// ---------------------------------------------------------------------------
// Fixture 7 — invalid: rendering_snapshot present but structurally broken
// (bad color, missing required paper fields).
// ---------------------------------------------------------------------------

const v2MalformedSnapshotContent = {
    base: {
        order_code: { is_visible: true, label: "Código de orden", value: "V2-0007" },
    },
    sections: {},
    base_order: ["order_code"],
    section_order: [],
    schema_version: 2,
    rendering_snapshot: {
        schema_version: 2,
        template: { base: {}, sections: {}, base_order: [], section_order: [] },
        presentation: {
            paper: { size: "LETTER", orientation: "PORTRAIT", margins_cm: { top: 1, right: 1, bottom: 1, left: 1 } },
            header: { enabled: true, logo_storage_id: null, institution_name: null, subtitle: null, address: null, phone: null, email: null },
            footer: { enabled: true, custom_text: null, show_page_number: true },
            style: { primary_color: "not-a-color" }, // invalid on purpose
            signer: null,
        },
    },
};

export const v2MalformedSnapshot: ReportEnvelope = {
    ...baseEnvelope,
    id: "fixture-v2-7",
    version_no: 1,
    status: "DRAFT",
    title: "Reporte V2 — snapshot inválido (color malformado)",
    published_at: null,
    signed_by: null,
    signed_at: null,
    template: { base: {}, sections: {}, base_order: [], section_order: [] },
    report: v2MalformedSnapshotContent as unknown as ReportContent,
};


// ---------------------------------------------------------------------------
// H-0c Blocker B — autograph signature parity fixtures.
//
// Every pre-existing signed fixture points `signature_url` at
// `cdn.example.invalid`, which by design never loads: they were built to
// exercise LAYOUT, so they can only ever show SignatureBlock's graceful
// fallback. That left the autograph itself — the one thing Blocker B is
// about — with no real-browser coverage at all in either render path.
//
// These two fixtures close that gap. The autograph is an inline data: URI so
// the assertion is about RENDERING semantics and is deterministic offline;
// the deliberately-broken twin proves the fallback still works and still
// signals readiness (an official PDF must never hang because an image 404s).
// ---------------------------------------------------------------------------


const signedContent = (signatureUrl: string | null) => ({
    ...v2CompleteContent,
    signatureMetadata: {
        show_signature_section: true,
        require_digital_signature: true,
        ...(signatureUrl ? { signature_url: signatureUrl } : {}),
    },
});

function signedEnvelope(id: string, signatureUrl: string | null): ReportEnvelope {
    const content = signedContent(signatureUrl);
    return {
        ...v2CompleteBranding,
        id,
        title: "Reporte V2 — firma autógrafa",
        report: { ...content, schema_version: 2, rendering_snapshot: v2CompleteSnapshot },
        // Signed: SignatureBlock derives `isSigned` from signed_at alone.
        signed_by: "00000000-0000-0000-0000-000000000199",
        signed_at: "2026-02-01T10:00:00Z",
        // No header logo, so the only external image on the page is the
        // autograph — a failure cannot be masked by another image.
        resolved_resources: {},
    };
}

/** require_digital_signature=true, signed, autograph loads. */
export const v2SignedWithAutograph = signedEnvelope(
    "fixture-v2-signed-autograph",
    AUTOGRAPH_PNG_DATA_URI,
);

/** Same, but the autograph URL is unreachable — must fall back, not hang. */
export const v2SignedBrokenAutograph = signedEnvelope(
    "fixture-v2-signed-broken-autograph",
    "https://cdn.example.invalid/synthetic/missing-signature.png",
);

/** Signed, but the report does not require a digital signature: no autograph
 *  in EITHER path — the state that must not be confused with a broken one. */
export const v2SignedNoDigitalRequirement: ReportEnvelope = {
    ...signedEnvelope("fixture-v2-signed-no-digital", null),
    report: {
        ...v2CompleteContent,
        signatureMetadata: {
            show_signature_section: true,
            require_digital_signature: false,
        },
        schema_version: 2,
        rendering_snapshot: v2CompleteSnapshot,
    },
};

/** H-0c Blocker B — the state the OFFICIAL renderer is actually served while
 *  the PDF is being captured, which is the state the whole defect lived in.
 *
 *  During `sign-and-publish` the report is still APPROVED (finalize has not
 *  run), yet the signature URL is already embedded and the publish claim
 *  already records who is signing and when. `get_internal_render_data` reports
 *  that claim as the effective signature state, so `signed_at` IS set here
 *  even though the report is not yet PUBLISHED. */
export const v2MidPublicationSigned: ReportEnvelope = {
    ...signedEnvelope("fixture-v2-midpub-signed", AUTOGRAPH_PNG_DATA_URI),
    status: "APPROVED",
    published_at: null,
    signed_by: "00000000-0000-0000-0000-000000000199",
    signed_at: "2026-02-01T10:00:00Z",
};

/** The SAME moment as it looked BEFORE the fix: the renderer was served
 *  `signed_at: null`, so SignatureBlock's `isSigned` was false and the
 *  autograph was never drawn — the official PDF's missing signature. Kept as
 *  an executable record of the defect. */
export const v2MidPublicationUnsigned: ReportEnvelope = {
    ...signedEnvelope("fixture-v2-midpub-unsigned", AUTOGRAPH_PNG_DATA_URI),
    status: "APPROVED",
    published_at: null,
    signed_by: null,
    signed_at: null,
};

export const allVersionedV2Fixtures: Record<string, ReportEnvelope> = {
    v2CompleteBranding,
    v2MinimalNeutral,
    v2NoHeader,
    v2NoFooter,
    v2TightMargins,
    v2MissingSnapshot,
    v2MalformedSnapshot,
    v2SignedWithAutograph,
    v2SignedBrokenAutograph,
    v2SignedNoDigitalRequirement,
    v2MidPublicationSigned,
    v2MidPublicationUnsigned,
};
