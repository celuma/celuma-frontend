/**
 * Synthetic clinical content used ONLY by the template editor's live preview
 * (Céluma 1.3 Phase 2, Block D, Story D6). Deliberately separate from
 * src/test/fixtures/reports/versioned_v2.ts, which is test-only — this
 * module ships in the production bundle so the admin editor can render a
 * realistic preview without ever touching real patient data.
 *
 * The editor feeds the resulting envelope through ReportRendererResolver
 * (never an alternate/simplified renderer), exactly like the golden tests
 * do — see report-template-editor-contract.md, "Live preview".
 */
import type { ReportContent, ReportEnvelope, ReportTemplateJSON } from "../../../models/report";
import type { ReportPresentationSnapshotV2, ReportRenderingSnapshotV2 } from "./versioned_report_types";

const PREVIEW_CLINICAL_TEMPLATE: ReportTemplateJSON = {
    base: {
        order_code: { is_visible: true, label: "Código de orden", value: "PREV-0001" },
        patient: { is_visible: true, label: "Paciente", value: "Paciente de ejemplo" },
        study_type: { is_visible: true, label: "Tipo de estudio", value: "Histopatología" },
        patient_age: { is_visible: true, label: "Edad", value: "52" },
        requesting_physician: { is_visible: true, label: "Médico solicitante", value: "Dr. Ejemplo" },
    },
    sections: {
        section_macroscopic: {
            is_visible: true,
            label: "Macroscópica",
            type: "richtext",
            content:
                "<p>Descripción macroscópica de ejemplo para previsualizar el diseño de la plantilla. " +
                "Este contenido es sintético y no corresponde a ningún paciente real.</p>",
        },
        section_microscopic: {
            is_visible: true,
            label: "Microscópica",
            type: "richtext",
            content:
                "<p>Descripción microscópica de ejemplo, únicamente para fines de previsualización " +
                "de márgenes, encabezado, pie de página y color.</p>",
        },
        images: { is_visible: true, label: "Imágenes", type: "images", content: [] },
    },
    base_order: ["order_code", "patient", "study_type", "patient_age", "requesting_physician"],
    section_order: ["section_macroscopic", "section_microscopic", "images"],
    signatureMetadata: { show_signature_section: false, require_digital_signature: false },
};

/**
 * Builds a full ReportEnvelope for the live preview, combining the fixed
 * synthetic clinical content above with the editor's current (unsaved)
 * `presentation` state.
 *
 * `resolvedLogoUrl`/`resolvedFooterLogoUrl` are exactly what the backend
 * would calculate in `resolved_resources.header_logo_url`/
 * `footer_logo_url`. While editing, each is (in order) the URL of the newly
 * uploaded logo, or the resolved URL returned by the backend for the
 * persisted logo.
 *
 * Third remediation: this function previously accepted only the header logo,
 * so the footer logo NEVER appeared in the preview even when correctly saved
 * — issue C from the brief. The renderer already supported it; it simply was
 * not being passed through.
 */
export function buildPreviewReportEnvelope(
    presentation: ReportPresentationSnapshotV2,
    resolvedLogoUrl?: string | null,
    resolvedFooterLogoUrl?: string | null
): ReportEnvelope {
    const snapshot: ReportRenderingSnapshotV2 = {
        schema_version: 2,
        template: PREVIEW_CLINICAL_TEMPLATE as unknown as Record<string, unknown>,
        presentation,
    };

    const report: ReportContent = {
        ...PREVIEW_CLINICAL_TEMPLATE,
        schema_version: 2,
        rendering_snapshot: snapshot,
    };

    return {
        id: "preview",
        version_no: 1,
        status: "DRAFT",
        order_id: "00000000-0000-0000-0000-000000000000",
        tenant_id: "00000000-0000-0000-0000-000000000000",
        branch_id: "00000000-0000-0000-0000-000000000000",
        title: "Previsualización de plantilla",
        published_at: null,
        created_by: "00000000-0000-0000-0000-000000000000",
        signed_by: null,
        signed_at: null,
        template: PREVIEW_CLINICAL_TEMPLATE,
        report,
        schema_version: 2,
        // Same contract as the backend: the entire object is absent when
        // there is nothing to resolve, never present with every field null.
        resolved_resources:
            resolvedLogoUrl || resolvedFooterLogoUrl
                ? {
                      header_logo_url: resolvedLogoUrl ?? null,
                      footer_logo_url: resolvedFooterLogoUrl ?? null,
                  }
                : undefined,
    };
}
