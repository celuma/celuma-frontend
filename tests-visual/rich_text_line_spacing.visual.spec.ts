import { test, expect, type Page } from "@playwright/test";

/**
 * Céluma 1.5 (#63) — author line spacing, in Chromium.
 *
 * Owner decision (2026-11-25): V2 reports keep the spacing they always had —
 * the 1.5 default line spacing and the existing paragraph spacing — and the
 * author can change the line spacing of a paragraph (1.0, 1.15, 1.5, 2.0).
 * Measured line pitches, not screenshots.
 *
 * The report (fixture `v2RichTextLineSpacing`) and the editor (harness
 * `rich_text_editor.html?content=spacing`) render the same `LINE_SPACING_HTML`.
 */

const REPORT_FONT_PX = (10 * 4) / 3;
const EDITOR_FONT_PX = 14;

type Block = { pitches: number[]; lineHeight: number; marginTop: number; marginBottom: number; height: number };

let probe = 0;
/** Line pitches (distance between consecutive line tops) of the block in `root` starting with `prefix`. */
async function block(page: Page, root: string, prefix: string): Promise<Block> {
    const id = `sp-${probe++}`;
    const result = await page.evaluate(
        ([sel, start, mark]) => {
            const el = Array.from(document.querySelectorAll<HTMLElement>(`${sel} p, ${sel} h2, ${sel} li`)).find((b) =>
                start === "" ? b.textContent === "" : (b.textContent ?? "").trim().startsWith(start),
            );
            if (!el) return null;
            el.setAttribute("data-probe", mark);
            const tops = new Set<number>();
            const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
            for (let n = walker.nextNode(); n; n = walker.nextNode()) {
                if (n.parentElement?.closest(".ql-ui")) continue;
                const range = document.createRange();
                range.selectNodeContents(n);
                for (const r of Array.from(range.getClientRects())) if (r.width > 1) tops.add(Math.round(r.top * 10) / 10);
            }
            const sorted = Array.from(tops).sort((a, b) => a - b).filter((t, i, a) => i === 0 || t - a[i - 1] > 2);
            const cs = getComputedStyle(el);
            return {
                pitches: sorted.slice(1).map((t, i) => t - sorted[i]),
                lineHeight: parseFloat(cs.lineHeight),
                marginTop: parseFloat(cs.marginTop),
                marginBottom: parseFloat(cs.marginBottom),
                height: el.getBoundingClientRect().height,
            };
        },
        [root, prefix, id] as const,
    );
    expect(result, prefix || "blank paragraph").not.toBeNull();
    return result!;
}

function expectPitch(b: Block, px: number) {
    expect(b.pitches.length).toBeGreaterThan(0);
    for (const pitch of b.pitches) expect(pitch).toBeCloseTo(px, 0);
}

test.describe("report", () => {
    const BODY = '#pages-host [data-page-region="body"]';
    const HOST = `${BODY} .celuma-rich-content`;

    test.beforeEach(async ({ page }) => {
        await page.goto("/?fixture=v2RichTextLineSpacing");
        await page.waitForSelector('#pages-host[data-ready="true"]');
    });

    test("each paragraph uses its chosen spacing; without a choice it keeps 1.5", async ({ page }) => {
        await expect(page.locator("#pages-host")).not.toHaveAttribute("data-layout-error", /.+/);
        expectPitch(await block(page, HOST, "Predeterminado"), 1.5 * REPORT_FONT_PX);
        expectPitch(await block(page, HOST, "Sencillo"), 1 * REPORT_FONT_PX);
        expectPitch(await block(page, HOST, "Uno quince"), 1.15 * REPORT_FONT_PX);
        expectPitch(await block(page, HOST, "Doble"), 2 * REPORT_FONT_PX);
        expectPitch(await block(page, HOST, "Viñeta doble"), 2 * REPORT_FONT_PX);
        expectPitch(await block(page, HOST, "Viñeta predeterminada"), 1.5 * REPORT_FONT_PX);
    });

    test("paragraph spacing and blank lines stay exactly as before", async ({ page }) => {
        // The report's paragraph margins (1 em) are unchanged, whatever the line spacing.
        for (const prefix of ["Predeterminado", "Doble", "Párrafo final predeterminado."]) {
            const b = await block(page, HOST, prefix);
            expect(b.marginTop, prefix).toBeCloseTo(REPORT_FONT_PX, 0);
            expect(b.marginBottom, prefix).toBeCloseTo(REPORT_FONT_PX, 0);
        }
        // An intentional blank paragraph is still one empty 1.5 line.
        const blank = await block(page, HOST, "");
        expect(blank.height).toBeCloseTo(1.5 * REPORT_FONT_PX, 0);
    });

    test("larger text in a double-spaced paragraph grows its line without overlapping", async ({ page }) => {
        const b = await block(page, HOST, "Doble con");
        for (const pitch of b.pitches) expect(pitch).toBeGreaterThanOrEqual(2 * REPORT_FONT_PX - 0.5);
    });

    test("double-spaced pages above the signature band: every paragraph once, nothing clipped", async ({ page }) => {
        const result = await page.evaluate((body) => {
            const bodies = Array.from(document.querySelectorAll<HTMLElement>(body));
            const text = bodies.map((b) => b.textContent ?? "").join(" ");
            const numbers = Array.from(text.matchAll(/Párrafo (\d{2}) a doble/g)).map((m) => Number(m[1]));
            const pages = bodies.filter((b) => b.textContent?.includes("a doble espacio")).length;
            const overflow = bodies.map((b) => b.scrollHeight - b.clientHeight);
            return { numbers, pages, overflow };
        }, BODY);
        expect(result.pages).toBeGreaterThan(1);
        expect(result.numbers).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
        for (const o of result.overflow) expect(o).toBeLessThanOrEqual(0);
    });
});

test.describe("editor", () => {
    const EDITOR = ".ql-editor";

    test.beforeEach(async ({ page }) => {
        await page.goto("/rich_text_editor.html?content=spacing");
        await page.waitForSelector('[data-ready="true"] .ql-editor p');
    });

    test("shows each stored spacing; unformatted text keeps the editor's existing spacing", async ({ page }) => {
        expectPitch(await block(page, EDITOR, "Predeterminado"), 1.6 * EDITOR_FONT_PX);
        expectPitch(await block(page, EDITOR, "Sencillo"), 1 * EDITOR_FONT_PX);
        expectPitch(await block(page, EDITOR, "Uno quince"), 1.15 * EDITOR_FONT_PX);
        expectPitch(await block(page, EDITOR, "Doble"), 2 * EDITOR_FONT_PX);
        expectPitch(await block(page, EDITOR, "Viñeta doble"), 2 * EDITOR_FONT_PX);
    });

    async function chooseSpacing(page: Page, label: string) {
        await page.getByRole("button", { name: "Interlineado", exact: true }).click();
        await page.getByRole("button", { name: `Interlineado ${label}`, exact: true }).click();
    }

    const classOf = (page: Page, prefix: string) =>
        page.evaluate((start) => Array.from(document.querySelectorAll(".ql-editor p, .ql-editor li")).find(
            (b) => (b.textContent ?? "").startsWith(start),
        )?.className ?? "", prefix);

    test("changes the spacing of the paragraph under the caret and of a selection, back to 1.5, kept after reopening", async ({ page }) => {
        await page.locator(`${EDITOR} p`, { hasText: /^Predeterminado/ }).click({ position: { x: 5, y: 5 } });
        await chooseSpacing(page, "2.0");
        expect(await classOf(page, "Predeterminado")).toBe("ql-line-height-2");
        await expect(page.locator(".ql-picker.ql-lineheight .ql-picker-label")).toHaveAttribute("data-value", "2");
        expect(await classOf(page, "Sencillo")).toBe("ql-line-height-1");

        await page.locator(`${EDITOR} p`, { hasText: "Sencillo" }).click({ position: { x: 5, y: 5 } });
        await page.locator(`${EDITOR} p`, { hasText: "Uno quince" }).click({ modifiers: ["Shift"] });
        await chooseSpacing(page, "1.5");
        expect(await classOf(page, "Sencillo")).toBe("");
        expect(await classOf(page, "Uno quince")).toBe("");
        expect(await classOf(page, "Doble")).toBe("ql-line-height-2");

        await page.getByTestId("harness-reopen").click();
        await page.waitForSelector(`${EDITOR} p`);
        expect(await classOf(page, "Predeterminado")).toBe("ql-line-height-2");
        expect(await classOf(page, "Sencillo")).toBe("");
        expectPitch(await block(page, EDITOR, "Predeterminado"), 2 * EDITOR_FONT_PX);
    });

    test("names the control and every option in Spanish", async ({ page }) => {
        const control = page.getByRole("button", { name: "Interlineado", exact: true });
        await expect(control).toHaveAttribute("title", "Interlineado");
        await control.click();
        for (const label of ["1.0", "1.15", "1.5", "2.0"]) {
            await expect(page.getByRole("button", { name: `Interlineado ${label}`, exact: true })).toBeVisible();
        }
    });
});
