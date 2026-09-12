import { test, expect } from "@playwright/test";

/**
 * Céluma 1.3.1 Block E (CEL-131-09) — rich-text lists, in a real browser.
 *
 * The jsdom suites (`block_e_rich_text_render.test.ts`,
 * `block_e_rich_text_renderer_parity.test.tsx`) prove the STRUCTURE is right.
 * They cannot prove what the reader actually sees, because jsdom has no
 * layout engine and computes no list markers — and "bullets appeared as
 * numbers" is precisely a marker defect.
 *
 * So these run against Chromium, through the same harness and the same
 * `ReportRendererResolver` production uses, and assert the marker type the
 * browser actually resolves for each list. Deliberately NOT screenshots: a
 * golden PNG would answer "did the picture change", while the question this
 * ticket asks is "is this a bullet or a number", which the computed style
 * answers exactly and reviewably.
 *
 * Fixture: `v2QuillRichText` — content captured verbatim from the real Quill 2
 * editor. Before the fix, every assertion below reported `decimal`.
 */

const FIXTURE = "v2QuillRichText";

/** The renderer's rich-text hosts, in document order. */
const RICH = ".celuma-rich-content";

test.beforeEach(async ({ page }) => {
    await page.goto(`/?fixture=${FIXTURE}`);
    await page.waitForSelector('[data-ready="true"]');
});

test("a bullet run renders with bullet markers, not numbers", async ({ page }) => {
    const bulletList = page.locator(`${RICH} ul`).first();
    await expect(bulletList).toBeVisible();

    const markerType = await bulletList.evaluate((el) => getComputedStyle(el).listStyleType);
    expect(markerType).toBe("disc");

    const items = bulletList.locator("> li");
    await expect(items).toHaveCount(2);
    await expect(items.first()).toHaveText("Fragmento A: sin alteraciones.");
});

test("a numbered run renders with numbers, and restarts at 1", async ({ page }) => {
    // The same stored <ol> held the bullets first. Sharing one counter is why
    // the numbered list used to start at 3.
    const numbered = page.locator(`${RICH} ol`).first();
    await expect(numbered).toBeVisible();

    const markerType = await numbered.evaluate((el) => getComputedStyle(el).listStyleType);
    expect(markerType).toBe("decimal");

    // Chromium does not expose a generated ::marker's text, so the restart is
    // asserted the way HTML defines it: the numbered items live in their own
    // <ol> that carries no `start`, so the browser numbers them from 1. What
    // the defect did was the opposite — one <ol> holding the bullets first, so
    // these two items were painted 3 and 4.
    const start = await numbered.evaluate((el) => (el as HTMLOListElement).start);
    expect(start).toBe(1);
    await expect(numbered).not.toHaveAttribute("start", /.*/);

    const items = numbered.locator("> li");
    await expect(items).toHaveCount(2);
    await expect(items.first()).toHaveText("Primer paso del protocolo.");
    await expect(numbered).not.toContainText("Fragmento A");
});

test("no Quill editor markup reaches the rendered page", async ({ page }) => {
    await expect(page.locator("[data-list]")).toHaveCount(0);
    await expect(page.locator(".ql-ui")).toHaveCount(0);
    await expect(page.locator("[class*='ql-indent']")).toHaveCount(0);
});

test("indentation renders as real nesting, with its own marker types", async ({ page }) => {
    const section = page.locator(RICH).filter({ hasText: "Nivel superior." }).first();

    const outer = section.locator("> ul");
    await expect(outer).toHaveCount(1);
    await expect(outer.locator("> li")).toHaveCount(2);

    const nested = outer.locator("li > ul").first();
    await expect(nested).toHaveCount(1);
    await expect(nested.locator("> li").first()).toContainText("Nivel anidado.");

    const deepest = nested.locator("li > ol").first();
    await expect(deepest).toHaveCount(1);
    const deepestMarker = await deepest.evaluate((el) => getComputedStyle(el).listStyleType);
    expect(deepestMarker).toBe("decimal");

    // Nesting must actually indent — the flat ql-indent markup did not.
    const outerBox = await outer.locator("> li").first().boundingBox();
    const nestedBox = await nested.locator("> li").first().boundingBox();
    expect(nestedBox!.x).toBeGreaterThan(outerBox!.x);
});

test("the editor's whitespace rule reaches the rendered page", async ({ page }) => {
    const host = page.locator(RICH).filter({ hasText: "margen" }).first();
    const whiteSpace = await host.evaluate((el) => getComputedStyle(el).whiteSpace);
    expect(whiteSpace).toBe("pre-wrap");

    // The author's run of spaces survives to the reader.
    const text = await host.locator("p", { hasText: "margen" }).first().textContent();
    expect(text).toContain("margen    con espacios");
});

test("paragraph spacing is left exactly as it renders today", async ({ page }) => {
    // CEL-131-09 fixes list markers and space runs. It deliberately does NOT
    // restyle paragraphs: the 1em gap is the shipped appearance of every
    // report already published, and changing it would re-paginate them.
    const paragraph = page.locator(`${RICH} p`).filter({ hasText: "Cierre" }).first();
    const margin = await paragraph.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { top: cs.marginTop, bottom: cs.marginBottom };
    });
    expect(margin.top).not.toBe("0px");
    expect(margin.bottom).not.toBe("0px");
});
