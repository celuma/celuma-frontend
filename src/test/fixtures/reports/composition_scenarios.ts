import type { ReportEnvelope, ReportContent, TemplateImageItem } from "../../../models/report";
import { AUTOGRAPH_PNG_DATA_URI, v2CompleteBranding } from "./versioned_v2";

/**
 * Synthetic report-composition scenarios (Céluma 1.4, #12/#14/#15/#19).
 *
 * Everything here is invented: figures are generated SVGs labelled "FIG n" (no clinical image), names
 * are fictional, and nothing leaves the browser. A scenario starts from `v2CompleteBranding` and
 * overrides only what a case needs, so the letterhead, fonts and signer lookup stay the ones the
 * existing visual suites already exercise.
 */

export interface CompositionScenario {
    /** Number of figures in the images section (default 0). */
    figures?: number;
    /** Alternate wide / tall / square figures instead of one 4:3 ratio. */
    mixedAspect?: boolean;
    /** Base-field keys the template marks "repeat on every page". */
    repeat?: string[];
    /** `signed` (default) = signed with a required autograph; `unsigned` = draft; `plain` = signed,
     *  signature section shown without a digital image; `hidden` = signature section hidden. */
    signature?: "signed" | "unsigned" | "plain" | "hidden";
    /** Autograph shape: `wide` 3:1 (default PNG), `tall` 1:3, `square`. */
    autograph?: "default" | "wide" | "tall" | "square";
    /** Number of filler paragraphs before the images, to force several pages. */
    paragraphs?: number;
    /** Repeat each filler paragraph's sentence this many times (one very long paragraph, default 3). */
    paragraphRepeats?: number;
    /** Wrap every other sentence of the filler paragraphs in <strong> (inline formatting must survive splits). */
    inlineMarkup?: boolean;
    /** Append an ordered list of this many long items (a list taller than a page). */
    listItems?: number;
    /** Use very long patient / requester / signer names and many sample codes. */
    longValues?: boolean;
    /** Markdown table rows to add (long table that must split across pages). */
    tableRows?: number;
    /** Margins in cm: top,right,bottom,left. */
    margins?: [number, number, number, number];
    /** Letterhead band heights (mm), to leave a deliberately small usable body. */
    headerHeightMm?: number;
    footerHeightMm?: number;
    /** Hide the footer / header to cover letterheads without them. */
    footer?: boolean;
    header?: boolean;
    /** Extra visible base keys (e.g. sample_codes, expediente) with values. */
    extraBase?: Record<string, string>;
}

export function figureSvgDataUri(n: number, shape: "wide" | "tall" | "square" | "std"): string {
    const dims = { wide: [400, 200], tall: [200, 400], square: [300, 300], std: [400, 300] }[shape];
    const [w, h] = dims;
    const hue = (n * 47) % 360;
    const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
        `<rect width="${w}" height="${h}" fill="hsl(${hue},45%,82%)"/>` +
        `<rect x="6" y="6" width="${w - 12}" height="${h - 12}" fill="none" stroke="#333" stroke-width="4"/>` +
        `<text x="${w / 2}" y="${h / 2}" font-family="Arial" font-size="48" text-anchor="middle" dominant-baseline="middle">FIG ${n}</text>` +
        `</svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function autographUri(kind: NonNullable<CompositionScenario["autograph"]>): string {
    if (kind === "default") return AUTOGRAPH_PNG_DATA_URI;
    const [w, h] = { wide: [300, 100], tall: [100, 300], square: [160, 160] }[kind];
    const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
        `<path d="M10 ${h - 20} C ${w / 3} 10, ${w / 2} ${h}, ${w - 10} 20" fill="none" stroke="#123" stroke-width="5"/>` +
        `</svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const LONG_NAME = "Paciente Sintética Con Un Nombre Extraordinariamente Largo De Prueba Apellidoparalelo Segundoapellidoinventado";
const LONG_REQUESTERS = [
    "Dra. Solicitante Sintética Número Uno De Un Hospital Ficticio",
    "Dr. Solicitante Sintético Número Dos",
    "Dra. Solicitante Sintética Número Tres Con Nombre Muy Largo",
].join("; ");

export function buildCompositionReport(s: CompositionScenario): ReportEnvelope {
    const report = JSON.parse(JSON.stringify(v2CompleteBranding)) as ReportEnvelope;
    const content = report.report as ReportContent & {
        rendering_snapshot: {
            template: { base: Record<string, Record<string, unknown>>; base_order?: string[]; sections: Record<string, unknown> };
            presentation: {
                paper: { margins_cm: { top: number; right: number; bottom: number; left: number } };
                footer: { enabled: boolean; height_mm?: number };
                header: { enabled: boolean; height_mm?: number };
            };
        };
    };
    const snapshot = content.rendering_snapshot;

    // --- base fields: values live in the content, visibility / repeat flags in the frozen template.
    const extra = { ...(s.extraBase ?? {}) };
    const baseValues: Record<string, string> = {
        order_code: "CMP-0001",
        patient: s.longValues ? LONG_NAME : "Paciente Sintético Compuesto",
        study_type: "Histopatología",
        patient_age: "47",
        requesting_physician: s.longValues ? LONG_REQUESTERS : "Dr. Solicitante Sintético",
        ...extra,
    };
    for (const [key, value] of Object.entries(baseValues)) {
        const existing = (content.base as unknown as Record<string, Record<string, unknown>>)[key] ?? {
            is_visible: true,
            label: key === "sample_codes" ? "Códigos de muestra" : key === "expediente" ? "Expediente" : key,
        };
        (content.base as Record<string, unknown>)[key] = { ...existing, value };
        const inTemplate = snapshot.template.base[key] ?? { ...existing };
        snapshot.template.base[key] = {
            ...inTemplate,
            ...(s.repeat?.includes(key) ? { repeat_on_every_page: true } : {}),
        };
    }
    const order = Object.keys(baseValues);
    content.base_order = order;
    snapshot.template.base_order = order;

    // --- sections
    const sections = content.sections as unknown as Record<string, Record<string, unknown>>;
    sections.section_macroscopic = {
        ...sections.section_macroscopic,
        content: Array.from({ length: s.paragraphs ?? 2 }, (_, i) =>
            `<p>Párrafo sintético ${i + 1}. ` +
            "Texto de relleno sin relevancia clínica real para forzar la paginación del reporte en varias páginas de prueba. ".repeat(s.paragraphRepeats ?? 3) +
            "</p>",
        ).join(""),
    };
    if (s.inlineMarkup) {
        sections.section_macroscopic.content = String(sections.section_macroscopic.content).replace(
            /Texto de relleno sin relevancia clínica real para forzar la paginación del reporte en varias páginas de prueba\. /g,
            "<strong>Texto de relleno sin relevancia clínica real</strong> para forzar la paginación del reporte en varias páginas de prueba. ",
        );
    }
    if (s.listItems) {
        sections.section_macroscopic.content += `<ol>${Array.from({ length: s.listItems }, (_, i) =>
            `<li>Elemento ${i + 1} de la lista sintética. ${"Texto de lista sin relevancia clínica real. ".repeat(6)}</li>`).join("")}</ol>`;
    }
    sections.section_microscopic = { ...sections.section_microscopic, content: "<p>Microscópica breve sintética.</p>" };
    if (s.tableRows) {
        const rows = Array.from({ length: s.tableRows }, (_, i) => `| Hallazgo ${i + 1} | Resultado sintético ${i + 1} |`);
        sections.section_findings_table = {
            ...sections.section_findings_table,
            content: ["| Parámetro | Resultado |", "| --- | --- |", ...rows].join("\n"),
        };
    } else {
        delete sections.section_findings_table;
        content.section_order = content.section_order.filter((k) => k !== "section_findings_table");
    }
    const shapes: Array<"wide" | "tall" | "square" | "std"> = s.mixedAspect ? ["wide", "tall", "square", "std"] : ["std"];
    const figures: TemplateImageItem[] = Array.from({ length: s.figures ?? 0 }, (_, i) => ({
        id: `fig-${i + 1}`,
        url: figureSvgDataUri(i + 1, shapes[i % shapes.length]),
        caption: `Corte ${i + 1} sint.`,
    }));
    sections.images = { ...sections.images, content: figures };
    // Keep the frozen template's section list in step with the content.
    snapshot.template.sections = { ...content.sections } as Record<string, unknown>;

    // --- signature
    const sig = s.signature ?? "signed";
    if (sig === "hidden") {
        content.signatureMetadata = { show_signature_section: false, require_digital_signature: false };
    } else if (sig === "plain") {
        content.signatureMetadata = { show_signature_section: true, require_digital_signature: false };
    } else {
        content.signatureMetadata = {
            show_signature_section: true,
            require_digital_signature: true,
            ...(sig === "signed" ? { signature_url: autographUri(s.autograph ?? "default") } : {}),
        };
    }
    if (sig === "unsigned") {
        report.status = "DRAFT";
        report.signed_at = null;
        report.signed_by = null;
        report.published_at = null;
    }

    // --- geometry
    if (s.margins) {
        const [top, right, bottom, left] = s.margins;
        snapshot.presentation.paper.margins_cm = { top, right, bottom, left };
    }
    if (s.headerHeightMm !== undefined) snapshot.presentation.header.height_mm = s.headerHeightMm;
    if (s.footerHeightMm !== undefined) snapshot.presentation.footer.height_mm = s.footerHeightMm;
    if (s.footer === false) snapshot.presentation.footer.enabled = false;
    if (s.header === false) snapshot.presentation.header.enabled = false;

    return report;
}

export const LONG_SIGNER_NAME = "Dr. Firmante Revisor Sintético Con Un Nombre Y Apellidos Extraordinariamente Largos De Prueba";
