import { test, expect, type Page } from "@playwright/test";

/**
 * Céluma 1.5 (#62) — paragraph alignment in the editor and the report, in Chromium.
 *
 * Measured line boxes, not screenshots: a justified paragraph fills every line
 * but its last, left/center/right place short lines where they belong, a
 * justified paragraph split across pages stays justified up to its real end,
 * and in the editor justification applies to the paragraph under the caret or
 * to every paragraph of a selection, can be undone, and survives reopening.
 *
 * The report (fixture `v2RichTextAlignment`) and the editor (harness
 * `rich_text_editor.html?content=alignment`) render the same `ALIGNMENT_HTML`.
 */

type Lines = { align: string; lines: Array<{ left: number; right: number }>; contentLeft: number; contentRight: number };

/** Line boxes (own text, editor markers excluded) of the first element matching `selector`. */
async function linesOf(page: Page, selector: string): Promise<Lines> {
    return page.evaluate((sel) => {
        const block = document.querySelector<HTMLElement>(sel)!;
        const cs = getComputedStyle(block);
        const box = block.getBoundingClientRect();
        const contentLeft = box.left + parseFloat(cs.paddingLeft);
        const contentRight = box.right - parseFloat(cs.paddingRight);
        const byLine = new Map<number, { left: number; right: number }>();
        const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            if (n.parentElement?.closest(".ql-ui")) continue;
            const range = document.createRange();
            range.selectNodeContents(n);
            for (const r of Array.from(range.getClientRects())) {
                if (r.width < 1) continue;
                const key = Math.round(r.top);
                const line = byLine.get(key);
                byLine.set(key, line
                    ? { left: Math.min(line.left, r.left), right: Math.max(line.right, r.right) }
                    : { left: r.left, right: r.right });
            }
        }
        const lines = Array.from(byLine.entries()).sort((a, b) => a[0] - b[0]).map(([, l]) => l);
        return { align: cs.textAlign, lines, contentLeft, contentRight };
    }, selector);
}

let probe = 0;
/** Line boxes of the block (p, h2, li) inside `root` whose text starts with `prefix`. */
async function blockLines(page: Page, root: string, prefix: string): Promise<Lines> {
    const id = `probe-${probe++}`;
    const found = await page.evaluate(
        ([sel, start, mark]) => {
            const block = Array.from(document.querySelectorAll<HTMLElement>(`${sel} p, ${sel} h2, ${sel} li`)).find(
                (el) => (el.textContent ?? "").trim().startsWith(start),
            );
            block?.setAttribute("data-probe", mark);
            return Boolean(block);
        },
        [root, prefix, id] as const,
    );
    expect(found, prefix).toBe(true);
    return linesOf(page, `[data-probe="${id}"]`);
}

/** Every line but the last spans the content box; the last one ends short (natural end) unless `allFull`. */
function expectJustified(block: Lines, allFull = false) {
    expect(block.lines.length).toBeGreaterThan(1);
    const full = allFull ? block.lines : block.lines.slice(0, -1);
    for (const line of full) {
        expect(line.left).toBeCloseTo(block.contentLeft, 0);
        // A trailing space under pre-wrap may hang a few px past the edge.
        expect(Math.abs(line.right - block.contentRight)).toBeLessThan(6);
    }
    if (!allFull) {
        const last = block.lines[block.lines.length - 1];
        expect(block.contentRight - last.right).toBeGreaterThan(20);
    }
}

function expectAlignedShort(block: Lines, align: "left" | "center" | "right") {
    expect(block.lines).toHaveLength(1);
    const { left, right } = block.lines[0];
    if (align === "left") expect(left).toBeCloseTo(block.contentLeft, 0);
    if (align === "right") expect(Math.abs(right - block.contentRight)).toBeLessThan(2);
    if (align === "center") {
        expect(Math.abs((left + right) / 2 - (block.contentLeft + block.contentRight) / 2)).toBeLessThan(2);
    }
}

const EXPECTED_ALIGNMENT: Record<string, string> = {
    "Izquierda corta.": "start",
    "Justificado largo": "justify",
    "Izquierda larga": "start",
    "Centrado corto.": "center",
    "Derecha corta.": "right",
    "Título centrado": "center",
    "Viñeta justificada": "justify",
    "Párrafo final sin alineación.": "start",
};

async function alignments(page: Page, root: string): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    for (const text of Object.keys(EXPECTED_ALIGNMENT)) {
        // Quill's own stylesheet declares `text-align: left` where the report has the initial `start`.
        out[text] = (await blockLines(page, root, text)).align.replace(/^left$/, "start");
    }
    return out;
}

test.describe("report", () => {
    const BODY = '#pages-host [data-page-region="body"]';
    const HOST = `${BODY} .celuma-rich-content`;

    test.beforeEach(async ({ page }) => {
        await page.goto("/?fixture=v2RichTextAlignment");
        await page.waitForSelector('#pages-host[data-ready="true"]');
    });

    test("each block keeps its own alignment; blocks without one stay left-aligned", async ({ page }) => {
        await expect(page.locator("#pages-host")).not.toHaveAttribute("data-layout-error", /.+/);
        expect(await alignments(page, HOST)).toEqual(EXPECTED_ALIGNMENT);
    });

    test("justified text fills every line but the last; left-aligned text does not", async ({ page }) => {
        expectJustified(await blockLines(page, HOST, "Justificado largo"));
        expectJustified(await blockLines(page, HOST, "Viñeta justificada"));
        const left = await blockLines(page, HOST, "Izquierda larga");
        expect(left.lines.length).toBeGreaterThan(1);
        for (const line of left.lines) expect(line.left).toBeCloseTo(left.contentLeft, 0);
        // A ragged right edge: the full lines do not all end at the same x.
        const rights = left.lines.slice(0, -1).map((l) => l.right);
        expect(Math.max(...rights) - Math.min(...rights)).toBeGreaterThan(1);
    });

    test("short lines sit left, centered or right as chosen", async ({ page }) => {
        expectAlignedShort(await blockLines(page, HOST, "Izquierda corta."), "left");
        expectAlignedShort(await blockLines(page, HOST, "Centrado corto."), "center");
        expectAlignedShort(await blockLines(page, HOST, "Derecha corta."), "right");
        expectAlignedShort(await blockLines(page, HOST, "Título centrado"), "center");
    });

    test("a justified paragraph split across pages stays justified up to its real end", async ({ page }) => {
        const fragments = await page.evaluate((body) =>
            Array.from(document.querySelectorAll<HTMLElement>(`${body} .celuma-rich-content p`))
                .filter((p) => p.textContent?.includes("Oración "))
                .map((p, i) => {
                    p.setAttribute("data-fragment", String(i));
                    return { continues: p.hasAttribute("data-text-continues"), text: p.textContent ?? "" };
                }), BODY);
        expect(fragments.length).toBeGreaterThan(1);
        // Every fragment but the last is marked as continuing.
        expect(fragments.map((f) => f.continues)).toEqual(fragments.map((_, i) => i < fragments.length - 1));
        const numbers = Array.from(fragments.map((f) => f.text).join("").matchAll(/Oración (\d{3})/g)).map((m) => Number(m[1]));
        expect(numbers).toEqual(Array.from({ length: 150 }, (_, i) => i + 1));
        for (let i = 0; i < fragments.length; i++) {
            const isLast = i === fragments.length - 1;
            const block = await linesOf(page, `[data-fragment="${i}"]`);
            expect(block.align).toBe("justify");
            if (isLast && block.lines.length === 1) continue;
            // A continuing fragment's last line is justified too; the real last line ends short.
            expectJustified(block, !isLast);
        }
    });
});

test.describe("editor", () => {
    const EDITOR = ".ql-editor";

    test.beforeEach(async ({ page }) => {
        await page.goto("/rich_text_editor.html?content=alignment");
        await page.waitForSelector('[data-ready="true"] .ql-editor p');
    });

    test("shows the same alignment as the report for the same content", async ({ page }) => {
        expect(await alignments(page, EDITOR)).toEqual(EXPECTED_ALIGNMENT);
        expectJustified(await blockLines(page, EDITOR, "Justificado largo"));
    });

    async function chooseAlignment(page: Page, name: string) {
        await page.getByRole("button", { name: "Alineación del párrafo" }).click();
        await page.getByRole("button", { name, exact: true }).click();
    }

    const classOf = (page: Page, prefix: string) =>
        page.evaluate((start) => Array.from(document.querySelectorAll(".ql-editor p")).find(
            (p) => (p.textContent ?? "").startsWith(start),
        )?.className ?? "", prefix);

    test("justifies the paragraph under the caret, shows it as active and can return to the default", async ({ page }) => {
        await page.locator(`${EDITOR} p`, { hasText: "Izquierda corta." }).click();
        await chooseAlignment(page, "Justificar");
        expect(await classOf(page, "Izquierda corta.")).toBe("ql-align-justify");
        await expect(page.locator(".ql-picker.ql-align .ql-picker-label")).toHaveAttribute("data-value", "justify");
        // Neighbours keep their alignment.
        expect(await classOf(page, "Justificado largo")).toBe("ql-align-justify");
        expect(await classOf(page, "Izquierda larga")).toBe("");

        await chooseAlignment(page, "Alinear a la izquierda");
        expect(await classOf(page, "Izquierda corta.")).toBe("");
    });

    test("justifies every paragraph of a selection, only those, and keeps it after reopening", async ({ page }) => {
        // Select from inside "Izquierda larga" down into "Centrado corto." (across the blank line).
        await page.locator(`${EDITOR} p`, { hasText: "Izquierda larga" }).click({ position: { x: 5, y: 5 } });
        await page.locator(`${EDITOR} p`, { hasText: "Centrado corto." }).click({ modifiers: ["Shift"] });
        await chooseAlignment(page, "Justificar");

        expect(await classOf(page, "Izquierda corta.")).toBe("");
        expect(await classOf(page, "Izquierda larga")).toBe("ql-align-justify");
        expect(await classOf(page, "Centrado corto.")).toBe("ql-align-justify");
        expect(await classOf(page, "Derecha corta.")).toBe("ql-align-right");

        const saved = await page.getByTestId("harness-html").textContent();
        expect(saved).toContain('<p class="ql-align-justify">Izquierda larga');
        await page.getByTestId("harness-reopen").click();
        await page.waitForSelector(`${EDITOR} p`);
        expect(await classOf(page, "Izquierda larga")).toBe("ql-align-justify");
        expect(await classOf(page, "Derecha corta.")).toBe("ql-align-right");
        expect(await classOf(page, "Izquierda corta.")).toBe("");
    });

    test("names the alignment control and its options in Spanish", async ({ page }) => {
        await page.getByRole("button", { name: "Alineación del párrafo" }).click();
        for (const name of ["Alinear a la izquierda", "Centrar", "Alinear a la derecha", "Justificar"]) {
            await expect(page.getByRole("button", { name, exact: true })).toHaveAttribute("title", name);
        }
    });
});
