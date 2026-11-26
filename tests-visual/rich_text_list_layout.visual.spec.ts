import { test, expect, type Page } from "@playwright/test";

/**
 * Céluma 1.5 (#61) — list layout in the editor and the report, in Chromium.
 *
 * Measured, not screenshots: where each item's text starts at every level,
 * whether a wrapped line starts under the item's first word, whether items
 * and adjacent lists add vertical space, and whether a long list crosses pages
 * with every item once, in order, its level and its numbering kept.
 *
 * The editor (harness `rich_text_editor.html`) and the report (fixture
 * `v2RichTextLists`) render the SAME synthetic HTML (`LIST_LAYOUT_HTML`).
 */

/** One indent step: 17 report points. The report is in pt; the editor shows one pt as 1.4 px. */
const REPORT_STEP_PX = (17 * 4) / 3;
const EDITOR_STEP_PX = 17 * 1.4;

type ItemGeometry = { text: string; lefts: number[]; tops: number[]; bottoms: number[] };

/**
 * For each list item in `root` (document order): its own text's line boxes,
 * relative to the content-box left of `root`. Nested lists and the editor's
 * marker placeholder are not part of an item's own text.
 */
async function items(page: Page, rootSelector: string): Promise<{ lineHeight: number; items: ItemGeometry[] }> {
    return page.evaluate((selector) => {
        const root = document.querySelector<HTMLElement>(selector)!;
        const cs = getComputedStyle(root);
        const originX = root.getBoundingClientRect().left + parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth);
        const out = Array.from(root.querySelectorAll("li")).map((li) => {
            const own = Array.from(li.childNodes).find(
                (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim() !== "",
            )!;
            const range = document.createRange();
            range.selectNodeContents(own);
            const byLine = new Map<number, DOMRect>();
            for (const r of Array.from(range.getClientRects())) {
                if (r.width > 1 && !byLine.has(Math.round(r.top))) byLine.set(Math.round(r.top), r);
            }
            const rects = Array.from(byLine.values()).sort((a, b) => a.top - b.top);
            return {
                text: (own.textContent ?? "").trim(),
                lefts: rects.map((r) => r.left - originX),
                tops: rects.map((r) => r.top),
                bottoms: rects.map((r) => r.bottom),
            };
        });
        return { lineHeight: parseFloat(getComputedStyle(root.querySelector("li")!).lineHeight), items: out };
    }, rootSelector);
}

const DEPTH: Record<string, number> = {
    "Elemento corto.": 0, "Elemento largo": 0, "Anidado corto.": 1, "Anidado largo": 1,
    "Tercer nivel.": 2, "Paso uno.": 0, "Paso largo": 0, "Subpaso a.": 1,
};
const depthOf = (text: string) => DEPTH[Object.keys(DEPTH).find((k) => text.startsWith(k))!];

function expectLayout(geometry: { lineHeight: number; items: ItemGeometry[] }, step: number) {
    const list = geometry.items;
    expect(list.map((i) => depthOf(i.text))).toEqual([0, 0, 1, 1, 2, 0, 0, 1]);
    for (const item of list) {
        // Text starts (depth + 1) indent steps in: the top level is indented too.
        expect(item.lefts[0], item.text).toBeCloseTo((depthOf(item.text) + 1) * step, 0);
        // A wrapped line starts under the first word, not under the marker.
        for (const left of item.lefts) expect(left, `${item.text} wrapped line`).toBeCloseTo(item.lefts[0], 0);
    }
    for (const long of list.filter((i) => / largo/.test(i.text))) expect(long.lefts.length).toBeGreaterThan(1);
    // No vertical space between items, levels or the bullet → numbered switch:
    // each item's first line follows the previous item's last line at one line pitch.
    for (let i = 1; i < list.length; i++) {
        const pitch = list[i].tops[0] - list[i - 1].tops[list[i - 1].tops.length - 1];
        expect(pitch, `${list[i - 1].text} → ${list[i].text}`).toBeCloseTo(geometry.lineHeight, 0);
    }
}

test.describe("report", () => {
    const HOST = '#pages-host [data-page-region="body"] .celuma-rich-content';

    test.beforeEach(async ({ page }) => {
        await page.goto("/?fixture=v2RichTextLists");
        await page.waitForSelector('#pages-host[data-ready="true"]');
    });

    test("indents each level one 6 mm step, aligns wrapped lines and adds no space between items", async ({ page }) => {
        await expect(page.locator("#pages-host")).not.toHaveAttribute("data-layout-error", /.+/);
        const first = await page.evaluate((selector) => {
            const hosts = Array.from(document.querySelectorAll<HTMLElement>(selector));
            const index = hosts.findIndex((h) => h.textContent?.includes("Elemento corto."));
            hosts[index].setAttribute("data-probe", "lists");
            return index;
        }, HOST);
        expect(first).toBeGreaterThanOrEqual(0);
        expectLayout(await items(page, `${HOST}[data-probe="lists"]`), REPORT_STEP_PX);
    });

    test("markers hang outside the text with the level's style", async ({ page }) => {
        const styles = await page.evaluate((selector) => {
            const host = Array.from(document.querySelectorAll<HTMLElement>(selector)).find((h) =>
                h.textContent?.includes("Elemento corto."),
            )!;
            return Array.from(host.querySelectorAll("ol, ul")).map((list) => {
                const cs = getComputedStyle(list);
                return `${list.tagName}:${cs.listStyleType}:${cs.listStylePosition}:${cs.marginTop}:${cs.marginBottom}`;
            });
        }, HOST);
        expect(styles).toEqual([
            "UL:disc:outside:0px:0px",
            "UL:circle:outside:0px:0px",
            "UL:square:outside:0px:0px",
            "OL:decimal:outside:0px:0px",
            "OL:lower-alpha:outside:0px:0px",
        ]);
    });

    test("a list crossing pages keeps every item once, in order, with its level and numbering", async ({ page }) => {
        const result = await page.evaluate((body) => {
            const bodies = Array.from(document.querySelectorAll<HTMLElement>(body)).filter((b) =>
                b.textContent?.includes("Viñeta "),
            );
            const allBodies = Array.from(document.querySelectorAll<HTMLElement>(body)).filter((b) =>
                /Viñeta |Paso \d{3}/.test(b.textContent ?? ""),
            );
            const text = allBodies.map((b) => b.textContent ?? "").join(" ");
            const bullets = Array.from(text.matchAll(/Viñeta (\d{3})/g)).map((m) => Number(m[1]));
            const steps = Array.from(text.matchAll(/Paso (\d{3})/g)).map((m) => Number(m[1]));
            // Each numbered item must be painted with its own number: an <ol>'s
            // `start` plus the item's position (a continuation chunk, painted
            // without a marker, does not count).
            const numbering: Array<[number, number]> = [];
            for (const b of allBodies) {
                for (const ol of Array.from(b.querySelectorAll<HTMLOListElement>("ol"))) {
                    let n = ol.start;
                    for (const li of Array.from(ol.children) as HTMLElement[]) {
                        const m = /^Paso (\d{3})/.exec(li.textContent ?? "");
                        if (getComputedStyle(li).listStyleType === "none") continue;
                        if (m) numbering.push([n, Number(m[1])]);
                        n += 1;
                    }
                }
            }
            // On every page, each bullet item still carries its level's marker.
            const levels = bodies.flatMap((b) =>
                Array.from(b.querySelectorAll("li"))
                    .filter((li) => /^Viñeta \d{3}/.test(li.firstChild?.textContent ?? ""))
                    .map((li) => {
                        const n = Number(/Viñeta (\d{3})/.exec(li.firstChild!.textContent!)![1]);
                        return [n, getComputedStyle(li.parentElement!).listStyleType] as [number, string];
                    }),
            );
            const overflow = allBodies.map((b) => b.scrollHeight - b.clientHeight);
            return { pages: bodies.length, bullets, steps, numbering, levels, overflow };
        }, '#pages-host [data-page-region="body"]');

        expect(result.pages).toBeGreaterThan(1);
        expect(result.bullets).toEqual(Array.from({ length: 80 }, (_, i) => i + 1));
        expect(result.steps).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
        for (const [painted, written] of result.numbering) expect(painted, `Paso ${written}`).toBe(written);
        const expectedStyle = ["disc", "circle", "square", "circle"];
        for (const [n, style] of result.levels) expect(style, `Viñeta ${n}`).toBe(expectedStyle[(n - 1) % 4]);
        for (const o of result.overflow) expect(o).toBeLessThanOrEqual(0);
    });
});

test.describe("editor", () => {
    test("uses the same indent steps, wrapped-line alignment and spacing as the report", async ({ page }) => {
        await page.goto("/rich_text_editor.html?content=lists");
        await page.waitForSelector('[data-ready="true"] .ql-editor li');
        expectLayout(await items(page, ".ql-editor"), EDITOR_STEP_PX);
    });

    test("draws the level's bullet glyph, right-aligned against the text", async ({ page }) => {
        await page.goto("/rich_text_editor.html?content=lists");
        await page.waitForSelector('[data-ready="true"] .ql-editor li');
        const markers = await page.evaluate(() =>
            Array.from(document.querySelectorAll(".ql-editor li")).map((li) => {
                const before = getComputedStyle(li.querySelector(".ql-ui")!, "::before");
                return `${before.content}|${before.textAlign}`;
            }),
        );
        expect(markers.slice(0, 5)).toEqual([
            '"•"|right', '"•"|right', '"◦"|right', '"◦"|right', '"▪"|right',
        ]);
    });
});
