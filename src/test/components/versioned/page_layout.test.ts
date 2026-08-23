/**
 * Pre-Phase-5 final renderer-layout remediation — geometry unit tests.
 *
 * These test the pure function directly (no DOM, no React), so a failure
 * points at the arithmetic rather than at a rendered pixel. The DOM-level
 * counterparts live in versioned_report_renderer_v2_page_layout.test.tsx.
 *
 * The invariant under test, in one line: the configured page margin stays
 * literal, AND body content never overlaps an occupied header/footer band.
 */
import { describe, expect, it } from "vitest";
import {
    resolvePageLayout,
    type PageBandInput,
    type PageLayoutInput,
} from "../../../components/report/versioned/page_layout";

const PAGE_W_MM = 215.9;
const PAGE_H_MM = 279.4;

const NO_BAND: PageBandInput = { enabled: false, heightMm: 0, offsetMm: null, gapMm: 0 };

function layout(overrides: {
    margins?: Partial<PageLayoutInput["margins"]>;
    header?: Partial<PageBandInput>;
    footer?: Partial<PageBandInput>;
}) {
    return resolvePageLayout({
        pageWidthMm: PAGE_W_MM,
        pageHeightMm: PAGE_H_MM,
        margins: { topMm: 15, rightMm: 15, bottomMm: 15, leftMm: 15, ...overrides.margins },
        header: overrides.header ? { ...NO_BAND, enabled: true, ...overrides.header } : NO_BAND,
        footer: overrides.footer ? { ...NO_BAND, enabled: true, ...overrides.footer } : NO_BAND,
    });
}

describe("resolvePageLayout — page margins stay literal", () => {
    it("echoes the configured margins back unchanged, whatever the bands do", () => {
        const l = layout({
            margins: { topMm: 5, rightMm: 15, bottomMm: 40, leftMm: 20 },
            header: { heightMm: 28, gapMm: 0 },
            footer: { heightMm: 20, gapMm: 0 },
        });
        expect(l.pageMargins).toEqual({ topMm: 5, rightMm: 15, bottomMm: 40, leftMm: 20 });
    });

    it("0.5cm (5mm) top margin: the header band's own page-edge inset IS 5mm", () => {
        // §27: with a header present, the PAGE MARGIN is proven by the
        // topmost occupied element's inset — never by bodyTop.
        const l = layout({ margins: { topMm: 5 }, header: { heightMm: 28, gapMm: 3 } });
        expect(l.pageMargins.topMm).toBe(5);
        expect(l.header.topMm).toBe(5);
    });

    it("4cm (40mm) top margin: the header band's own page-edge inset IS 40mm, not 68mm", () => {
        const l = layout({ margins: { topMm: 40 }, header: { heightMm: 28, gapMm: 3 } });
        expect(l.pageMargins.topMm).toBe(40);
        expect(l.header.topMm).toBe(40);
        // The header is NOT double-counted into its own position.
        expect(l.header.bottomMm).toBe(68);
    });

    it("left/right are always the literal margins — no side bands in this model", () => {
        const l = layout({
            margins: { leftMm: 20, rightMm: 15 },
            header: { heightMm: 28 },
            footer: { heightMm: 20 },
        });
        expect(l.body.leftMm).toBe(20);
        expect(l.body.rightMm).toBe(15);
    });
});

describe("resolvePageLayout — header non-overlap (§21)", () => {
    it("small margin + large header: body clears the band instead of overlapping it", () => {
        // The exact regression: 5mm margin, 28mm header. Before this fix
        // bodyTop was 5mm — i.e. inside the header band.
        const l = layout({ margins: { topMm: 5 }, header: { heightMm: 28, gapMm: 3 } });
        expect(l.header.occupied).toBe(true);
        expect(l.header.topMm).toBe(5);
        expect(l.header.bottomMm).toBe(33);
        expect(l.body.topMm).toBe(36); // 33 + 3mm gap
        expect(l.body.topMm).toBeGreaterThanOrEqual(l.header.bottomMm + 3);
        expect(l.body.topMm).not.toBe(5);
    });

    it("large margin + header: body still clears the band, margin still literal", () => {
        const l = layout({ margins: { topMm: 40 }, header: { heightMm: 28, gapMm: 3 } });
        expect(l.pageMargins.topMm).toBe(40);
        expect(l.body.topMm).toBe(71); // 40 + 28 + 3
        expect(l.body.topMm).toBeGreaterThanOrEqual(l.pageMargins.topMm);
    });

    it("margin larger than the whole band: body sits on the margin, never above it", () => {
        // Band pinned at the page edge (Legacy-style) but a generous margin:
        // the margin is the binding constraint, so bodyTop = margin.
        const l = layout({ margins: { topMm: 40 }, header: { heightMm: 10, offsetMm: 0, gapMm: 2 } });
        expect(l.header.bottomMm).toBe(10);
        expect(l.body.topMm).toBe(40); // max(40, 10 + 2)
    });
});

describe("resolvePageLayout — no header (§11, §22)", () => {
    it("header disabled: bodyTop is exactly the page margin", () => {
        const l = layout({ margins: { topMm: 5 } });
        expect(l.header.occupied).toBe(false);
        expect(l.body.topMm).toBe(5);
    });

    it("header enabled but zero height: treated as unoccupied, bodyTop is the margin", () => {
        const l = layout({ margins: { topMm: 5 }, header: { heightMm: 0, gapMm: 4 } });
        expect(l.header.occupied).toBe(false);
        expect(l.body.topMm).toBe(5);
    });
});

describe("resolvePageLayout — footer non-overlap (§23) and no footer (§24)", () => {
    it("small bottom margin + footer: body ends above the band", () => {
        const l = layout({ margins: { bottomMm: 5 }, footer: { heightMm: 20, gapMm: 3 } });
        expect(l.pageMargins.bottomMm).toBe(5);
        expect(l.footer.occupied).toBe(true);
        expect(l.footer.bottomMm).toBe(5);
        expect(l.footer.topMm).toBe(25);
        expect(l.body.bottomMm).toBe(28); // 25 + 3mm gap
        expect(l.body.bottomMm).toBeGreaterThanOrEqual(l.footer.topMm + 3);
    });

    it("no footer: body's bottom inset is exactly the page margin", () => {
        const l = layout({ margins: { bottomMm: 5 } });
        expect(l.footer.occupied).toBe(false);
        expect(l.body.bottomMm).toBe(5);
    });

    it("footer enabled but zero height: unoccupied, bottom inset is the margin", () => {
        const l = layout({ margins: { bottomMm: 5 }, footer: { heightMm: 0, gapMm: 4 } });
        expect(l.body.bottomMm).toBe(5);
    });
});

describe("resolvePageLayout — real header geometry, not a Legacy constant (§25)", () => {
    it("a 40mm header reserves exactly 25mm more than a 15mm header", () => {
        const a = layout({ margins: { topMm: 5 }, header: { heightMm: 15, gapMm: 3 } });
        const b = layout({ margins: { topMm: 5 }, header: { heightMm: 40, gapMm: 3 } });
        expect(a.body.topMm).toBe(23); // 5 + 15 + 3
        expect(b.body.topMm).toBe(48); // 5 + 40 + 3
        expect(b.body.topMm - a.body.topMm).toBe(25); // exactly the height delta
        // Neither equals the Legacy 28mm band, proving no hardcoded constant.
        expect(a.body.topMm).not.toBe(36);
        expect(b.body.topMm).not.toBe(36);
    });

    it("content_gap_mm participates linearly and independently of height", () => {
        const tight = layout({ margins: { topMm: 5 }, header: { heightMm: 20, gapMm: 0 } });
        const loose = layout({ margins: { topMm: 5 }, header: { heightMm: 20, gapMm: 8 } });
        expect(tight.body.topMm).toBe(25);
        expect(loose.body.topMm).toBe(33);
        expect(loose.body.topMm - tight.body.topMm).toBe(8);
    });
});

describe("resolvePageLayout — Legacy vs custom V2 use one layout principle (§26)", () => {
    it("a Legacy-pinned band and an equivalent V2 band produce the same body bounds", () => {
        // Legacy: explicit offset_mm = 0 (band flush at the page edge) with
        // margins that happen to equal the band heights — what the Legacy
        // adapter emits.
        const legacy = layout({
            margins: { topMm: 28, bottomMm: 20 },
            header: { heightMm: 28, offsetMm: 0, gapMm: 0 },
            footer: { heightMm: 20, offsetMm: 0, gapMm: 0 },
        });
        // Custom V2: no explicit offset, so each band defaults to sitting on
        // its margin. With a 0mm margin the resolved geometry is identical.
        const customV2 = layout({
            margins: { topMm: 0, bottomMm: 0 },
            header: { heightMm: 28, offsetMm: null, gapMm: 0 },
            footer: { heightMm: 20, offsetMm: null, gapMm: 0 },
        });
        expect(legacy.header.topMm).toBe(customV2.header.topMm);
        expect(legacy.body.topMm).toBe(customV2.body.topMm);
        expect(legacy.body.bottomMm).toBe(customV2.body.bottomMm);
    });

    it("unedited Legacy geometry is reproduced exactly (28mm/20mm body insets)", () => {
        const l = layout({
            margins: { topMm: 28, rightMm: 18, bottomMm: 20, leftMm: 18 },
            header: { heightMm: 28, offsetMm: 0, gapMm: 0 },
            footer: { heightMm: 20, offsetMm: 0, gapMm: 0 },
        });
        expect(l.header.topMm).toBe(0);
        expect(l.footer.bottomMm).toBe(0);
        expect(l.body.topMm).toBe(28);
        expect(l.body.bottomMm).toBe(20);
        expect(l.body.leftMm).toBe(18);
        expect(l.body.rightMm).toBe(18);
    });
});

describe("resolvePageLayout — invariants and usability (§20)", () => {
    const cases: Array<[string, Parameters<typeof layout>[0]]> = [
        ["no bands", { margins: { topMm: 5, bottomMm: 5 } }],
        ["header only", { margins: { topMm: 5 }, header: { heightMm: 28, gapMm: 3 } }],
        ["footer only", { margins: { bottomMm: 5 }, footer: { heightMm: 20, gapMm: 3 } }],
        ["both bands, tiny margins", {
            margins: { topMm: 5, bottomMm: 5 },
            header: { heightMm: 28, gapMm: 3 },
            footer: { heightMm: 20, gapMm: 3 },
        }],
        ["both bands, large margins", {
            margins: { topMm: 40, bottomMm: 40 },
            header: { heightMm: 28, gapMm: 4 },
            footer: { heightMm: 16, gapMm: 4 },
        }],
        ["Legacy pinned bands", {
            margins: { topMm: 28, bottomMm: 20 },
            header: { heightMm: 28, offsetMm: 0, gapMm: 0 },
            footer: { heightMm: 20, offsetMm: 0, gapMm: 0 },
        }],
    ];

    it.each(cases)("holds every layout invariant: %s", (_name, config) => {
        const l = layout(config);
        expect(l.body.topMm).toBeGreaterThanOrEqual(l.pageMargins.topMm);
        expect(l.body.bottomMm).toBeGreaterThanOrEqual(l.pageMargins.bottomMm);
        if (l.header.occupied) {
            expect(l.body.topMm).toBeGreaterThanOrEqual(l.header.bottomMm);
        }
        if (l.footer.occupied) {
            expect(l.body.bottomMm).toBeGreaterThanOrEqual(l.footer.topMm);
        }
        expect(l.body.topMm).toBeLessThan(PAGE_H_MM - l.body.bottomMm);
        expect(l.usable).toBe(true);
    });

    it("flags a configuration whose bands consume the whole page as unusable", () => {
        const l = layout({
            margins: { topMm: 40, bottomMm: 40 },
            header: { heightMm: 150, gapMm: 4 },
            footer: { heightMm: 150, gapMm: 4 },
        });
        expect(l.usable).toBe(false);
        expect(l.body.availableHeightMm).toBeLessThanOrEqual(0);
    });
});

describe("resolvePageLayout — marginPositioned drives the OUTER margin", () => {
    it("a band without an explicit offset is margin-positioned", () => {
        const l = layout({
            margins: { topMm: 5, bottomMm: 5 },
            header: { heightMm: 28, offsetMm: null },
            footer: { heightMm: 20, offsetMm: null },
        });
        expect(l.header.marginPositioned).toBe(true);
        expect(l.footer.marginPositioned).toBe(true);
    });

    it("a band with an explicit offset (Legacy pin) is NOT margin-positioned", () => {
        const l = layout({
            margins: { topMm: 28, bottomMm: 20 },
            header: { heightMm: 28, offsetMm: 0 },
            footer: { heightMm: 20, offsetMm: 0 },
        });
        expect(l.header.marginPositioned).toBe(false);
        expect(l.footer.marginPositioned).toBe(false);
    });

    it("an explicit non-zero offset also counts as pinned, not margin-positioned", () => {
        const l = layout({ margins: { topMm: 5 }, header: { heightMm: 28, offsetMm: 12 } });
        expect(l.header.marginPositioned).toBe(false);
        expect(l.header.topMm).toBe(12);
    });
});

describe("resolvePageLayout — explicit ZERO is a real margin, never 'missing'", () => {
    it("zero margins put every band on the page edge, and the body right after it", () => {
        const l = layout({
            margins: { topMm: 0, rightMm: 0, bottomMm: 0, leftMm: 0 },
            header: { heightMm: 28, gapMm: 0 },
            footer: { heightMm: 20, gapMm: 0 },
        });
        expect(l.pageMargins).toEqual({ topMm: 0, rightMm: 0, bottomMm: 0, leftMm: 0 });
        expect(l.header.topMm).toBe(0);
        expect(l.footer.bottomMm).toBe(0);
        expect(l.body.leftMm).toBe(0);
        expect(l.body.rightMm).toBe(0);
        // Anti-overlap still reserves the bands (§10 of the brief): a zero
        // PAGE margin does not mean a zero body offset.
        expect(l.body.topMm).toBe(28);
        expect(l.body.bottomMm).toBe(20);
        expect(l.usable).toBe(true);
    });

    it("an explicit offset_mm of 0 is honoured as a position, not read as 'unset'", () => {
        // The classic falsy trap: `offset_mm || margin` would turn this 0
        // into the margin. It must stay a pinned 0.
        const l = layout({ margins: { topMm: 40 }, header: { heightMm: 10, offsetMm: 0, gapMm: 0 } });
        expect(l.header.topMm).toBe(0);
        expect(l.header.marginPositioned).toBe(false);
    });

    it("zero margin with no bands puts the body itself on the page edge", () => {
        const l = layout({ margins: { topMm: 0, bottomMm: 0 } });
        expect(l.body.topMm).toBe(0);
        expect(l.body.bottomMm).toBe(0);
    });

    it("a zero-margin, zero-height-band page is still usable", () => {
        const l = layout({
            margins: { topMm: 0, rightMm: 0, bottomMm: 0, leftMm: 0 },
            header: { heightMm: 0 },
            footer: { heightMm: 0 },
        });
        expect(l.body.availableHeightMm).toBeCloseTo(PAGE_H_MM, 5);
        expect(l.body.availableWidthMm).toBeCloseTo(PAGE_W_MM, 5);
        expect(l.usable).toBe(true);
    });
});
