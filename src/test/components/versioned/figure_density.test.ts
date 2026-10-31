/**
 * Figure density (Céluma 1.4, #49): the decision logic of `fitCompactFigureSections`, driven by an
 * injected height model. jsdom cannot lay anything out, so the real measured fit (fonts, bands, the
 * official render) is asserted in Chromium by tests-visual/report_composition.visual.spec.ts.
 */
import { describe, expect, it } from "vitest";
import {
    COMPACT_FIGURE_IMAGE_HEIGHT_PX,
    FIGURE_IMAGE_ATTR,
    FIGURE_IMAGE_HEIGHT_PX,
    FIGURE_ROW_ATTR,
    FIGURE_SECTION_ATTR,
    MIN_COMPACT_FIGURE_IMAGE_HEIGHT_PX,
    fitCompactFigureSections,
    initialFigureImageHeightPx,
} from "../../../components/report/versioned/figure_density";
import { SEPARATOR_ATTR } from "../../../components/report/versioned/report_pagination";

const ROW_CHROME = 40;
const HEADING = 30;
const RULE = 25;

function section(figures: number): HTMLElement {
    const root = document.createElement("div");
    const rows: string[] = [];
    for (let n = 0; n < figures; n += 3) {
        const cards = Array.from({ length: Math.min(3, figures - n) }, (_, i) =>
            `<div data-figure="${n + i + 1}"><img ${FIGURE_IMAGE_ATTR}="true" style="height:${initialFigureImageHeightPx(figures)}px"/>`
            + `<div>Figura ${n + i + 1}.</div></div>`).join("");
        rows.push(`<div ${FIGURE_ROW_ATTR}="${n / 3 + 1}">${cards}</div>`);
    }
    root.innerHTML = `<p>texto</p><div ${FIGURE_SECTION_ATTR}="true"><hr ${SEPARATOR_ATTR}="true"/><h3>Imágenes</h3>${rows.join("")}</div>`;
    return root;
}

/** A page body holding `capacity` px: rule, heading and rows cost their modelled heights. */
function probe(capacity: number) {
    const log = { opened: 0, closed: 0, sawRule: false, maxRows: 0 };
    let body: HTMLElement | null = null;
    return {
        log,
        probe: {
            open: () => { log.opened += 1; body = document.createElement("div"); return body; },
            close: () => { log.closed += 1; body = null; },
            fits: (b: HTMLElement) => {
                const rows = Array.from(b.querySelectorAll<HTMLElement>(`[${FIGURE_ROW_ATTR}]`));
                log.sawRule ||= !!b.querySelector("hr");
                log.maxRows = Math.max(log.maxRows, rows.length);
                const used = (b.querySelector("hr") ? RULE : 0) + HEADING + rows.reduce((sum, r) => {
                    const img = r.querySelector<HTMLElement>(`[${FIGURE_IMAGE_ATTR}]`)!;
                    return sum + parseFloat(img.style.height) + ROW_CHROME;
                }, 0);
                return used <= capacity;
            },
        },
    };
}

const heights = (root: HTMLElement) =>
    Array.from(root.querySelectorAll<HTMLElement>(`[${FIGURE_IMAGE_ATTR}]`)).map((img) => img.style.height);

describe("fitCompactFigureSections (#49)", () => {
    it("keeps the 180 px compact area when three rows already fit a fresh page", () => {
        const root = section(9);
        const p = probe(HEADING + 3 * (COMPACT_FIGURE_IMAGE_HEIGHT_PX + ROW_CHROME) + 5);
        fitCompactFigureSections(root, p.probe, SEPARATOR_ATTR);
        const s = root.querySelector<HTMLElement>(`[${FIGURE_SECTION_ATTR}]`)!;
        expect(s.dataset.figureFit).toBe("page");
        expect(s.dataset.figureImageHeight).toBe(String(COMPACT_FIGURE_IMAGE_HEIGHT_PX));
        expect(new Set(heights(root))).toEqual(new Set([`${COMPACT_FIGURE_IMAGE_HEIGHT_PX}px`]));
        expect(p.log).toMatchObject({ opened: 1, closed: 1 });
    });

    it("shrinks to the largest whole-pixel area at which three rows fit, measured without the leading rule", () => {
        const root = section(9);
        // Room for exactly 3 x 163 px images: the measured fit must find 163, not a guessed constant.
        const p = probe(HEADING + 3 * (163 + ROW_CHROME));
        fitCompactFigureSections(root, p.probe, SEPARATOR_ATTR);
        const s = root.querySelector<HTMLElement>(`[${FIGURE_SECTION_ATTR}]`)!;
        expect(s.dataset.figureFit).toBe("page");
        expect(s.dataset.figureImageHeight).toBe("163");
        expect(new Set(heights(root))).toEqual(new Set(["163px"]));
        // The fresh page drops the decorative rule, so the probe never counts it; three rows only.
        expect(p.log.sawRule).toBe(false);
        expect(p.log.maxRows).toBe(3);
        // The source section itself still has its rule (the paginator decides where it goes).
        expect(s.querySelector("hr")).not.toBeNull();
    });

    it("applies the fitted area to every row of a longer section, so each full page holds three rows", () => {
        const root = section(20);
        fitCompactFigureSections(root, probe(HEADING + 3 * (170 + ROW_CHROME)).probe, SEPARATOR_ATTR);
        const all = heights(root);
        expect(all).toHaveLength(20);
        expect(new Set(all)).toEqual(new Set(["170px"]));
    });

    it("below the legibility floor it does not shrink: rows keep 180 px and flow (a physical limit)", () => {
        const root = section(9);
        const p = probe(HEADING + 3 * (MIN_COMPACT_FIGURE_IMAGE_HEIGHT_PX - 1 + ROW_CHROME));
        fitCompactFigureSections(root, p.probe, SEPARATOR_ATTR);
        const s = root.querySelector<HTMLElement>(`[${FIGURE_SECTION_ATTR}]`)!;
        expect(s.dataset.figureFit).toBe("flow");
        expect(new Set(heights(root))).toEqual(new Set([`${COMPACT_FIGURE_IMAGE_HEIGHT_PX}px`]));
        expect(p.log).toMatchObject({ opened: 1, closed: 1 });
    });

    it("leaves one- and two-row sections alone at 200 px, without opening a probe page", () => {
        for (const figures of [1, 3, 4, 6]) {
            const root = section(figures);
            const p = probe(10);
            fitCompactFigureSections(root, p.probe, SEPARATOR_ATTR);
            expect(p.log.opened).toBe(0);
            expect(new Set(heights(root))).toEqual(new Set([`${FIGURE_IMAGE_HEIGHT_PX}px`]));
            expect(root.querySelector<HTMLElement>(`[${FIGURE_SECTION_ATTR}]`)!.dataset.figureFit).toBeUndefined();
        }
    });

    it("closes the probe page even if measuring throws", () => {
        const root = section(9);
        let closed = 0;
        expect(() => fitCompactFigureSections(root, {
            open: () => document.createElement("div"),
            fits: () => { throw new Error("layout failed"); },
            close: () => { closed += 1; },
        }, SEPARATOR_ATTR)).toThrow("layout failed");
        expect(closed).toBe(1);
    });
});
