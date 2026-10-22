/**
 * DOM-level checks of `VersionedReportRendererV2` composition (Céluma 1.4). jsdom paginates nothing
 * (no layout), so these assert structure that does not depend on it; real geometry for 9/10/12/20
 * figures, repeated bands and per-page signatures is in tests-visual/report_composition.visual.spec.ts.
 */
import { describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { createRef } from "react";
import VersionedReportRendererV2, {
    type VersionedReportRendererV2Ref,
} from "../../../components/report/versioned/versioned_report_renderer_v2";
import { buildCompositionReport, type CompositionScenario } from "../../fixtures/reports/composition_scenarios";

function renderScenario(s: CompositionScenario) {
    cleanup();
    const ref = createRef<VersionedReportRendererV2Ref>();
    render(
        <VersionedReportRendererV2
            report={buildCompositionReport(s)}
            ref={ref}
            signerLookup={[{ id: "00000000-0000-0000-0000-000000000199", name: "Firmante Real V2 de Prueba" }]}
        />,
    );
    return ref.current?.getPages() ?? [];
}

describe("figures", () => {
    for (const n of [9, 10, 12, 20]) {
        it(`${n} figures: each appears exactly once, numbered and captioned in stored order`, () => {
            const pages = renderScenario({ figures: n, mixedAspect: true });
            const cards = pages.flatMap((p) => Array.from(p.querySelectorAll<HTMLElement>("[data-figure]")));
            expect(cards.map((c) => Number(c.dataset.figure))).toEqual(Array.from({ length: n }, (_, i) => i + 1));
            cards.forEach((c, i) => {
                expect(c.textContent).toContain(`Figura ${i + 1}.`);
                expect(c.textContent).toContain(`Corte ${i + 1} sint.`);
            });
        });
    }

    it("rows hold at most three figures and are unbreakable units", () => {
        const pages = renderScenario({ figures: 10 });
        const rows = pages.flatMap((p) => Array.from(p.querySelectorAll<HTMLElement>("[data-figure-row]")));
        expect(rows.map((r) => r.children.length)).toEqual([3, 3, 3, 1]);
        rows.forEach((r) => expect(r.getAttribute("data-page-atomic")).toBe("true"));
    });
});

describe("signature", () => {
    it("is a compact band on every page and no longer a block of the body flow", () => {
        const pages = renderScenario({ figures: 3 });
        pages.forEach((p) => {
            expect(p.querySelectorAll('[data-page-band="signature"]').length).toBe(1);
            const body = p.querySelector('[data-page-region="body"]')!;
            expect(body.textContent).not.toContain("Firmado");
        });
    });

    it("hidden signature section: no band on any page", () => {
        renderScenario({ figures: 3, signature: "hidden" }).forEach((p) =>
            expect(p.querySelector('[data-page-band="signature"]')).toBeNull(),
        );
    });

    it("unsigned draft: a pending line, never an image", () => {
        renderScenario({ figures: 3, signature: "unsigned" }).forEach((p) => {
            const band = p.querySelector('[data-page-band="signature"]')!;
            expect(band.querySelector("img")).toBeNull();
            expect(band.textContent).toContain("Pendiente de firma");
        });
    });
});

describe("repeated fields", () => {
    it("a configuration that leaves no room for the bands falls back to the controlled message", () => {
        cleanup();
        const report = buildCompositionReport({ figures: 1, repeat: ["patient"] });
        const presentation = (report.report.rendering_snapshot as { presentation: { header: { height_mm: number }; footer: { height_mm: number } } }).presentation;
        presentation.header.height_mm = 110;
        presentation.footer.height_mm = 110;
        const { getByTestId } = render(<VersionedReportRendererV2 report={report} />);
        expect(getByTestId("unusable-page-layout")).toBeTruthy();
    });
});
