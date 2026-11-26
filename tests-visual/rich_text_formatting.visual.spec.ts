import { test, expect, type Page } from "@playwright/test";

/**
 * Céluma 1.5 (#60) — author font sizes and sub/superscript, in a real browser.
 *
 * jsdom (`rich_text_formatting_60.test.tsx`) proves the classes and their rules
 * reach every V2 page. Only a layout engine can prove what they DO: the size
 * the reader sees, that a sized run wraps without overlapping, that a raised
 * exponent does not open up its line, and that a formatted paragraph taller
 * than a page is split without losing, repeating or un-sizing any text.
 * Measured values, not screenshots.
 *
 * Fixture: `v2RichTextFormatting` (synthetic).
 */

const FIXTURE = "v2RichTextFormatting";
const BODY = '#pages-host [data-page-region="body"]';
const RICH = `${BODY} .celuma-rich-content`;

/** CSS px for a point size (1 pt = 4/3 px). */
const px = (pt: number) => (pt * 4) / 3;

async function open(page: Page) {
    await page.goto(`/?fixture=${FIXTURE}`);
    await page.waitForSelector('#pages-host[data-ready="true"]');
}

test.beforeEach(async ({ page }) => {
    await open(page);
});

test("the renderer is ready with no layout error", async ({ page }) => {
    await expect(page.locator("#pages-host")).not.toHaveAttribute("data-layout-error", /.+/);
});

test("each chosen size renders at its point size; unsized text stays at 10 pt", async ({ page }) => {
    const sizes = await page.evaluate((selector) => {
        const host = Array.from(document.querySelectorAll<HTMLElement>(selector)).find((h) =>
            h.textContent?.includes("ocho"),
        )!;
        const size = (el: Element | null) => (el ? parseFloat(getComputedStyle(el).fontSize) : NaN);
        const out: Record<string, number> = { normal: size(host.querySelector("p")) };
        for (const pt of [8, 9, 11, 12, 14, 16]) out[pt] = size(host.querySelector(`.ql-size-${pt}pt`));
        out.em = size(host.querySelector("em"));
        return out;
    }, RICH);

    expect(sizes.normal).toBeCloseTo(px(10), 1);
    expect(sizes.em).toBeCloseTo(px(10), 1);
    for (const pt of [8, 9, 11, 12, 14, 16]) {
        expect(sizes[pt], `${pt} pt`).toBeCloseTo(px(pt), 1);
    }
});

test("numbered lists cycle 1. → a. → i. by depth, like the editor", async ({ page }) => {
    const styles = await page.evaluate((selector) => {
        const host = Array.from(document.querySelectorAll<HTMLElement>(selector)).find((h) =>
            h.textContent?.includes("Número uno"),
        )!;
        const style = (text: string) => {
            const li = Array.from(host.querySelectorAll("li")).find((l) => l.firstChild?.textContent?.startsWith(text))!;
            return getComputedStyle(li.parentElement!).listStyleType;
        };
        return [style("Número uno"), style("Letra a"), style("Romano i"), style("Otra vez uno"), style("Número bajo viñeta")];
    }, RICH);
    expect(styles).toEqual(["decimal", "lower-alpha", "lower-roman", "decimal", "lower-alpha"]);
});

test("sub/superscript do not make their line taller", async ({ page }) => {
    const heights = await page.evaluate((selector) => {
        const h = (probe: string) =>
            document.querySelector(`${selector} [data-probe="${probe}"]`)!.getBoundingClientRect().height;
        return { withScripts: h("with-scripts"), withoutScripts: h("without-scripts") };
    }, RICH);
    expect(heights.withScripts).toBeGreaterThan(0);
    expect(Math.abs(heights.withScripts - heights.withoutScripts)).toBeLessThan(0.5);
});

test("a sized run wraps onto further lines without overlapping them", async ({ page }) => {
    const lines = await page.evaluate((selector) => {
        const span = Array.from(document.querySelectorAll(`${selector} .ql-size-16pt`)).find((s) =>
            s.textContent?.startsWith("Un tramo largo"),
        )!;
        // One entry per rendered line: under `pre-wrap` a hanging trailing
        // space adds its own fragment on the same line.
        const byLine = new Map<number, { top: number; bottom: number }>();
        for (const r of Array.from(span.getClientRects())) {
            if (r.width > 0) byLine.set(Math.round(r.top), { top: r.top, bottom: r.bottom });
        }
        return Array.from(byLine.values()).sort((a, b) => a.top - b.top);
    }, RICH);
    expect(lines.length).toBeGreaterThan(1);
    for (let i = 1; i < lines.length; i++) {
        expect(lines[i].top).toBeGreaterThanOrEqual(lines[i - 1].bottom - 0.5);
        // The line pitch follows the sized text (1.5 × 16 pt), not the 10 pt prose.
        expect(lines[i].top - lines[i - 1].top).toBeCloseTo(1.5 * px(16), 0);
    }
});

test("a formatted paragraph taller than a page splits with every sentence once, in order, sizes kept", async ({ page }) => {
    const result = await page.evaluate((body) => {
        const bodies = Array.from(document.querySelectorAll<HTMLElement>(body));
        const pagesWithText = bodies.filter((b) => b.textContent?.includes("Frase "));
        const text = pagesWithText.map((b) => b.textContent ?? "").join(" ");
        const numbers = Array.from(text.matchAll(/Frase (\d{3})/g)).map((m) => Number(m[1]));
        const sizedPerPage = pagesWithText.map(
            (b) => Array.from(b.querySelectorAll(".ql-size-14pt")).filter((s) => s.textContent?.includes("Frase ")).length,
        );
        const sizedFirst = pagesWithText.flatMap((b) =>
            Array.from(b.querySelectorAll(".ql-size-14pt"))
                .map((s) => /Frase (\d{3})/.exec(s.textContent ?? "")?.[1])
                .filter(Boolean),
        );
        const overflow = bodies.map((b) => b.scrollHeight - b.clientHeight);
        return { pages: pagesWithText.length, numbers, sizedPerPage, sizedFirst, overflow };
    }, BODY);

    expect(result.pages).toBeGreaterThan(1);
    expect(result.numbers).toEqual(Array.from({ length: 140 }, (_, i) => i + 1));
    for (const count of result.sizedPerPage) expect(count).toBeGreaterThan(0);
    // Every fifth sentence (001, 006, …) is sized; a split may divide one sized
    // sentence across two pages, which shows its number only once.
    const expectedSized = Array.from({ length: 28 }, (_, i) => String(i * 5 + 1).padStart(3, "0"));
    expect(result.sizedFirst.filter((n) => expectedSized.includes(n!))).toEqual(
        expect.arrayContaining(expectedSized),
    );
    for (const o of result.overflow) expect(o).toBeLessThanOrEqual(0);
});
