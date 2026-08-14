import { expect, test, type Page } from "@playwright/test";

/**
 * Pre-Phase-5 final OUTER-MARGIN remediation — real-browser measurement.
 *
 * The product contract these tests enforce:
 *
 *     physical page top edge  -> highest visible printed header ink  == top margin
 *     lowest visible printed footer ink -> physical page bottom edge == bottom margin
 *
 * NOT `bodyTop`/`bodyBottom` (that is the body SAFE AREA, a different
 * concept — see page_layout.ts), and not the band's invisible box either.
 *
 * Why this file exists as a Playwright spec rather than a vitest one:
 *   - jsdom performs no layout, so ink position cannot be measured there;
 *   - the SCREENSHOT specs cannot resolve this defect either — their
 *     `maxDiffPixelRatio: 0.02` tolerance absorbs a few-millimetre shift of a
 *     small header block, which is exactly how the defect survived the
 *     previous remediation's "28 passed, zero golden churn" run.
 * So the outer margin is asserted numerically, in real Chromium.
 *
 * The defect being guarded: a band is normally TALLER than its content
 * (`height_mm` reserves body clearance). Aligning that content anywhere but
 * against the margin edge leaves the leftover space between the margin and
 * the first ink. Measured before the fix: +6.8mm (Legacy) and +3.0mm
 * (custom V2), constant at every margin value.
 */

const PX_PER_MM = 96 / 25.4;
/** Sub-millimetre: covers the font's half-leading inside the line box. */
const TOL_MM = 0.75;

interface OuterGaps {
    topInkMm: number;
    bottomInkMm: number;
    headerBandTopMm: number;
    footerBandBottomMm: number;
    /**
     * Non-overlap is asserted on INK, not on the bands' boxes.
     *
     * A band's box is invisible and can legitimately extend past its own
     * content: `height_mm` is applied with the default `content-box` sizing,
     * so `padding_mm` sits OUTSIDE it (a Legacy header is a 28mm box plus
     * 4mm of bottom padding = a 32mm box). That trailing padding is empty by
     * definition, so a box-level test reports an "overlap" where nothing is
     * drawn — which is why these compare printed ink instead.
     */
    overlapHeaderBody: boolean;
    overlapBodyFooter: boolean;
    headerInkBottomMm: number;
    footerInkTopMm: number;
    bodyTopMm: number;
    bodyBottomEdgeMm: number;
}

async function measure(page: Page): Promise<OuterGaps> {
    await page.waitForSelector('[data-ready="true"]');
    return page.evaluate((pxPerMm) => {
        const pg = document.querySelectorAll('div[style*="8.5in"]')[0] as HTMLElement;
        const pr = pg.getBoundingClientRect();
        const kids = Array.from(pg.children).filter(
            (el): el is HTMLElement => el instanceof HTMLElement,
        );
        const header = kids.find((el) => el.style.top && !el.style.bottom);
        const footer = kids.find((el) => el.style.bottom && !el.style.top);
        const body = kids.find((el) => el.style.top && el.style.bottom);

        // Real painted ink: text runs (via Range, so the actual glyph box)
        // and images. Not element boxes — a band's box is invisible.
        const ink = (root: HTMLElement | undefined) => {
            const rects: DOMRect[] = [];
            if (!root) return rects;
            const walk = (el: Node) => {
                el.childNodes.forEach((c) => {
                    if (c.nodeType === Node.TEXT_NODE && (c.textContent ?? "").trim()) {
                        const r = document.createRange();
                        r.selectNodeContents(c);
                        const rect = r.getBoundingClientRect();
                        if (rect.height > 0) rects.push(rect);
                    } else if (c.nodeType === Node.ELEMENT_NODE) {
                        const e = c as HTMLElement;
                        if (e.tagName === "IMG") {
                            const rr = e.getBoundingClientRect();
                            if (rr.height > 0) rects.push(rr);
                        }
                        walk(e);
                    }
                });
            };
            walk(root);
            return rects;
        };

        const hInk = ink(header);
        const fInk = ink(footer);
        const hb = header?.getBoundingClientRect();
        const fb = footer?.getBoundingClientRect();
        const bb = body?.getBoundingClientRect();

        const headerInkBottom = hInk.length ? Math.max(...hInk.map((r) => r.bottom)) : -Infinity;
        const footerInkTop = fInk.length ? Math.min(...fInk.map((r) => r.top)) : Infinity;

        return {
            topInkMm: hInk.length ? (Math.min(...hInk.map((r) => r.top)) - pr.top) / pxPerMm : NaN,
            bottomInkMm: fInk.length ? (pr.bottom - Math.max(...fInk.map((r) => r.bottom))) / pxPerMm : NaN,
            headerBandTopMm: hb ? (hb.top - pr.top) / pxPerMm : NaN,
            footerBandBottomMm: fb ? (pr.bottom - fb.bottom) / pxPerMm : NaN,
            // Ink-vs-body-box: the body box is where report content is
            // actually drawn, so header ink must end above it and footer ink
            // must start below it.
            overlapHeaderBody: !!bb && headerInkBottom > bb.top + 0.5,
            overlapBodyFooter: !!bb && footerInkTop < bb.bottom - 0.5,
            headerInkBottomMm: hInk.length ? (headerInkBottom - pr.top) / pxPerMm : NaN,
            footerInkTopMm: fInk.length ? (footerInkTop - pr.top) / pxPerMm : NaN,
            bodyTopMm: bb ? (bb.top - pr.top) / pxPerMm : NaN,
            bodyBottomEdgeMm: bb ? (bb.bottom - pr.top) / pxPerMm : NaN,
        };
    }, PX_PER_MM);
}

/** An imported Legacy letterhead whose margins the user has edited. */
function legacyUrl(marginCm: number) {
    return `/?fixture=parityShortV2&margins=${marginCm},1.8,${marginCm},1.8&clearOffsets=1`;
}
/** A custom V2 letterhead (no Legacy pins at all). */
function customUrl(marginCm: number) {
    return `/?fixture=v2CompleteBranding&margins=${marginCm},1.5,${marginCm},1.5`;
}

for (const [label, urlFor] of [
    ["Legacy imported (margins edited)", legacyUrl],
    ["custom V2", customUrl],
] as const) {
    test.describe(`outer margin — ${label}`, () => {
        // `0` is the strongest possible geometry assertion: at zero there is
        // no margin left to hide a stray offset in, so ANY residual spacing
        // is by definition some other term. It is also a fully supported
        // configured value (MIN_MARGIN_CM = 0), not a degenerate case.
        for (const cm of [0, 0.5, 1.0, 4.0]) {
            const mm = cm * 10;

            test(`${cm}cm -> ${mm}mm from the page edge to the first printed ink`, async ({ page }) => {
                await page.goto(urlFor(cm));
                const m = await measure(page);

                // THE contract: page edge -> visible ink == configured margin.
                expect(m.topInkMm).toBeGreaterThanOrEqual(mm - TOL_MM);
                expect(m.topInkMm).toBeLessThanOrEqual(mm + TOL_MM);
                expect(m.bottomInkMm).toBeGreaterThanOrEqual(mm - TOL_MM);
                expect(m.bottomInkMm).toBeLessThanOrEqual(mm + TOL_MM);

                // The band's own box must sit on the margin too.
                expect(m.headerBandTopMm).toBeCloseTo(mm, 1);
                expect(m.footerBandBottomMm).toBeCloseTo(mm, 1);

                // And the previous remediation's safe area must still hold.
                expect(m.overlapHeaderBody).toBe(false);
                expect(m.overlapBodyFooter).toBe(false);
            });
        }

        test("differential: 0.5cm -> 4cm moves the visible ink by exactly 35mm", async ({ page }) => {
            await page.goto(urlFor(0.5));
            const small = await measure(page);
            await page.goto(urlFor(4.0));
            const large = await measure(page);

            expect(large.topInkMm - small.topInkMm).toBeCloseTo(35, 0);
            expect(large.bottomInkMm - small.bottomInkMm).toBeCloseTo(35, 0);
        });

        test("differential: 0cm -> 4cm moves the visible ink by exactly 40mm", async ({ page }) => {
            await page.goto(urlFor(0));
            const zero = await measure(page);
            await page.goto(urlFor(4.0));
            const large = await measure(page);

            expect(large.topInkMm - zero.topInkMm).toBeCloseTo(40, 0);
            expect(large.bottomInkMm - zero.bottomInkMm).toBeCloseTo(40, 0);
        });

        test("zero margin puts the outermost ink ON the physical page edge", async ({ page }) => {
            // The acceptance test the whole zero-margin exercise exists for:
            // with no margin to absorb it, any renderer-side spacing shows up
            // directly. A multi-millimetre residual here is a defect; only
            // sub-millimetre font leading is tolerable.
            await page.goto(urlFor(0));
            const m = await measure(page);
            expect(Math.abs(m.topInkMm)).toBeLessThanOrEqual(TOL_MM);
            expect(Math.abs(m.bottomInkMm)).toBeLessThanOrEqual(TOL_MM);
            expect(m.headerBandTopMm).toBeCloseTo(0, 1);
            expect(m.footerBandBottomMm).toBeCloseTo(0, 1);
            // Zero margins must not reintroduce either overlap.
            expect(m.overlapHeaderBody).toBe(false);
            expect(m.overlapBodyFooter).toBe(false);
        });
    });
}

test("zero margins on all four sides: every outer boundary sits on the page edge", async ({ page }) => {
    // Left/right are the control: they were already correct, so if top/bottom
    // now match them at zero, the vertical axis has no remaining surplus.
    await page.goto("/?fixture=parityShortV2&margins=0,0,0,0&clearOffsets=1");
    await page.waitForSelector('[data-ready="true"]');
    const sides = await page.evaluate((pxPerMm) => {
        const pg = document.querySelectorAll('div[style*="8.5in"]')[0] as HTMLElement;
        const pr = pg.getBoundingClientRect();
        const rects: DOMRect[] = [];
        const walk = (el: Node) => {
            el.childNodes.forEach((c) => {
                if (c.nodeType === Node.TEXT_NODE && (c.textContent ?? "").trim()) {
                    const r = document.createRange();
                    r.selectNodeContents(c);
                    Array.from(r.getClientRects()).forEach((rc) => rc.height > 0 && rects.push(rc as DOMRect));
                } else if (c.nodeType === Node.ELEMENT_NODE) {
                    const e = c as HTMLElement;
                    const rc = e.getBoundingClientRect();
                    if (e.tagName === "IMG" && rc.height > 0) rects.push(rc);
                    walk(e);
                }
            });
        };
        walk(pg);
        return {
            top: (Math.min(...rects.map((r) => r.top)) - pr.top) / pxPerMm,
            bottom: (pr.bottom - Math.max(...rects.map((r) => r.bottom))) / pxPerMm,
            left: (Math.min(...rects.map((r) => r.left)) - pr.left) / pxPerMm,
            right: (pr.right - Math.max(...rects.map((r) => r.right))) / pxPerMm,
        };
    }, PX_PER_MM);

    for (const [side, value] of Object.entries(sides)) {
        expect(Math.abs(value), `${side} outer gap at margin 0`).toBeLessThanOrEqual(TOL_MM);
    }
});

test("regression: the extra outer gap is gone (it was constant, not margin-proportional)", async ({ page }) => {
    // Before the fix every margin value carried the SAME surplus, because it
    // was the band's leftover height, not anything margin-derived:
    //   Legacy    0.5cm -> 11.8mm | 1cm -> 16.8mm | 4cm -> 46.8mm   (+6.8 each)
    //   custom V2 1.5cm -> 18.0mm                                    (+3.0)
    // Assert the surplus is now within typographic leading at both extremes.
    const surpluses: number[] = [];
    for (const cm of [0.5, 4.0]) {
        await page.goto(legacyUrl(cm));
        const m = await measure(page);
        surpluses.push(m.topInkMm - cm * 10);
    }
    for (const s of surpluses) expect(Math.abs(s)).toBeLessThanOrEqual(TOL_MM);
    // ...and identical at both, proving no margin-dependent drift crept in.
    expect(Math.abs(surpluses[0] - surpluses[1])).toBeLessThanOrEqual(0.3);
});

test("Legacy compatibility: an UNEDITED import keeps its historical pinned geometry", async ({ page }) => {
    // With `offset_mm` still pinned at 0 (never edited), the band reproduces
    // LegacyReportRendererV1: flush against the physical page edge, with the
    // historical internal alignment — deliberately NOT margin-governed.
    await page.goto("/?fixture=parityShortV2");
    const m = await measure(page);
    expect(m.headerBandTopMm).toBeCloseTo(0, 1);
    expect(m.footerBandBottomMm).toBeCloseTo(0, 1);
    expect(m.overlapHeaderBody).toBe(false);
    expect(m.overlapBodyFooter).toBe(false);
});
