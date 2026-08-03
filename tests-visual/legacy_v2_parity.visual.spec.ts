import { test, expect } from "@playwright/test";

/**
 * The five cases required by §15. They are declared here rather than
 * imported from `src/test/fixtures/reports/legacy_v2_parity.ts` because that
 * module imports the Legacy logo bitmap: Vite resolves it inside the harness,
 * but the Playwright runner (Node, without Vite) cannot. `legacy_v2_parity.ts`
 * exports the same list for the harness, and this
 * `LEGACY_V2_PARITY_CASE_KEYS` must remain synchronized — any mismatch makes
 * `page.goto` fail with "Unknown fixture".
 */
const LEGACY_V2_PARITY_CASES = [
    { key: "short", description: "short report without images" },
    { key: "sections", description: "report with multiple sections" },
    { key: "images", description: "report with images" },
    { key: "signed", description: "signed report" },
    { key: "multipage", description: "multipage report" },
] as const;

/**
 * Fourth post-Phase 2 remediation — Legacy ↔ V2 VISUAL PARITY (§15 and §16
 * of the brief).
 *
 * This suite does not verify that a `.cell` imports correctly, that fields
 * exist, or that both render "something similar." It renders the SAME
 * clinical content twice —
 *
 *     LegacyReportRendererV1
 *     VersionedReportRendererV2 + imported Legacy letterhead
 *
 * — and compares measured geometry and real pixels.
 *
 * Contract with existing goldens:
 *   - Does NOT touch `report_renderer_legacy.visual.spec.ts` or its 7 snapshots.
 *   - Does NOT touch the 5 historical V2 snapshots.
 *   - Its own baselines use the `parity-` prefix and are NEW; they never
 *     replace an existing one.
 *
 * Residual differences are documented in legacy-dom-parity-report.md with
 * their pixel count and reason. See legacy_v2_pdf_parity.visual.spec.ts for
 * PDF comparison.
 */

/**
 * EXACT tolerance, deliberately. This remediation is not intended to make
 * the result "look very similar": the ambassador client must perceive no
 * unrequested visual change. `threshold: 0` even disables Playwright's
 * default per-pixel tolerance (0.2), so these tests pass only if both
 * screenshots are bit-for-bit identical.
 *
 * If it ever needs relaxing, the residual difference must be measured and
 * justified in legacy-dom-parity-report.md — never silently increased just
 * to make CI green again.
 */
const MAX_DIFF_PIXEL_RATIO = 0;
const PER_PIXEL_THRESHOLD = 0;

interface PageGeometry {
    pageCount: number;
    pageWidth: number;
    pageHeight: number;
    bodyTop: number;
    bodyLeft: number;
    bodyWidth: number;
    bodyClientHeight: number;
    headerTop: number;
    headerHeight: number;
    footerBottomFromPage: number;
    footerHeight: number;
    text: string;
    perPageTextLengths: number[];
}

/**
 * Measures actual geometry of rendered pages. It is deliberately independent
 * of each renderer's internal DOM: it locates bands by position (absolute
 * child pinned to top/bottom) rather than classes or IDs, which Legacy and V2
 * do not share.
 *
 * Pages are located by `width: 8.5in`, how BOTH renderers create them.
 * `#pages-host > div` does not work: it returns the component wrapper (which
 * also contains the hidden pagination source), making every comparison pass
 * through trivial equality.
 */
async function readGeometry(page: import("@playwright/test").Page): Promise<PageGeometry> {
    return page.evaluate(() => {
        const host = document.getElementById("pages-host")!;
        const pages = Array.from(document.querySelectorAll<HTMLElement>("#pages-host div")).filter(
            (el) => el.style.width === "8.5in",
        );
        const first = pages[0];
        const firstRect = first.getBoundingClientRect();

        const children = Array.from(first.children).filter((el): el is HTMLElement => el instanceof HTMLElement);
        // The body is the only child with `overflow: hidden` and explicit px
        // height; bands are declared in mm.
        const body = children.find((el) => el.style.overflow === "hidden" && el.style.height.endsWith("px"))!;
        const bodyRect = body.getBoundingClientRect();
        const bands = children.filter((el) => el !== body);
        const header = bands.find((el) => el.style.top !== "" && el.style.bottom === "");
        const footer = bands.find((el) => el.style.bottom !== "" && el.style.top === "");

        const round = (n: number) => Math.round(n * 100) / 100;

        return {
            pageCount: pages.length,
            pageWidth: round(firstRect.width),
            pageHeight: round(firstRect.height),
            bodyTop: round(bodyRect.top - firstRect.top),
            bodyLeft: round(bodyRect.left - firstRect.left),
            bodyWidth: round(bodyRect.width),
            bodyClientHeight: body.clientHeight,
            headerTop: header ? round(header.getBoundingClientRect().top - firstRect.top) : -1,
            headerHeight: header ? round(header.getBoundingClientRect().height) : -1,
            footerBottomFromPage: footer
                ? round(firstRect.bottom - footer.getBoundingClientRect().bottom)
                : -1,
            footerHeight: footer ? round(footer.getBoundingClientRect().height) : -1,
            text: (host.innerText || "").replace(/\s+/g, " ").trim(),
            perPageTextLengths: pages.map((p) => (p.innerText || "").replace(/\s+/g, " ").trim().length),
        };
    });
}

for (const { key, description } of LEGACY_V2_PARITY_CASES) {
    const capitalized = key.charAt(0).toUpperCase() + key.slice(1);
    const legacyFixture = `parity${capitalized}Legacy`;
    const v2Fixture = `parity${capitalized}V2`;

    test(`Legacy ↔ V2 parity — ${description}: geometry and pagination`, async ({ page }) => {
        await page.goto(`/?fixture=${legacyFixture}`);
        await page.waitForSelector('[data-ready="true"]');
        const legacy = await readGeometry(page);

        await page.goto(`/?fixture=${v2Fixture}`);
        await page.waitForSelector('[data-ready="true"]');
        const v2 = await readGeometry(page);

        // Physical dimensions and content-area margins.
        expect(v2.pageWidth).toBe(legacy.pageWidth);
        expect(v2.pageHeight).toBe(legacy.pageHeight);
        expect(v2.bodyLeft).toBe(legacy.bodyLeft);
        expect(v2.bodyWidth).toBe(legacy.bodyWidth);
        // Band height and separation from the body. This is the criterion
        // that failed before connecting `height_mm`/`offset_mm`.
        expect(v2.headerTop).toBe(legacy.headerTop);
        expect(v2.headerHeight).toBe(legacy.headerHeight);
        expect(v2.footerBottomFromPage).toBe(legacy.footerBottomFromPage);
        expect(v2.footerHeight).toBe(legacy.footerHeight);
        // Pageable area: if it differs by even 1px, page breaks can diverge
        // in long reports.
        expect(v2.bodyTop).toBe(legacy.bodyTop);
        expect(v2.bodyClientHeight).toBe(legacy.bodyClientHeight);
        // Pagination: same page count and text distribution.
        expect(v2.pageCount).toBe(legacy.pageCount);
        expect(v2.perPageTextLengths).toEqual(legacy.perPageTextLengths);
    });

    test(`Legacy ↔ V2 parity — ${description}: pixels (V2 against case Legacy golden)`, async ({ page }) => {
        // First, establish the baseline from Legacy...
        await page.goto(`/?fixture=${legacyFixture}`);
        await page.waitForSelector('[data-ready="true"]');
        await expect(page.locator("#pages-host")).toHaveScreenshot(`parity-${key}-legacy.png`, {
            maxDiffPixelRatio: 0,
            threshold: PER_PIXEL_THRESHOLD,
        });

        // ...then compare V2 AGAINST THAT SAME image. It is not a V2-specific
        // golden: if V2 deviates from Legacy, this fails.
        await page.goto(`/?fixture=${v2Fixture}`);
        await page.waitForSelector('[data-ready="true"]');
        await expect(page.locator("#pages-host")).toHaveScreenshot(`parity-${key}-legacy.png`, {
            maxDiffPixelRatio: MAX_DIFF_PIXEL_RATIO,
            threshold: PER_PIXEL_THRESHOLD,
        });
    });
}

// The header contained two reported differences (reserved logo box and
// neutral icon). An explicit DOM assertion, in addition to the pixel check,
// records the cause if it ever reappears.
test("Legacy ↔ V2 parity — V2 header with Legacy letterhead contains no image", async ({ page }) => {
    await page.goto("/?fixture=parityShortV2");
    await page.waitForSelector('[data-ready="true"]');
    const headerImages = await page.evaluate(() => {
        const first = Array.from(document.querySelectorAll<HTMLElement>("#pages-host div")).filter(
            (el) => el.style.width === "8.5in",
        )[0];
        const children = Array.from(first.children).filter((el): el is HTMLElement => el instanceof HTMLElement);
        const header = children.find((el) => el.style.top !== "" && el.style.bottom === "");
        return header ? header.querySelectorAll("img").length : -1;
    });
    expect(headerImages).toBe(0);
});

test("Legacy ↔ V2 parity — V2 footer with Legacy letterhead contains the logo", async ({ page }) => {
    await page.goto("/?fixture=parityShortV2");
    await page.waitForSelector('[data-ready="true"]');
    const footerImages = await page.evaluate(() => {
        const first = Array.from(document.querySelectorAll<HTMLElement>("#pages-host div")).filter(
            (el) => el.style.width === "8.5in",
        )[0];
        const children = Array.from(first.children).filter((el): el is HTMLElement => el instanceof HTMLElement);
        const footer = children.find((el) => el.style.bottom !== "" && el.style.top === "");
        return footer ? footer.querySelectorAll("img").length : -1;
    });
    expect(footerImages).toBe(1);
});

// Legacy never printed page numbers; the Legacy letterhead must reproduce
// that absence.
test("Legacy ↔ V2 parity — Legacy letterhead does not print page numbering", async ({ page }) => {
    await page.goto("/?fixture=parityMultipageV2");
    await page.waitForSelector('[data-ready="true"]');
    const text = await page.locator("#pages-host").innerText();
    expect(text).not.toMatch(/Página \d+ de \d+/);
});
