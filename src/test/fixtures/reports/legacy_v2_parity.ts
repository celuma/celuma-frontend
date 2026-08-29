import type { ReportContent, ReportEnvelope, ReportTemplateJSON } from "../../../models/report";
import type { ReportRenderingSnapshotV2 } from "../../../components/report/versioned/versioned_report_types";
import legacyLogo from "../../../images/report_logo.png";
import { AUTOGRAPH_PNG_DATA_URI } from "./versioned_v2";

/**
 * Fourth post-Phase 2 remediation — PAIRED fixtures for the Legacy ↔ V2
 * parity suite (`tests-visual/legacy_v2_parity.visual.spec.ts`).
 *
 * The core idea: each clinical case is declared ONCE and emitted in two
 * envelopes built from the SAME content object —
 *
 *   `<case>Legacy` -> no `schema_version`  -> LegacyReportRendererV1
 *   `<case>V2`     -> `schema_version = 2`  -> VersionedReportRendererV2
 *                                              + imported Legacy letterhead
 *
 * so any difference between the two screenshots can only come from the
 * renderer or letterhead, never the data. Comparing JSON or counting fields
 * does not prove parity; comparing these two screenshots does.
 *
 * `LEGACY_PARITY_PRESENTATION` is the TypeScript copy of what
 * `celuma-backend/app/services/legacy_letterhead_adapter.py` currently
 * produces (`build_legacy_letterhead_export()`), field by field. A backend
 * contract test (`test_letterhead_remediation4.py`) pins those server-side
 * values; if they ever diverge, the visual parity suite must fail.
 *
 * Regarding the real institutional text: as in
 * versioned_v2_legacy_parity.ts, it is the CORRECT input data here — the
 * case being tested is "the ambassador tenant imported its own Legacy
 * letterhead." It is not patient information.
 */

const baseEnvelope = {
    order_id: "00000000-0000-0000-0000-000000000903",
    tenant_id: "00000000-0000-0000-0000-000000000901",
    branch_id: "00000000-0000-0000-0000-000000000902",
    created_by: "00000000-0000-0000-0000-000000000999",
};

/** Same ID as `DEFAULT_SIGNER_LOOKUP` in the visual harness. */
export const PARITY_SIGNER_ID = "00000000-0000-0000-0000-000000000099";

const PHYSICIAN_NAME = "Dra. Arisbeth Villanueva Pérez.";
const PHYSICIAN_SPECIALTY = "Anatomía Patológica, Nefropatología y Citología Exfoliativa";
const PHYSICIAN_AFFILIATION = "Centro Médico Nacional de Occidente IMSS. INCMNSZ";
const PHYSICIAN_LICENSES = "DGP3833349 | DGP. ESP 6133871";
const FOOTER_ADDRESS =
    "Francisco Rojas González No. 654 Col. Ladrón de Guevara, Guadalajara, Jalisco, México C.P. 44600";
const FOOTER_CONTACT =
    "Tel. 33 2015 0100, 33 2015 0101. Cel. 33 2823-1959  patologiaynefropatologia@gmail.com";

/** Exact copy of `build_legacy_letterhead_export().letterhead.presentation`. */
export const LEGACY_PARITY_PRESENTATION: ReportRenderingSnapshotV2["presentation"] = {
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
        custom_text: `${FOOTER_ADDRESS}\n${FOOTER_CONTACT}`,
        show_page_number: false,
        // In production, import materializes the StorageObject created from
        // `assets.footer_logo` here; the fixture only needs the resolved URL
        // (`resolved_resources.footer_logo_url`), which is all the renderer
        // consumes.
        logo_storage_id: "00000000-0000-0000-0000-00000000f001",
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
        display_name: PHYSICIAN_NAME,
        specialty: PHYSICIAN_SPECIALTY,
        license_number: PHYSICIAN_LICENSES,
        affiliation: PHYSICIAN_AFFILIATION,
    },
};

function templateFrom(content: ReportContent): ReportTemplateJSON {
    return {
        base: content.base,
        sections: content.sections,
        base_order: content.base_order,
        section_order: content.section_order,
    };
}

interface PairOptions {
    key: string;
    title: string;
    status: ReportEnvelope["status"];
    signedBy?: string | null;
    signedAt?: string | null;
    publishedAt?: string | null;
}

/**
 * Builds BOTH envelopes for a case from one content object. V2 receives the
 * `rendering_snapshot` with the Legacy letterhead and resolved footer logo
 * URL — the SAME bitmap embedded by LegacyReportRendererV1 — so the
 * comparison does not measure two different images.
 */
function makeParityPair(content: ReportContent, opts: PairOptions): {
    legacy: ReportEnvelope;
    v2: ReportEnvelope;
} {
    const template = templateFrom(content);
    const shared = {
        ...baseEnvelope,
        version_no: 1,
        status: opts.status,
        title: opts.title,
        published_at: opts.publishedAt ?? null,
        signed_by: opts.signedBy ?? null,
        signed_at: opts.signedAt ?? null,
    };

    const snapshot: ReportRenderingSnapshotV2 = {
        schema_version: 2,
        template: template as unknown as Record<string, unknown>,
        presentation: LEGACY_PARITY_PRESENTATION,
    };

    return {
        legacy: {
            ...shared,
            id: `parity-${opts.key}-legacy`,
            template,
            report: content,
        },
        v2: {
            ...shared,
            id: `parity-${opts.key}-v2`,
            template,
            report: { ...content, schema_version: 2, rendering_snapshot: snapshot },
            schema_version: 2,
            template_version_id: "00000000-0000-0000-0000-0000000ab904",
            generated_by_renderer_version: "backend-snapshot-builder/fixture/1.0.0",
            resolved_resources: { footer_logo_url: legacyLogo },
        },
    };
}

const BASE_FIELDS: ReportContent["base"] = {
    order_code: { is_visible: true, label: "Código de orden", value: "PARITY-0001" },
    patient: { is_visible: true, label: "Paciente", value: "Paciente Sintético Paridad" },
    study_type: { is_visible: true, label: "Tipo de estudio", value: "Histopatología" },
    patient_age: { is_visible: true, label: "Edad", value: "50" },
    requesting_physician: { is_visible: true, label: "Médico solicitante", value: "Dr. Solicitante Paridad" },
};
const BASE_ORDER = ["order_code", "patient", "study_type", "patient_age", "requesting_physician"];

// --------------------------------------------------------------------------
// Case 1 — short report without images
// --------------------------------------------------------------------------
const shortContent: ReportContent = {
    base: BASE_FIELDS,
    sections: {
        section_macroscopic: {
            is_visible: true, label: "Macroscópica", type: "richtext",
            content: "<p>Fragmento único de tejido sintético, 1.0 x 0.5 cm.</p>",
        },
        section_microscopic: {
            is_visible: true, label: "Microscópica", type: "richtext",
            content: "<p>Hallazgo de prueba sin relevancia clínica.</p>",
        },
    },
    base_order: BASE_ORDER,
    section_order: ["section_macroscopic", "section_microscopic"],
    signatureMetadata: { show_signature_section: false, require_digital_signature: false },
};

const shortPair = makeParityPair(shortContent, {
    key: "short", title: "Parity — short report without images", status: "DRAFT",
});

// --------------------------------------------------------------------------
// Case 2 — multiple sections (richtext + text + table)
// --------------------------------------------------------------------------
const sectionsContent: ReportContent = {
    base: BASE_FIELDS,
    sections: {
        section_macroscopic: {
            is_visible: true, label: "Macroscópica", type: "richtext",
            content: "<p>Se reciben tres fragmentos etiquetados A, B y C.</p><p>Cada fragmento se procesa por separado.</p>",
        },
        section_microscopic: {
            is_visible: true, label: "Microscópica", type: "richtext",
            content: "<p>Descripción microscópica sintética de las tres muestras, sin hallazgos reales.</p><ul><li>Fragmento A: sin alteraciones.</li><li>Fragmento B: sin alteraciones.</li><li>Fragmento C: sin alteraciones.</li></ul>",
        },
        section_measurements: {
            is_visible: true, label: "Mediciones", type: "table",
            content: "| Fragmento | Largo | Ancho |\n| --- | --- | --- |\n| A | 1.0 cm | 0.5 cm |\n| B | 1.2 cm | 0.6 cm |\n| C | 0.8 cm | 0.4 cm |",
        },
        section_diagnosis: {
            is_visible: true, label: "Diagnóstico", type: "text",
            content: "Diagnóstico de prueba: hallazgo sintético benigno.",
        },
        section_comment: {
            is_visible: true, label: "Comentario", type: "text",
            content: "Comentario sintético para la suite de paridad.",
        },
    },
    base_order: BASE_ORDER,
    section_order: [
        "section_macroscopic", "section_microscopic", "section_measurements",
        "section_diagnosis", "section_comment",
    ],
    signatureMetadata: { show_signature_section: false, require_digital_signature: false },
};

const sectionsPair = makeParityPair(sectionsContent, {
    key: "sections", title: "Parity — multiple sections", status: "IN_REVIEW",
});

// --------------------------------------------------------------------------
// Case 3 — report with images
// --------------------------------------------------------------------------
const imagesContent: ReportContent = {
    base: BASE_FIELDS,
    sections: {
        section_macroscopic: {
            is_visible: true, label: "Macroscópica", type: "richtext",
            content: "<p>Descripción macroscópica sintética con material fotográfico.</p>",
        },
        images: {
            is_visible: true, label: "Imágenes", type: "images",
            content: [
                { id: "img-p1", url: "https://cdn.example.invalid/synthetic/parity-1.png", caption: "Corte 1 (sintético)" },
                { id: "img-p2", url: "https://cdn.example.invalid/synthetic/parity-2.png", caption: "Corte 2 (sintético)" },
                { id: "img-p3", url: "https://cdn.example.invalid/synthetic/parity-3.png", caption: "Corte 3 (sintético)" },
                { id: "img-p4", url: "https://cdn.example.invalid/synthetic/parity-4.png", caption: "" },
            ],
        },
    },
    base_order: BASE_ORDER,
    section_order: ["section_macroscopic", "images"],
    signatureMetadata: { show_signature_section: false, require_digital_signature: false },
};

const imagesPair = makeParityPair(imagesContent, {
    key: "images", title: "Parity — report with images", status: "APPROVED",
});

// --------------------------------------------------------------------------
// Case 4 — signed report (the report's actual signature, not the
// institutional letterhead signer: they are distinct and both must match).
// --------------------------------------------------------------------------
const signedContent: ReportContent = {
    base: BASE_FIELDS,
    sections: {
        section_macroscopic: {
            is_visible: true, label: "Macroscópica", type: "richtext",
            content: "<p>Descripción macroscópica sintética del caso firmado.</p>",
        },
        section_diagnosis: {
            is_visible: true, label: "Diagnóstico", type: "text",
            content: "Diagnóstico de prueba: hallazgo sintético benigno.",
        },
    },
    base_order: BASE_ORDER,
    section_order: ["section_macroscopic", "section_diagnosis"],
    signatureMetadata: {
        show_signature_section: true,
        require_digital_signature: true,
        // H-0c Blocker B: a real, loadable autograph — see versioned_v2.ts.
        // The parity test asserts "the report's real signature appears in
        // both PDFs"; with an unreachable URL it could only ever compare two
        // reports that both failed to draw one.
        signature_url: AUTOGRAPH_PNG_DATA_URI,
    },
};

const signedPair = makeParityPair(signedContent, {
    key: "signed",
    title: "Parity — signed report",
    status: "PUBLISHED",
    signedBy: PARITY_SIGNER_ID,
    signedAt: "2026-07-01T12:00:00Z",
    publishedAt: "2026-07-01T12:00:00Z",
});

// --------------------------------------------------------------------------
// Case 5 — multipage (the case that truly tests pagination parity: same
// number of pages and identical breaks).
// --------------------------------------------------------------------------
const longParagraph = (n: number) =>
    `<p>Párrafo sintético ${n} de la suite de paridad. Texto de relleno sin contenido clínico real, ` +
    "repetido para forzar el salto de página y verificar que ambos renderers cortan en el mismo " +
    "punto. Ninguna palabra de este párrafo describe un hallazgo verdadero ni corresponde a un " +
    "paciente real; su única función es ocupar altura de manera determinista.</p>";

const multipageContent: ReportContent = {
    base: BASE_FIELDS,
    sections: {
        section_macroscopic: {
            is_visible: true, label: "Macroscópica", type: "richtext",
            content: Array.from({ length: 12 }, (_, i) => longParagraph(i + 1)).join(""),
        },
        section_microscopic: {
            is_visible: true, label: "Microscópica", type: "richtext",
            content: Array.from({ length: 12 }, (_, i) => longParagraph(i + 13)).join(""),
        },
    },
    base_order: BASE_ORDER,
    section_order: ["section_macroscopic", "section_microscopic"],
    signatureMetadata: { show_signature_section: false, require_digital_signature: false },
};

const multipagePair = makeParityPair(multipageContent, {
    key: "multipage", title: "Parity — multipage report", status: "APPROVED",
});

/** The five minimum cases required by the fourth remediation (§15). */
export const LEGACY_V2_PARITY_CASES = [
    { key: "short", description: "short report without images" },
    { key: "sections", description: "report with multiple sections" },
    { key: "images", description: "report with images" },
    { key: "signed", description: "signed report" },
    { key: "multipage", description: "multipage report" },
] as const;

// Exported individually as well as in the map so unit tests (vitest) can
// import a specific case without loading the entire index.
export const parityShortLegacy = shortPair.legacy;
export const parityShortV2 = shortPair.v2;
export const paritySectionsLegacy = sectionsPair.legacy;
export const paritySectionsV2 = sectionsPair.v2;
export const parityImagesLegacy = imagesPair.legacy;
export const parityImagesV2 = imagesPair.v2;
export const paritySignedLegacy = signedPair.legacy;
export const paritySignedV2 = signedPair.v2;
export const parityMultipageLegacy = multipagePair.legacy;
export const parityMultipageV2 = multipagePair.v2;

export const allLegacyV2ParityFixtures: Record<string, ReportEnvelope> = {
    parityShortLegacy,
    parityShortV2,
    paritySectionsLegacy,
    paritySectionsV2,
    parityImagesLegacy,
    parityImagesV2,
    paritySignedLegacy,
    paritySignedV2,
    parityMultipageLegacy,
    parityMultipageV2,
};
