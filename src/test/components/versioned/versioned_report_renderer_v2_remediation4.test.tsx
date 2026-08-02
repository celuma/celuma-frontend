import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { createRef } from "react";
import VersionedReportRendererV2, {
    type VersionedReportRendererV2Ref,
} from "../../../components/report/versioned/versioned_report_renderer_v2";
import { v2CompleteBranding, v2MinimalNeutral } from "../../fixtures/reports/versioned_v2";
import {
    parityCortoV2,
    parityFirmadoV2,
    parityMultipaginaV2,
} from "../../fixtures/reports/legacy_v2_parity";
import type { ReportEnvelope } from "../../../models/report";

/**
 * Cuarta remediación post-Fase 2 — capacidades de paridad Legacy conectadas
 * al renderer V2 (Observación 3).
 *
 * Complementa, sin sustituirla, la suite visual
 * `tests-visual/legacy_v2_parity.visual.spec.ts`: allí se compara el
 * resultado (píxeles); aquí se fija el MECANISMO — qué campo del snapshot
 * gobierna qué propiedad — para que un fallo apunte directamente a la
 * causa en vez de a una imagen distinta.
 *
 * Cada `describe` incluye al menos una prueba de COMPATIBILIDAD: un
 * snapshot sin el campo nuevo debe conservar exactamente el valor fijo que
 * el renderer usaba antes de esta remediación.
 */

function renderReport(report: ReportEnvelope) {
    const ref = createRef<VersionedReportRendererV2Ref>();
    const { container } = render(<VersionedReportRendererV2 report={report} ref={ref} />);
    const pages = ref.current?.getPages() ?? [];
    return { pages, text: pages.map((p) => p.textContent).join("\n"), container };
}

function clone(report: ReportEnvelope): ReportEnvelope {
    return JSON.parse(JSON.stringify(report)) as ReportEnvelope;
}

type MutablePresentation = {
    paper: Record<string, unknown>;
    header: Record<string, unknown>;
    footer: Record<string, unknown>;
    style: Record<string, unknown>;
    signer: Record<string, unknown> | null;
};

function presentationOf(report: ReportEnvelope): MutablePresentation {
    return (report.report.rendering_snapshot as { presentation: MutablePresentation }).presentation;
}

/** Tipografía completa; los fixtures V2 históricos no traen el objeto
 *  `typography`, así que las pruebas que ejercitan un campo tipográfico lo
 *  ponen entero en vez de mutar una clave sobre `undefined`. */
function withTypography(report: ReportEnvelope, overrides: Record<string, unknown>): ReportEnvelope {
    presentationOf(report).style.typography = {
        font_family: "ARIAL",
        base_font_size_pt: 10,
        header_font_size_pt: 10,
        footer_font_size_pt: 7,
        ...overrides,
    };
    return report;
}

/** Las tres bandas son hijos directos de la página: encabezado (`top` sin
 *  `bottom`), pie (`bottom` sin `top`) y cuerpo (ambos). */
function bandsOf(page: HTMLElement) {
    const children = Array.from(page.children).filter(
        (el): el is HTMLElement => el instanceof HTMLElement,
    );
    return {
        header: children.find((el) => el.style.top && !el.style.bottom),
        footer: children.find((el) => el.style.bottom && !el.style.top),
        body: children.find((el) => el.style.top && el.style.bottom),
    };
}

// ===========================================================================
// logo_mode
// ===========================================================================

describe("VersionedReportRendererV2 — header.logo_mode", () => {
    it("compatibilidad: sin logo_mode y sin logo resuelto, sigue apareciendo el isotipo neutral", () => {
        // Ésta es la regla que NO puede cambiar: los reportes V2 ya
        // publicados no llevan `logo_mode` y deben renderizarse igual que
        // antes de la remediación.
        const { pages } = renderReport(v2MinimalNeutral);
        const header = bandsOf(pages[0] as HTMLElement).header!;
        expect(header.querySelectorAll("img")).toHaveLength(1);
    });

    it("logo_mode = NONE no dibuja imagen alguna en el encabezado", () => {
        const report = clone(v2MinimalNeutral);
        presentationOf(report).header.logo_mode = "NONE";
        const { pages } = renderReport(report);
        const header = bandsOf(pages[0] as HTMLElement).header!;
        expect(header.querySelectorAll("img")).toHaveLength(0);
    });

    it("logo_mode = NONE tampoco reserva la caja del logo: el texto es hijo directo de la banda", () => {
        // La diferencia reportada no era solo "aparece un logo": era que V2
        // envolvía el bloque institucional en una caja logo+texto aunque no
        // hubiera logo, desplazando el texto respecto a Legacy.
        const report = clone(v2MinimalNeutral);
        presentationOf(report).header.logo_mode = "NONE";
        const { pages } = renderReport(report);
        const header = bandsOf(pages[0] as HTMLElement).header!;
        const wrappers = Array.from(header.children).filter(
            (el): el is HTMLElement => el instanceof HTMLElement && el.style.display === "flex",
        );
        expect(wrappers).toHaveLength(0);
    });

    it("logo_mode = CUSTOM sin URL resuelta no sustituye por el isotipo neutral", () => {
        const report = clone(v2MinimalNeutral);
        presentationOf(report).header.logo_mode = "CUSTOM";
        report.resolved_resources = {};
        const { pages } = renderReport(report);
        const header = bandsOf(pages[0] as HTMLElement).header!;
        expect(header.querySelectorAll("img")).toHaveLength(0);
    });

    it("logo_mode = CUSTOM con URL resuelta dibuja ESA imagen", () => {
        const report = clone(v2MinimalNeutral);
        presentationOf(report).header.logo_mode = "CUSTOM";
        report.resolved_resources = { header_logo_url: "https://cdn.example.invalid/propio.png" };
        const { pages } = renderReport(report);
        const header = bandsOf(pages[0] as HTMLElement).header!;
        const srcs = Array.from(header.querySelectorAll("img")).map((i) => i.getAttribute("src"));
        expect(srcs).toEqual(["https://cdn.example.invalid/propio.png"]);
    });

    it("compatibilidad: el PIE nunca cayó al isotipo neutral, y sigue sin hacerlo", () => {
        const report = clone(v2MinimalNeutral);
        report.resolved_resources = {};
        const { pages } = renderReport(report);
        const footer = bandsOf(pages[0] as HTMLElement).footer!;
        expect(footer.querySelectorAll("img")).toHaveLength(0);
    });
});

// ===========================================================================
// Alturas, offsets y separaciones configurables
// ===========================================================================

describe("VersionedReportRendererV2 — geometría configurable de las bandas", () => {
    it("compatibilidad: sin height_mm/offset_mm el encabezado conserva 24mm y el margen superior", () => {
        const { pages } = renderReport(v2CompleteBranding);
        const { header, footer } = bandsOf(pages[0] as HTMLElement);
        expect(header!.style.height).toBe("24mm");
        expect(footer!.style.height).toBe("16mm");
        expect(header!.style.paddingBottom).toBe("3mm");
        expect(footer!.style.paddingTop).toBe("2mm");
    });

    it("header.height_mm se aplica de verdad (antes se persistía y se ignoraba)", () => {
        const report = clone(v2CompleteBranding);
        presentationOf(report).header.height_mm = 28;
        const { pages } = renderReport(report);
        expect(bandsOf(pages[0] as HTMLElement).header!.style.height).toBe("28mm");
    });

    it("footer.height_mm se aplica de verdad", () => {
        const report = clone(v2CompleteBranding);
        presentationOf(report).footer.height_mm = 20;
        const { pages } = renderReport(report);
        expect(bandsOf(pages[0] as HTMLElement).footer!.style.height).toBe("20mm");
    });

    it("offset_mm coloca las bandas contra el borde de la hoja (el caso Legacy)", () => {
        const report = clone(v2CompleteBranding);
        presentationOf(report).header.offset_mm = 0;
        presentationOf(report).footer.offset_mm = 0;
        const { pages } = renderReport(report);
        const { header, footer } = bandsOf(pages[0] as HTMLElement);
        expect(header!.style.top).toBe("0mm");
        expect(footer!.style.bottom).toBe("0mm");
    });

    it("content_gap_mm y body_padding_top_mm definen el área paginable", () => {
        const report = clone(v2CompleteBranding);
        const p = presentationOf(report);
        p.header.offset_mm = 0;
        p.header.height_mm = 28;
        p.header.content_gap_mm = 0;
        p.footer.offset_mm = 0;
        p.footer.height_mm = 20;
        p.footer.content_gap_mm = 0;
        p.paper.body_padding_top_mm = 4;
        const { pages } = renderReport(report);
        const body = bandsOf(pages[0] as HTMLElement).body!;
        // Exactamente la caja de LegacyReportRendererV1.
        expect(body.style.top).toBe("28mm");
        expect(body.style.bottom).toBe("20mm");
        expect(body.style.paddingTop).toBe("4mm");
        expect(body.style.boxSizing).toBe("border-box");
    });

    it("padding_mm controla el relleno interior de cada banda", () => {
        const report = clone(v2CompleteBranding);
        presentationOf(report).header.padding_mm = 4;
        presentationOf(report).footer.padding_mm = 0;
        const { pages } = renderReport(report);
        const { header, footer } = bandsOf(pages[0] as HTMLElement);
        expect(header!.style.paddingBottom).toBe("4mm");
        expect(footer!.style.paddingTop).toBe("0mm");
    });
});

// ===========================================================================
// Tipografía y pesos
// ===========================================================================

describe("VersionedReportRendererV2 — pesos y tamaños tipográficos", () => {
    it("compatibilidad: sin footer_font_weight el pie no declara peso", () => {
        const { pages } = renderReport(v2CompleteBranding);
        expect(bandsOf(pages[0] as HTMLElement).footer!.style.fontWeight).toBe("");
    });

    it("footer_font_weight = 700 pone el pie en negrita (el pie Legacy)", () => {
        const report = withTypography(clone(v2CompleteBranding), { footer_font_weight: 700 });
        const { pages } = renderReport(report);
        expect(bandsOf(pages[0] as HTMLElement).footer!.style.fontWeight).toBe("700");
    });

    it("compatibilidad: sin header_font_weight, la institución va en 700 y el resto en 400", () => {
        const { pages } = renderReport(v2CompleteBranding);
        const header = bandsOf(pages[0] as HTMLElement).header!;
        const weights = Array.from(header.querySelectorAll("div"))
            .map((d) => d.style.fontWeight)
            .filter(Boolean);
        expect(weights).toContain("700");
        expect(weights).toContain("400");
    });

    it("header_font_weight unifica el peso de TODAS las líneas del encabezado", () => {
        const report = withTypography(clone(v2CompleteBranding), { header_font_weight: 700 });
        const { pages } = renderReport(report);
        const header = bandsOf(pages[0] as HTMLElement).header!;
        const weights = Array.from(header.querySelectorAll("div"))
            .map((d) => d.style.fontWeight)
            .filter(Boolean);
        expect(new Set(weights)).toEqual(new Set(["700"]));
    });

    it("header_secondary_font_size_pt unifica el tamaño de las líneas secundarias", () => {
        const report = withTypography(clone(v2CompleteBranding), {
            header_font_size_pt: 8,
            header_secondary_font_size_pt: 8,
        });
        const { pages } = renderReport(report);
        const header = bandsOf(pages[0] as HTMLElement).header!;
        const sizes = Array.from(header.querySelectorAll("div"))
            .map((d) => d.style.fontSize)
            .filter(Boolean);
        expect(new Set(sizes)).toEqual(new Set(["8pt"]));
    });
});

// ===========================================================================
// Layout del encabezado y del pie
// ===========================================================================

describe("VersionedReportRendererV2 — signer_placement", () => {
    it("compatibilidad: sin signer_placement, el firmante va en su bloque derecho", () => {
        const { pages } = renderReport(v2CompleteBranding);
        const header = bandsOf(pages[0] as HTMLElement).header!;
        const rightBlocks = Array.from(header.children).filter(
            (el): el is HTMLElement => el instanceof HTMLElement && el.style.textAlign === "right",
        );
        expect(rightBlocks).toHaveLength(1);
    });

    it("INLINE fusiona las credenciales en el bloque institucional (forma Legacy)", () => {
        const report = clone(v2CompleteBranding);
        presentationOf(report).header.signer_placement = "INLINE";
        const { pages } = renderReport(report);
        const header = bandsOf(pages[0] as HTMLElement).header!;
        const rightBlocks = Array.from(header.children).filter(
            (el): el is HTMLElement => el instanceof HTMLElement && el.style.textAlign === "right",
        );
        expect(rightBlocks).toHaveLength(0);
        // El texto sigue estando: se movió, no se perdió.
        const signer = presentationOf(report).signer as Record<string, string>;
        expect(header.textContent).toContain(signer.display_name);
        expect(header.textContent).toContain(signer.license_number);
    });

    it("HIDDEN no imprime las credenciales en el encabezado", () => {
        const report = clone(v2CompleteBranding);
        presentationOf(report).header.signer_placement = "HIDDEN";
        const signer = presentationOf(report).signer as Record<string, string>;
        const { pages } = renderReport(report);
        const header = bandsOf(pages[0] as HTMLElement).header!;
        expect(header.textContent).not.toContain(signer.license_number);
    });

    it("INLINE no antepone el relleno \"Céluma\" cuando no hay nombre institucional", () => {
        const report = clone(v2MinimalNeutral);
        presentationOf(report).header.signer_placement = "INLINE";
        presentationOf(report).header.institution_name = null;
        presentationOf(report).header.logo_mode = "NONE";
        presentationOf(report).signer = { display_name: "Dra. Ejemplo", specialty: null, affiliation: null, license_number: null };
        const { pages } = renderReport(report);
        const header = bandsOf(pages[0] as HTMLElement).header!;
        expect(header.textContent).toContain("Dra. Ejemplo");
        expect(header.textContent).not.toContain("Céluma");
    });
});

describe("VersionedReportRendererV2 — footer.layout", () => {
    it("compatibilidad: sin layout, logo y texto van agrupados en una caja flexible", () => {
        const report = clone(v2CompleteBranding);
        report.resolved_resources = { footer_logo_url: "https://cdn.example.invalid/pie.png" };
        const { pages } = renderReport(report);
        const footer = bandsOf(pages[0] as HTMLElement).footer!;
        // El logo NO es hijo directo de la banda: cuelga de la caja
        // agrupadora, que es justo lo que `SPLIT` deshace.
        expect(footer.querySelector(":scope > img")).toBeNull();
        const group = Array.from(footer.children).find(
            (el): el is HTMLElement => el instanceof HTMLElement && el.querySelector("img") !== null,
        );
        expect(group).toBeTruthy();
        expect(group!.style.display).toBe("flex");
    });

    it("SPLIT deja logo y texto como hermanos directos (forma Legacy)", () => {
        const report = clone(v2CompleteBranding);
        presentationOf(report).footer.layout = "SPLIT";
        presentationOf(report).footer.show_page_number = false;
        presentationOf(report).footer.divider = {
            enabled: false, style: "SINGLE", primary_width_px: 1, secondary_width_px: 1, gap_mm: 1, color: null,
        };
        report.resolved_resources = { footer_logo_url: "https://cdn.example.invalid/pie.png" };
        const { pages } = renderReport(report);
        const footer = bandsOf(pages[0] as HTMLElement).footer!;
        const children = Array.from(footer.children);
        expect(children).toHaveLength(2);
        expect((children[0] as HTMLElement).tagName).toBe("IMG");
        expect(footer.style.justifyContent).toBe("space-between");
    });

    it("logo_height_mm / logo_max_width_pct / text_max_width_pct definen la caja Legacy", () => {
        const report = clone(v2CompleteBranding);
        const footer = presentationOf(report).footer;
        footer.layout = "SPLIT";
        footer.logo_height_mm = 16;
        footer.logo_max_width_pct = 35;
        footer.text_max_width_pct = 65;
        footer.show_page_number = false;
        report.resolved_resources = { footer_logo_url: "https://cdn.example.invalid/pie.png" };
        const { pages } = renderReport(report);
        const band = bandsOf(pages[0] as HTMLElement).footer!;
        const img = band.querySelector("img") as HTMLImageElement;
        expect(img.style.height).toBe("16mm");
        expect(img.style.maxWidth).toBe("35%");
        const text = Array.from(band.children).find(
            (el): el is HTMLElement => el instanceof HTMLElement && el.tagName === "DIV",
        )!;
        expect(text.style.maxWidth).toBe("65%");
    });

    it("un custom_text con salto de línea rinde dos renglones (dirección + contacto)", () => {
        const report = clone(v2CompleteBranding);
        presentationOf(report).footer.custom_text = "Calle Falsa 123\nTel. 555";
        const { pages } = renderReport(report);
        const band = bandsOf(pages[0] as HTMLElement).footer!;
        const text = Array.from(band.querySelectorAll("div")).find((d) => d.style.whiteSpace === "pre-line");
        expect(text).toBeTruthy();
        expect(text!.textContent).toBe("Calle Falsa 123\nTel. 555");
    });

    it("show_page_number = false no imprime numeración (Legacy nunca la imprimió)", () => {
        // jsdom no calcula layout, así que aquí siempre sale UNA página: el
        // recuento real y los cortes se verifican en la suite visual
        // (`legacy_v2_parity.visual.spec.ts`, "geometría y paginación").
        // Lo que sí es comprobable en jsdom es la ausencia del rótulo.
        const { text } = renderReport(clone(parityMultipaginaV2));
        expect(text).not.toMatch(/Página \d+ de \d+/);
    });

    it("show_page_number = true sí lo imprime (el rótulo no desapareció para todos)", () => {
        const report = clone(parityMultipaginaV2);
        presentationOf(report).footer.show_page_number = true;
        const { text } = renderReport(report);
        expect(text).toMatch(/Página \d+ de \d+/);
    });
});

// ===========================================================================
// El membrete Legacy completo
// ===========================================================================

describe("VersionedReportRendererV2 — membrete Legacy importado", () => {
    it("no muestra ningún logotipo en el encabezado", () => {
        const { pages } = renderReport(parityCortoV2);
        expect(bandsOf(pages[0] as HTMLElement).header!.querySelectorAll("img")).toHaveLength(0);
    });

    it("muestra el logotipo en el pie", () => {
        const { pages } = renderReport(parityCortoV2);
        expect(bandsOf(pages[0] as HTMLElement).footer!.querySelectorAll("img")).toHaveLength(1);
    });

    it("reproduce la caja de página de Legacy (18mm laterales, bandas de 28/20mm a ras)", () => {
        const { pages } = renderReport(parityCortoV2);
        const { header, footer, body } = bandsOf(pages[0] as HTMLElement);
        expect(header!.style.top).toBe("0mm");
        expect(header!.style.height).toBe("28mm");
        expect(footer!.style.bottom).toBe("0mm");
        expect(footer!.style.height).toBe("20mm");
        expect(body!.style.left).toBe("18mm");
        expect(body!.style.right).toBe("18mm");
        expect(body!.style.top).toBe("28mm");
        expect(body!.style.bottom).toBe("20mm");
        expect(body!.style.paddingTop).toBe("4mm");
    });

    it("imprime las cuatro líneas del encabezado a 8pt en negrita", () => {
        const { pages } = renderReport(parityCortoV2);
        const header = bandsOf(pages[0] as HTMLElement).header!;
        // El único hijo de la banda es el bloque institucional; sus hijos
        // son las cuatro líneas.
        const block = header.firstElementChild as HTMLElement;
        const lines = Array.from(block.children) as HTMLElement[];
        expect(lines).toHaveLength(4);
        for (const line of lines) {
            expect(line.style.fontSize).toBe("8pt");
            expect(line.style.fontWeight).toBe("700");
        }
        expect(header.textContent).toContain("Dra. Arisbeth Villanueva Pérez.");
        expect(header.textContent).toContain("DGP3833349 | DGP. ESP 6133871");
    });

    it("pone el pie en negrita y sin divisores", () => {
        const { pages } = renderReport(parityCortoV2);
        const page = pages[0] as HTMLElement;
        const footer = bandsOf(page).footer!;
        expect(footer.style.fontWeight).toBe("700");
        expect(footer.style.fontSize).toBe("7pt");
        const dividers = Array.from(page.querySelectorAll("div")).filter((d) => d.style.borderTop);
        expect(dividers).toHaveLength(0);
    });

    it("mantiene el bloque de firma real del reporte", () => {
        const { text } = renderReport(parityFirmadoV2);
        // El firmante institucional del membrete y la firma real del
        // reporte son cosas distintas: ambas deben salir.
        expect(text).toContain("Dra. Arisbeth Villanueva Pérez.");
        expect(text).toMatch(/Firma|Firmado/i);
    });

    it("inserta las bandas en el orden encabezado → cuerpo → pie", () => {
        // Ese orden es el de Legacy, y es el que determina el flujo de
        // contenido del PDF (copiar/pegar, búsqueda, lectores de pantalla).
        const { pages } = renderReport(parityCortoV2);
        const children = Array.from((pages[0] as HTMLElement).children) as HTMLElement[];
        const roles = children.map((el) => {
            if (el.style.top && el.style.bottom) return "body";
            if (el.style.bottom) return "footer";
            return "header";
        });
        expect(roles).toEqual(["header", "body", "footer"]);
    });
});
