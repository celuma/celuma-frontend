import type { ReportContent, ReportEnvelope, ReportTemplateJSON } from "../../../models/report";
import type { ReportRenderingSnapshotV2 } from "../../../components/report/versioned/versioned_report_types";

/**
 * Segunda remediación post-Fase 2 (UX) — golden de paridad Legacy
 * (legacy-parity-contract.md, sección 9.2 del encargo).
 *
 * DELIBERADAMENTE distinto de todos los demás fixtures en este directorio:
 * usa el texto institucional REAL del membrete Legacy congelado (el mismo
 * que `legacy_letterhead_adapter.py` exporta), porque este fixture existe
 * específicamente para probar el caso "el tenant embajador importó su
 * propio membrete Legacy como .cell y lo seleccionó explícitamente" — en
 * ese caso, mostrar ese texto es el comportamiento CORRECTO (ver
 * report-rendering-inventory.md §5.1, "Caso esperado"). No es información
 * de paciente — es información institucional/profesional ya pública en
 * cada reporte Legacy histórico.
 *
 * Vive fuera de components/report/versioned/ a propósito: ese directorio
 * tiene su propio guardia estático (no_legacy_literals.test.ts) que
 * verifica que el CÓDIGO del renderer nunca contenga estos literales
 * hardcodeados — un FIXTURE de prueba que los usa como dato explícito de
 * entrada es exactamente lo opuesto de una fuga, y no debe vivir bajo ese
 * guardia.
 */

const content: ReportContent = {
    base: {
        order_code: { is_visible: true, label: "Código de orden", value: "PARITY-0001" },
        patient: { is_visible: true, label: "Paciente", value: "Paciente Sintético Paridad" },
        study_type: { is_visible: true, label: "Tipo de estudio", value: "Histopatología" },
        patient_age: { is_visible: true, label: "Edad", value: "50" },
        requesting_physician: { is_visible: true, label: "Médico solicitante", value: "Dr. Solicitante Paridad" },
    },
    sections: {
        section_macroscopic: {
            is_visible: true, label: "Macroscópica", type: "richtext",
            content: "<p>Descripción macroscópica sintética para el golden de paridad Legacy.</p>",
        },
        section_microscopic: {
            is_visible: true, label: "Microscópica", type: "richtext",
            content: "<p>Descripción microscópica sintética para el golden de paridad Legacy.</p>",
        },
    },
    base_order: ["order_code", "patient", "study_type", "patient_age", "requesting_physician"],
    section_order: ["section_macroscopic", "section_microscopic"],
};

const template: ReportTemplateJSON = {
    base: content.base,
    sections: content.sections,
    base_order: content.base_order,
    section_order: content.section_order,
};

// Mirrors legacy_letterhead_adapter.py's build_legacy_letterhead_export()
// exactly — same institutional text, same color, same layout decisions.
//
// CUARTA REMEDIACIÓN: este snapshot se actualizó junto con el adaptador.
// Hasta la tercera remediación transportaba campos que el renderer V2
// simplemente ignoraba (`height_mm`), y repartía las cuatro líneas del
// encabezado Legacy entre institution_name/subtitle/address, que tienen
// tamaños distintos y dejaban la dirección postal arriba en vez de en el
// pie. Ahora emite `logo_mode`, `signer_placement`, offsets/alturas/gaps,
// `layout=SPLIT` y los pesos tipográficos — todos ya conectados al
// renderer. Su golden (`v2-membrete-legacy-importado.png`) se regeneró por
// esa razón; los goldens Legacy y los cinco goldens V2 históricos NO se
// tocaron. Ver v2-legacy-parity-capabilities.md.
const snapshot: ReportRenderingSnapshotV2 = {
    schema_version: 2,
    template: template as unknown as Record<string, unknown>,
    presentation: {
        paper: {
            size: "LETTER",
            orientation: "PORTRAIT",
            margins_cm: { top: 2.8, right: 1.8, bottom: 2.0, left: 1.8 },
            body_padding_top_mm: 4,
        },
        header: {
            enabled: true,
            logo_storage_id: null,
            institution_name: null,
            subtitle: null,
            address: null,
            phone: null,
            email: null,
            logo_position: "LEFT",
            content_alignment: "BOTTOM",
            height_mm: 28,
            divider: { enabled: false, style: "SINGLE", primary_width_px: 1, secondary_width_px: 1, gap_mm: 1, color: null },
            logo_mode: "NONE",
            offset_mm: 0,
            content_gap_mm: 0,
            padding_mm: 4,
            signer_placement: "INLINE",
            logo_height_mm: null,
            logo_max_width_mm: null,
        },
        footer: {
            enabled: true,
            custom_text:
                "Francisco Rojas González No. 654 Col. Ladrón de Guevara, Guadalajara, Jalisco, México C.P. 44600\n" +
                "Tel. 33 2015 0100, 33 2015 0101. Cel. 33 2823-1959  patologiaynefropatologia@gmail.com",
            show_page_number: false,
            logo_storage_id: null,
            logo_position: "LEFT",
            content_alignment: "RIGHT",
            height_mm: 20,
            divider: { enabled: false, style: "SINGLE", primary_width_px: 1, secondary_width_px: 1, gap_mm: 1, color: null },
            logo_mode: "CUSTOM",
            layout: "SPLIT",
            offset_mm: 0,
            content_gap_mm: 0,
            padding_mm: 0,
            logo_height_mm: 16,
            logo_max_width_pct: 35,
            text_max_width_pct: 65,
        },
        style: {
            primary_color: "#002060",
            secondary_color: null,
            typography: {
                font_family: "ARIAL",
                base_font_size_pt: 10,
                header_font_size_pt: 8,
                footer_font_size_pt: 7,
                header_secondary_font_size_pt: 8,
                header_font_weight: 700,
                footer_font_weight: 700,
                body_font_weight: null,
                line_height: null,
            },
        },
        signer: {
            display_name: "Dra. Arisbeth Villanueva Pérez.",
            specialty: "Anatomía Patológica, Nefropatología y Citología Exfoliativa",
            license_number: "DGP3833349 | DGP. ESP 6133871",
            affiliation: "Centro Médico Nacional de Occidente IMSS. INCMNSZ",
        },
    },
};

export const v2LegacyImportedMembrete: ReportEnvelope = {
    order_id: "00000000-0000-0000-0000-000000000903",
    tenant_id: "00000000-0000-0000-0000-000000000901",
    branch_id: "00000000-0000-0000-0000-000000000902",
    created_by: "00000000-0000-0000-0000-000000000999",
    id: "fixture-v2-legacy-parity",
    version_no: 1,
    status: "PUBLISHED",
    title: "Reporte V2 — membrete Legacy importado (golden de paridad)",
    published_at: "2026-08-01T10:00:00Z",
    signed_by: null,
    signed_at: null,
    template: snapshot.template as unknown as ReportTemplateJSON,
    report: { ...content, schema_version: 2, rendering_snapshot: snapshot },
    schema_version: 2,
    template_version_id: "00000000-0000-0000-0000-0000000ab900",
    generated_by_renderer_version: "backend-snapshot-builder/fixture/1.0.0",
    resolved_resources: {},
};

export const allVersionedV2LegacyParityFixtures: Record<string, ReportEnvelope> = {
    v2LegacyImportedMembrete,
};
