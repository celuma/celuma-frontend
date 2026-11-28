import { test, expect, type Page } from "@playwright/test";

/**
 * Céluma 1.5 (#95) — LaTeX formulas in Reports V2 rich text, in a real browser.
 *
 * jsdom (`rich_text_formula_95.test.tsx`) proves formulas are redrawn from
 * `data-value`, are atomic for the paginator and carry their stylesheet. Only
 * a layout engine can prove what the reader sees: KaTeX's fonts are loaded
 * before the pages are read, a fraction is stacked, a formula never leaves its
 * text column, an invalid source reads as text, and a paragraph with formulas
 * taller than a page splits without losing, repeating or cutting a formula.
 * Measured values, not screenshots.
 *
 * Fixture: `v2RichTextFormula` (synthetic).
 */

const FIXTURE = "v2RichTextFormula";
const BODY = '#pages-host [data-page-region="body"]';
const RICH = `${BODY} .celuma-rich-content`;

async function open(page: Page) {
    await page.goto(`/?fixture=${FIXTURE}`);
    await page.waitForSelector('#pages-host[data-ready="true"]');
}

test.beforeEach(async ({ page }) => {
    await open(page);
});

test("the renderer is ready with no layout error, and KaTeX's fonts are loaded", async ({ page }) => {
    await expect(page.locator("#pages-host")).not.toHaveAttribute("data-layout-error", /.+/);
    const fonts = await page.evaluate(() => ({
        main: document.fonts.check("1em KaTeX_Main"),
        math: document.fonts.check("italic 1em KaTeX_Math"),
    }));
    expect(fonts).toEqual({ main: true, math: true });
});

test("formulas are drawn from their source, never from the cached editor markup", async ({ page }) => {
    const result = await page.evaluate((selector) => {
        const spans = Array.from(document.querySelectorAll<HTMLElement>(`${selector} span.ql-formula`));
        return {
            count: spans.length,
            drawn: spans.filter((s) => s.querySelector(".katex-html")).length,
            stale: spans.filter((s) => s.textContent?.includes("cache")).length,
        };
    }, RICH);
    expect(result.count).toBeGreaterThan(5);
    expect(result.stale).toBe(0);
    // Every formula but the invalid one is typeset.
    expect(result.drawn).toBe(result.count - 1);
});

test("a fraction is stacked: numerator above the denominator", async ({ page }) => {
    const tops = await page.evaluate((selector) => {
        const frac = document.querySelector(`${selector} [data-probe="ki67"] .mfrac`)!;
        // `\text{…}` runs of the numerator and the denominator.
        const top = (word: string) =>
            Array.from(frac.querySelectorAll<HTMLElement>(".text"))
                .find((s) => s.textContent?.includes(word))!
                .getBoundingClientRect();
        const numerator = top("positivas");
        const denominator = top("totales");
        return { numerator: numerator.bottom, denominator: denominator.top };
    }, RICH);
    expect(tops.numerator).toBeLessThanOrEqual(tops.denominator + 0.5);
});

test("a paragraph holding a fraction grows to fit it without overlapping its neighbours", async ({ page }) => {
    const boxes = await page.evaluate((selector) => {
        const box = (probe: string) => document.querySelector(`${selector} [data-probe="${probe}"]`)!.getBoundingClientRect();
        const ki = box("ki67");
        const plain = box("plain-line");
        const frac = document.querySelector(`${selector} [data-probe="ki67"] .katex`)!.getBoundingClientRect();
        return { ki: { top: ki.top, bottom: ki.bottom, height: ki.height }, plain: { top: plain.top, height: plain.height }, frac: { top: frac.top, bottom: frac.bottom } };
    }, RICH);
    expect(boxes.ki.height).toBeGreaterThan(boxes.plain.height);
    expect(boxes.frac.top).toBeGreaterThanOrEqual(boxes.ki.top - 0.5);
    expect(boxes.frac.bottom).toBeLessThanOrEqual(boxes.ki.bottom + 0.5);
    expect(boxes.plain.top).toBeGreaterThanOrEqual(boxes.ki.bottom - 0.5);
});

test("a long formula wraps between terms and stays inside the text column", async ({ page }) => {
    const result = await page.evaluate((selector) => {
        const host = document.querySelector<HTMLElement>(`${selector} [data-probe="long"]`)!;
        const column = host.getBoundingClientRect();
        // KaTeX's breakable units (`.katex-base` since 0.19, `.base` before).
        const bases = Array.from(host.querySelectorAll<HTMLElement>(".ql-formula .katex-html > :is(.katex-base, .base)"));
        const tops = new Set(bases.map((b) => Math.round(b.getBoundingClientRect().top)));
        const outside = bases.filter((b) => {
            const r = b.getBoundingClientRect();
            return r.left < column.left - 0.5 || r.right > column.right + 0.5;
        }).length;
        return { lines: tops.size, outside };
    }, RICH);
    expect(result.lines).toBeGreaterThan(1);
    expect(result.outside).toBe(0);
});

test("a source KaTeX cannot parse reads as plain text in the report's colour", async ({ page }) => {
    const invalid = await page.evaluate((selector) => {
        const p = document.querySelector<HTMLElement>(`${selector} [data-probe="invalid"]`)!;
        const span = p.querySelector<HTMLElement>(".ql-formula")!;
        return {
            text: span.textContent,
            invalid: span.classList.contains("celuma-formula-invalid"),
            color: getComputedStyle(span).color,
            paragraphColor: getComputedStyle(p).color,
        };
    }, RICH);
    expect(invalid.text).toBe("\\frac{a}{");
    expect(invalid.invalid).toBe(true);
    expect(invalid.color).toBe(invalid.paragraphColor);
});

test("a paragraph with formulas taller than a page splits with every sentence and formula once, uncut", async ({ page }) => {
    const result = await page.evaluate((body) => {
        const bodies = Array.from(document.querySelectorAll<HTMLElement>(body));
        const withText = bodies.filter((b) => b.textContent?.includes("Frase "));
        // Joined across pages: a split may leave "Frase" at the end of one page and its number on the next.
        const text = withText.map((b) => b.textContent ?? "").join(" ");
        const sentences = Array.from(text.matchAll(/Frase\s+(\d{3})/g)).map((m) => Number(m[1]));
        const formulas = withText.flatMap((b) =>
            Array.from(b.querySelectorAll<HTMLElement>("span.ql-formula"))
                .map((s) => s.getAttribute("data-value") ?? "")
                .filter((v) => /^\\frac\{\d+\}\{100\}$/.test(v)),
        );
        const drawn = withText.every((b) =>
            Array.from(b.querySelectorAll<HTMLElement>("span.ql-formula"))
                .filter((s) => !s.classList.contains("celuma-formula-invalid"))
                .every((s) => s.querySelector(".katex-html")),
        );
        const overflow = bodies.map((b) => b.scrollHeight - b.clientHeight);
        return { pages: withText.length, sentences, formulas, drawn, overflow };
    }, BODY);

    expect(result.pages).toBeGreaterThan(1);
    expect(result.sentences).toEqual(Array.from({ length: 120 }, (_, i) => i + 1));
    const expected = Array.from({ length: 20 }, (_, i) => `\\frac{${i * 6 + 1}}{100}`);
    expect(result.formulas).toEqual(expected);
    expect(result.drawn).toBe(true);
    for (const o of result.overflow) expect(o).toBeLessThanOrEqual(0);
});
