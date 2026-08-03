import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { createRef } from "react";
import VersionedReportRendererV2, {
    type VersionedReportRendererV2Ref,
} from "../../../components/report/versioned/versioned_report_renderer_v2";
import { v2CompleteBranding, v2MinimalNeutral } from "../../fixtures/reports/versioned_v2";
import {
    parityMultipageV2,
    parityShortV2,
    paritySignedV2,
} from "../../fixtures/reports/legacy_v2_parity";
import type { ReportEnvelope } from "../../../models/report";

/**
 * Fourth post-Phase 2 remediation — Legacy parity capabilities connected
 * to the V2 renderer (Observation 3).
 *
 * Complements, without replacing, the visual suite
 * `tests-visual/legacy_v2_parity.visual.spec.ts`: there is compared the
 * result (pixels); MECANISMO — which snapshot field is posted here
 * governs which property — so that failure points directly to the
 * cause instead of a a different image.
 *
 * each `describe` includes at least a compatibility test: a
 * snapshot without the field new must preserve exactly the fixed value that
 * the renderer used before this remediation.
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

/** typography complete; historical V2 fixtures do not come with the object
 * `typography`, so the tests that exercise field typographic do
 * they put integer instead of mutating to key about `undefined`. */
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

/** The three bands are direct children of the page: header (`top` without
 *  `bottom`), footer (`bottom` without `top`), and body (both). */
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
    it("compatibility: without logo_mode and without logo resolved, the neutral isotype remains appearing", () => {
        // This is the rule that CANNOT change: V2 reports are already
        // published do not carry `logo_mode` and must be rendered the same as
        // before remediation.
        const { pages } = renderReport(v2MinimalNeutral);
        const header = bandsOf(pages[0] as HTMLElement).header!;
        expect(header.querySelectorAll("img")).toHaveLength(1);
    });

    it("logo_mode = NONE does not draw any image in the header", () => {
        const report = clone(v2MinimalNeutral);
        presentationOf(report).header.logo_mode = "NONE";
        const { pages } = renderReport(report);
        const header = bandsOf(pages[0] as HTMLElement).header!;
        expect(header.querySelectorAll("img")).toHaveLength(0);
    });

    it("logo_mode = NONE also does not reserve the logo box: the text is a direct child of the band", () => {
        // The difference reported was not just "appears a logo": it was that V2
        // wrapped the institutional block in a logo+text box although not
        // there would be a logo, moving the text with respect to Legacy.
        const report = clone(v2MinimalNeutral);
        presentationOf(report).header.logo_mode = "NONE";
        const { pages } = renderReport(report);
        const header = bandsOf(pages[0] as HTMLElement).header!;
        const wrappers = Array.from(header.children).filter(
            (el): el is HTMLElement => el instanceof HTMLElement && el.style.display === "flex",
        );
        expect(wrappers).toHaveLength(0);
    });

    it("logo_mode = CUSTOM without URL resolved not replaces by the neutral isotype", () => {
        const report = clone(v2MinimalNeutral);
        presentationOf(report).header.logo_mode = "CUSTOM";
        report.resolved_resources = {};
        const { pages } = renderReport(report);
        const header = bandsOf(pages[0] as HTMLElement).header!;
        expect(header.querySelectorAll("img")).toHaveLength(0);
    });

    it("logo_mode = CUSTOM with URL resolved draws ESA image", () => {
        const report = clone(v2MinimalNeutral);
        presentationOf(report).header.logo_mode = "CUSTOM";
        report.resolved_resources = { header_logo_url: "https://cdn.example.invalid/propio.png" };
        const { pages } = renderReport(report);
        const header = bandsOf(pages[0] as HTMLElement).header!;
        const srcs = Array.from(header.querySelectorAll("img")).map((i) => i.getAttribute("src"));
        expect(srcs).toEqual(["https://cdn.example.invalid/propio.png"]);
    });

    it("compatibility: the footer never fell to the neutral isotype, and remains without doing so", () => {
        const report = clone(v2MinimalNeutral);
        report.resolved_resources = {};
        const { pages } = renderReport(report);
        const footer = bandsOf(pages[0] as HTMLElement).footer!;
        expect(footer.querySelectorAll("img")).toHaveLength(0);
    });
});

// ===========================================================================
// Configurable heights, offsets and separations
// ===========================================================================

describe("VersionedReportRendererV2 — configurable band geometry", () => {
    it("compatibility: without height_mm/offset_mm the header keeps 24mm and the top margin", () => {
        const { pages } = renderReport(v2CompleteBranding);
        const { header, footer } = bandsOf(pages[0] as HTMLElement);
        expect(header!.style.height).toBe("24mm");
        expect(footer!.style.height).toBe("16mm");
        expect(header!.style.paddingBottom).toBe("3mm");
        expect(footer!.style.paddingTop).toBe("2mm");
    });

    it("header.height_mm is actually applied (before was persisted and ignored)", () => {
        const report = clone(v2CompleteBranding);
        presentationOf(report).header.height_mm = 28;
        const { pages } = renderReport(report);
        expect(bandsOf(pages[0] as HTMLElement).header!.style.height).toBe("28mm");
    });

    it("footer.height_mm is actually applied", () => {
        const report = clone(v2CompleteBranding);
        presentationOf(report).footer.height_mm = 20;
        const { pages } = renderReport(report);
        expect(bandsOf(pages[0] as HTMLElement).footer!.style.height).toBe("20mm");
    });

    it("offset_mm places the bands against the edge of the sheet (the Legacy case)", () => {
        const report = clone(v2CompleteBranding);
        presentationOf(report).header.offset_mm = 0;
        presentationOf(report).footer.offset_mm = 0;
        const { pages } = renderReport(report);
        const { header, footer } = bandsOf(pages[0] as HTMLElement);
        expect(header!.style.top).toBe("0mm");
        expect(footer!.style.bottom).toBe("0mm");
    });

    it("content_gap_mm and body_padding_top_mm define the paginable area", () => {
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
        // exactly the LegacyReportRendererV1 box.
        expect(body.style.top).toBe("28mm");
        expect(body.style.bottom).toBe("20mm");
        expect(body.style.paddingTop).toBe("4mm");
        expect(body.style.boxSizing).toBe("border-box");
    });

    it("padding_mm controls the inner padding of each band", () => {
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
// Typography and weights
// ===========================================================================

describe("VersionedReportRendererV2 — font weights and sizes", () => {
    it("compatibility: without footer_font_weight the footer declares no weight", () => {
        const { pages } = renderReport(v2CompleteBranding);
        expect(bandsOf(pages[0] as HTMLElement).footer!.style.fontWeight).toBe("");
    });

    it("footer_font_weight = 700 makes the footer bold (Legacy footer)", () => {
        const report = withTypography(clone(v2CompleteBranding), { footer_font_weight: 700 });
        const { pages } = renderReport(report);
        expect(bandsOf(pages[0] as HTMLElement).footer!.style.fontWeight).toBe("700");
    });

    it("compatibility: without header_font_weight, the institution goes at 700 and the rest at 400", () => {
        const { pages } = renderReport(v2CompleteBranding);
        const header = bandsOf(pages[0] as HTMLElement).header!;
        const weights = Array.from(header.querySelectorAll("div"))
            .map((d) => d.style.fontWeight)
            .filter(Boolean);
        expect(weights).toContain("700");
        expect(weights).toContain("400");
    });

    it("header_font_weight unifies the weight of all the header lines", () => {
        const report = withTypography(clone(v2CompleteBranding), { header_font_weight: 700 });
        const { pages } = renderReport(report);
        const header = bandsOf(pages[0] as HTMLElement).header!;
        const weights = Array.from(header.querySelectorAll("div"))
            .map((d) => d.style.fontWeight)
            .filter(Boolean);
        expect(new Set(weights)).toEqual(new Set(["700"]));
    });

    it("header_secondary_font_size_pt unifies the size of secondary lines", () => {
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
// Header and footer layout
// ===========================================================================

describe("VersionedReportRendererV2 — signer_placement", () => {
    it("compatibility: without signer_placement, the signer goes in its right block", () => {
        const { pages } = renderReport(v2CompleteBranding);
        const header = bandsOf(pages[0] as HTMLElement).header!;
        const rightBlocks = Array.from(header.children).filter(
            (el): el is HTMLElement => el instanceof HTMLElement && el.style.textAlign === "right",
        );
        expect(rightBlocks).toHaveLength(1);
    });

    it("INLINE merges credentials into institutional block (Legacy form)", () => {
        const report = clone(v2CompleteBranding);
        presentationOf(report).header.signer_placement = "INLINE";
        const { pages } = renderReport(report);
        const header = bandsOf(pages[0] as HTMLElement).header!;
        const rightBlocks = Array.from(header.children).filter(
            (el): el is HTMLElement => el instanceof HTMLElement && el.style.textAlign === "right",
        );
        expect(rightBlocks).toHaveLength(0);
        // The text remains: moved, not lost.
        const signer = presentationOf(report).signer as Record<string, string>;
        expect(header.textContent).toContain(signer.display_name);
        expect(header.textContent).toContain(signer.license_number);
    });

    it("HIDDEN does not print credentials in the header", () => {
        const report = clone(v2CompleteBranding);
        presentationOf(report).header.signer_placement = "HIDDEN";
        const signer = presentationOf(report).signer as Record<string, string>;
        const { pages } = renderReport(report);
        const header = bandsOf(pages[0] as HTMLElement).header!;
        expect(header.textContent).not.toContain(signer.license_number);
    });

    it("INLINE does not prepend the \"Céluma\" padding when there is no institutional name", () => {
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
    it("compatibility: without layout, logo and text are grouped in a flexible box", () => {
        const report = clone(v2CompleteBranding);
        report.resolved_resources = { footer_logo_url: "https://cdn.example.invalid/footer.png" };
        const { pages } = renderReport(report);
        const footer = bandsOf(pages[0] as HTMLElement).footer!;
        // The logo is NOT a direct child of the band: it hangs from the box
        // grouper, which is just what `SPLIT` undoes.
        expect(footer.querySelector(":scope > img")).toBeNull();
        const group = Array.from(footer.children).find(
            (el): el is HTMLElement => el instanceof HTMLElement && el.querySelector("img") !== null,
        );
        expect(group).toBeTruthy();
        expect(group!.style.display).toBe("flex");
    });

    it("SPLIT leaves logo and text as direct siblings (Legacy form)", () => {
        const report = clone(v2CompleteBranding);
        presentationOf(report).footer.layout = "SPLIT";
        presentationOf(report).footer.show_page_number = false;
        presentationOf(report).footer.divider = {
            enabled: false, style: "SINGLE", primary_width_px: 1, secondary_width_px: 1, gap_mm: 1, color: null,
        };
        report.resolved_resources = { footer_logo_url: "https://cdn.example.invalid/footer.png" };
        const { pages } = renderReport(report);
        const footer = bandsOf(pages[0] as HTMLElement).footer!;
        const children = Array.from(footer.children);
        expect(children).toHaveLength(2);
        expect((children[0] as HTMLElement).tagName).toBe("IMG");
        expect(footer.style.justifyContent).toBe("space-between");
    });

    it("logo_height_mm / logo_max_width_pct / text_max_width_pct define the Legacy box", () => {
        const report = clone(v2CompleteBranding);
        const footer = presentationOf(report).footer;
        footer.layout = "SPLIT";
        footer.logo_height_mm = 16;
        footer.logo_max_width_pct = 35;
        footer.text_max_width_pct = 65;
        footer.show_page_number = false;
        report.resolved_resources = { footer_logo_url: "https://cdn.example.invalid/footer.png" };
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

    it("to custom_text with line break renders two lines (address + contact)", () => {
        const report = clone(v2CompleteBranding);
        presentationOf(report).footer.custom_text = "Calle Falsa 123\nTel. 555";
        const { pages } = renderReport(report);
        const band = bandsOf(pages[0] as HTMLElement).footer!;
        const text = Array.from(band.querySelectorAll("div")).find((d) => d.style.whiteSpace === "pre-line");
        expect(text).toBeTruthy();
        expect(text!.textContent).toBe("Calle Falsa 123\nTel. 555");
    });

    it("show_page_number = false does not print numbering (Legacy never printed it)", () => {
        // jsdom does not calculate layout, so it always outputs one page here.
        // The actual count and page breaks are checked in the visual suite
        // (`legacy_v2_parity.visual.spec.ts`, "geometry and pagination").
        // What is verifiable in jsdom is the absence of the label.
        const { text } = renderReport(clone(parityMultipageV2));
        expect(text).not.toMatch(/Página \d+ de \d+/);
    });

    it("show_page_number = true does print it (the label did not disappear for all)", () => {
        const report = clone(parityMultipageV2);
        presentationOf(report).footer.show_page_number = true;
        const { text } = renderReport(report);
        expect(text).toMatch(/Página \d+ de \d+/);
    });
});

// ===========================================================================
// Complete Legacy letterhead
// ===========================================================================

describe("VersionedReportRendererV2 — imported Legacy letterhead", () => {
    it("shows no logo in the header", () => {
        const { pages } = renderReport(parityShortV2);
        expect(bandsOf(pages[0] as HTMLElement).header!.querySelectorAll("img")).toHaveLength(0);
    });

    it("shows the logo in the footer", () => {
        const { pages } = renderReport(parityShortV2);
        expect(bandsOf(pages[0] as HTMLElement).footer!.querySelectorAll("img")).toHaveLength(1);
    });

    it("reproduces the Legacy page box (18mm sides, 28/20mm bands flush)", () => {
        const { pages } = renderReport(parityShortV2);
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

    it("print the four lines of the header at 8pt in bold", () => {
        const { pages } = renderReport(parityShortV2);
        const header = bandsOf(pages[0] as HTMLElement).header!;
        // The band's only child is the institutional block; its children are
        // the four lines.
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

    it("puts the footer in bold and without dividers", () => {
        const { pages } = renderReport(parityShortV2);
        const page = pages[0] as HTMLElement;
        const footer = bandsOf(page).footer!;
        expect(footer.style.fontWeight).toBe("700");
        expect(footer.style.fontSize).toBe("7pt");
        const dividers = Array.from(page.querySelectorAll("div")).filter((d) => d.style.borderTop);
        expect(dividers).toHaveLength(0);
    });

    it("keeps the actual signature block of the report", () => {
        const { text } = renderReport(paritySignedV2);
        // The institutional signer of the letterhead and the actual signature of the
        // report are different things: both must be present.
        expect(text).toContain("Dra. Arisbeth Villanueva Pérez.");
        expect(text).toMatch(/Firma|Firmado/i);
    });

    it("insert the bands in the order header → body → footer", () => {
        // That order is that of Legacy, and it is what determines the flow of
        // PDF content (copy/paste, search, screen readers).
        const { pages } = renderReport(parityShortV2);
        const children = Array.from((pages[0] as HTMLElement).children) as HTMLElement[];
        const roles = children.map((el) => {
            if (el.style.top && el.style.bottom) return "body";
            if (el.style.bottom) return "footer";
            return "header";
        });
        expect(roles).toEqual(["header", "body", "footer"]);
    });
});
