/**
 * Céluma 1.3.1 Block E (CEL-131-09) — the rich-text rendering contract.
 *
 * Every HTML string below marked "AS STORED" was produced by driving the real
 * Quill 2 editor (`quill@2.0.2`, the exact build `react-quill-new` wraps) and
 * reading `quill.root.innerHTML` — which is verbatim what
 * `celuma_rich_text.tsx`'s `onChange` hands the report editor and what the
 * report envelope persists. They are the reproduction of the defect, not an
 * approximation of it: a bare `<ol>` with `data-list` items numbers bullets.
 *
 * `src/test/components/block_e_rich_text_renderer_parity.test.tsx` then proves
 * the same thing end to end through both report renderers.
 */
import { describe, expect, it } from "vitest";
import {
    RICH_TEXT_CONTENT_CLASS,
    RICH_TEXT_CONTENT_CSS,
    normalizeRichTextForRender,
} from "../../components/report/rich_text_render";

/** Parses a normalized string so structure can be asserted, not string-matched. */
function parse(html: string): HTMLElement {
    const host = document.createElement("div");
    host.innerHTML = html;
    return host;
}

function listKinds(host: HTMLElement): string[] {
    return Array.from(host.children).map((el) => el.tagName.toLowerCase());
}

function itemsOf(list: Element): string[] {
    return Array.from(list.children)
        .filter((c) => c.tagName === "LI")
        .map((li) => {
            // Only this item's own text, not a nested list's.
            const clone = li.cloneNode(true) as Element;
            clone.querySelectorAll("ul, ol").forEach((n) => n.remove());
            return clone.textContent ?? "";
        });
}

// ── 1–4: list creation, both kinds, multiple items ──────────────────────────

describe("CEL-131-09 — bullet lists render as bullets", () => {
    // AS STORED — a two-item bullet list.
    const STORED = '<ol><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span>alpha</li>'
        + '<li data-list="bullet"><span class="ql-ui" contenteditable="false"></span>beta</li></ol>';

    it("the stored markup really is an <ol> — this is the defect, reproduced", () => {
        const asStored = parse(STORED);
        expect(listKinds(asStored)).toEqual(["ol"]);
        // Which is why the preview, the PDF and the print copy numbered them.
    });

    it("renders as a <ul> with both items, in order", () => {
        const host = parse(normalizeRichTextForRender(STORED));
        expect(listKinds(host)).toEqual(["ul"]);
        expect(itemsOf(host.children[0])).toEqual(["alpha", "beta"]);
    });

    it("drops Quill's marker placeholder, which is editor chrome", () => {
        const host = parse(normalizeRichTextForRender(STORED));
        expect(host.querySelector(".ql-ui")).toBeNull();
        expect(host.querySelectorAll("span")).toHaveLength(0);
    });
});

describe("CEL-131-09 — numbered lists keep working", () => {
    const STORED = '<ol><li data-list="ordered"><span class="ql-ui" contenteditable="false"></span>uno</li>'
        + '<li data-list="ordered"><span class="ql-ui" contenteditable="false"></span>dos</li>'
        + '<li data-list="ordered"><span class="ql-ui" contenteditable="false"></span>tres</li></ol>';

    it("renders as an <ol> with every item, in order", () => {
        const host = parse(normalizeRichTextForRender(STORED));
        expect(listKinds(host)).toEqual(["ol"]);
        expect(itemsOf(host.children[0])).toEqual(["uno", "dos", "tres"]);
    });
});

// ── 5–6: switching between kinds ────────────────────────────────────────────

describe("CEL-131-09 — bullet and numbered stay distinct across a switch", () => {
    // AS STORED — the author made two bullets, then switched to numbers.
    // Quill keeps all four in ONE <ol>, so bare rendering numbered them 1-4.
    const STORED = '<ol><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span>alpha</li>'
        + '<li data-list="bullet"><span class="ql-ui" contenteditable="false"></span>beta</li>'
        + '<li data-list="ordered"><span class="ql-ui" contenteditable="false"></span>uno</li>'
        + '<li data-list="ordered"><span class="ql-ui" contenteditable="false"></span>dos</li></ol>';

    it("the stored markup is a single <ol> holding both kinds", () => {
        const asStored = parse(STORED);
        expect(listKinds(asStored)).toEqual(["ol"]);
        expect(asStored.querySelectorAll("li")).toHaveLength(4);
    });

    it("splits into a <ul> then an <ol>, so the numbering restarts at 1", () => {
        const host = parse(normalizeRichTextForRender(STORED));
        expect(listKinds(host)).toEqual(["ul", "ol"]);
        expect(itemsOf(host.children[0])).toEqual(["alpha", "beta"]);
        expect(itemsOf(host.children[1])).toEqual(["uno", "dos"]);
    });

    it("works in the other direction too — numbered then bullet", () => {
        const stored = '<ol><li data-list="ordered">uno</li><li data-list="bullet">alpha</li></ol>';
        const host = parse(normalizeRichTextForRender(stored));
        expect(listKinds(host)).toEqual(["ol", "ul"]);
        expect(itemsOf(host.children[0])).toEqual(["uno"]);
        expect(itemsOf(host.children[1])).toEqual(["alpha"]);
    });

    it("alternates as many times as the author did", () => {
        const stored = '<ol>'
            + '<li data-list="bullet">a</li>'
            + '<li data-list="ordered">1</li>'
            + '<li data-list="bullet">b</li>'
            + '<li data-list="ordered">2</li>'
            + "</ol>";
        const host = parse(normalizeRichTextForRender(stored));
        expect(listKinds(host)).toEqual(["ul", "ol", "ul", "ol"]);
    });
});

// ── 7–8: Enter inside a list, leaving a list ────────────────────────────────

describe("CEL-131-09 — entering and leaving a list", () => {
    // AS STORED — a paragraph, Enter into a list of two, Enter twice to leave,
    // then another paragraph.
    const STORED = "<p>Antes de la lista.</p>"
        + '<ol><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span>primero</li>'
        + '<li data-list="bullet"><span class="ql-ui" contenteditable="false"></span>segundo</li></ol>'
        + "<p>Después de la lista.</p>";

    it("keeps the surrounding paragraphs, in place, around the list", () => {
        const host = parse(normalizeRichTextForRender(STORED));
        expect(listKinds(host)).toEqual(["p", "ul", "p"]);
        expect(host.children[0].textContent).toBe("Antes de la lista.");
        expect(itemsOf(host.children[1])).toEqual(["primero", "segundo"]);
        expect(host.children[2].textContent).toBe("Después de la lista.");
    });
});

// ── Nesting ─────────────────────────────────────────────────────────────────

describe("CEL-131-09 — indentation becomes real nesting", () => {
    // AS STORED — bullet, Tab-indented bullet, Tab again into a numbered item,
    // then back out to the top level. Quill keeps them flat with ql-indent-N,
    // for which no rendering surface has any CSS — so they all rendered at the
    // same level, numbered.
    const STORED = '<ol><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span>top</li>'
        + '<li data-list="bullet" class="ql-indent-1"><span class="ql-ui" contenteditable="false"></span>child</li>'
        + '<li data-list="ordered" class="ql-indent-2"><span class="ql-ui" contenteditable="false"></span>grand</li>'
        + '<li data-list="bullet"><span class="ql-ui" contenteditable="false"></span>back</li></ol>';

    it("reconstructs the tree the author typed", () => {
        const host = parse(normalizeRichTextForRender(STORED));
        expect(listKinds(host)).toEqual(["ul"]);

        const top = host.children[0];
        expect(itemsOf(top)).toEqual(["top", "back"]);

        const childList = top.querySelector("ul");
        expect(childList).toBeTruthy();
        expect(itemsOf(childList!)).toEqual(["child"]);

        const grandList = childList!.querySelector("ol");
        expect(grandList).toBeTruthy();
        expect(itemsOf(grandList!)).toEqual(["grand"]);
    });

    it("leaves no ql-indent class behind — the structure now carries the depth", () => {
        const host = parse(normalizeRichTextForRender(STORED));
        expect(host.querySelector("[class*='ql-indent']")).toBeNull();
        expect(host.querySelector("[data-list]")).toBeNull();
    });

    it("clamps an impossible indent jump instead of dropping the item", () => {
        const stored = '<ol><li data-list="bullet">a</li><li data-list="bullet" class="ql-indent-5">b</li></ol>';
        const host = parse(normalizeRichTextForRender(stored));
        expect(host.textContent).toContain("a");
        expect(host.textContent).toContain("b");
    });
});

// ── Inline formatting inside items ──────────────────────────────────────────

describe("CEL-131-09 — item content survives verbatim", () => {
    it("keeps inline formatting and links inside list items", () => {
        const stored = '<ol><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span>'
            + 'peso <strong>elevado</strong> y <em>difuso</em>, ver <a href="https://ejemplo.invalid">nota</a></li></ol>';
        const host = parse(normalizeRichTextForRender(stored));
        const li = host.querySelector("li")!;
        expect(li.querySelector("strong")?.textContent).toBe("elevado");
        expect(li.querySelector("em")?.textContent).toBe("difuso");
        expect(li.querySelector("a")?.getAttribute("href")).toBe("https://ejemplo.invalid");
    });
});

// ── 9–11: whitespace ────────────────────────────────────────────────────────

describe("CEL-131-09 — whitespace", () => {
    it("the container declares the same white-space rule the editor uses", () => {
        // `.ql-editor { white-space: pre-wrap }` in quill.snow.css. Matching it
        // is the whole of the whitespace fix.
        expect(RICH_TEXT_CONTENT_CSS).toContain("white-space: pre-wrap");
        expect(RICH_TEXT_CONTENT_CSS).toContain(RICH_TEXT_CONTENT_CLASS);
    });

    it("changes nothing else — no margin, font or list rule is smuggled in", () => {
        // Paragraph spacing is the shipped appearance of every existing report.
        // Restyling it here would silently re-paginate published documents.
        expect(RICH_TEXT_CONTENT_CSS).not.toMatch(/margin|padding|font|line-height|list-style/);
    });

    it("preserves a blank paragraph between two paragraphs", () => {
        // AS STORED — Enter pressed twice. Quill's own getSemanticHTML() drops
        // the <br> here and collapses the blank line; this must not.
        const stored = "<p>uno</p><p><br></p><p>dos</p>";
        const out = normalizeRichTextForRender(stored);
        expect(out).toBe(stored);
        expect(parse(out).querySelectorAll("br")).toHaveLength(1);
    });

    it("preserves runs of spaces the author typed", () => {
        const stored = "<p>margen    libre</p>";
        expect(normalizeRichTextForRender(stored)).toBe(stored);
    });

    it("preserves leading and trailing whitespace inside a paragraph", () => {
        const stored = "<p>   sangrado manual   </p>";
        expect(normalizeRichTextForRender(stored)).toBe(stored);
    });

    it("preserves a paragraph that is only whitespace", () => {
        const stored = "<p>uno</p><p>   </p><p>dos</p>";
        expect(normalizeRichTextForRender(stored)).toBe(stored);
    });

    it("removes source formatting between blocks, so pre-wrap adds no blank line", () => {
        // Imported / hand-edited HTML — Quill never emits this. Under
        // `pre-wrap` these newlines would render as blank lines that no
        // surface has ever shown.
        const imported = "<p>uno</p>\n<p>dos</p>\n<p>tres</p>";
        const host = parse(normalizeRichTextForRender(imported));
        expect(listKinds(host)).toEqual(["p", "p", "p"]);
        expect(Array.from(host.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE)).toHaveLength(0);
    });

    it("removes indentation inside an imported list too", () => {
        const imported = "<ul>\n  <li>uno</li>\n  <li>dos</li>\n</ul>";
        const host = parse(normalizeRichTextForRender(imported));
        const ul = host.querySelector("ul")!;
        expect(Array.from(ul.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE)).toHaveLength(0);
        expect(itemsOf(ul)).toEqual(["uno", "dos"]);
    });

    it("never removes a space that separates inline content", () => {
        const stored = "<p><strong>peso</strong> <em>elevado</em></p>";
        expect(normalizeRichTextForRender(stored)).toBe(stored);
        expect(parse(normalizeRichTextForRender(stored)).textContent).toBe("peso elevado");
    });
});

// ── 12–13: round trip ───────────────────────────────────────────────────────

describe("CEL-131-09 — round trip", () => {
    it("is idempotent: normalizing an already-normalized string changes nothing", () => {
        const stored = '<ol><li data-list="bullet">a</li><li data-list="ordered">1</li></ol>';
        const once = normalizeRichTextForRender(stored);
        expect(normalizeRichTextForRender(once)).toBe(once);
    });

    it("does not touch the stored string — the caller's input is unmodified", () => {
        const stored = '<ol><li data-list="bullet">a</li></ol>';
        const copy = String(stored);
        normalizeRichTextForRender(stored);
        expect(stored).toBe(copy);
    });
});

// ── Existing content is untouched ───────────────────────────────────────────

describe("CEL-131-09 — content with nothing to normalize is returned byte-identically", () => {
    const UNTOUCHED = [
        "",
        "<p>Fragmento único de tejido sintético, 1.0 x 0.5 cm.</p>",
        "<p>uno</p><p>dos</p>",
        "<p>Descripción microscópica.</p><ul><li>Fragmento A.</li><li>Fragmento B.</li></ul>",
        "<ol><li>uno</li><li>dos</li></ol>",
        "<p>Acentos: áéíóú, ñ, ü, 50% ± 5°C, § ¶.</p>",
        "<h2>Encabezado</h2><p>Cuerpo <strong>fuerte</strong>.</p>",
    ];

    it.each(UNTOUCHED)("returns %j unchanged", (html) => {
        expect(normalizeRichTextForRender(html)).toBe(html);
    });

    it("an already-semantic <ul>/<ol> pair keeps its own kinds", () => {
        const html = "<ul><li>bullet</li></ul><ol><li>number</li></ol>";
        const host = parse(normalizeRichTextForRender(html));
        expect(listKinds(host)).toEqual(["ul", "ol"]);
    });
});

// ── Security ────────────────────────────────────────────────────────────────

describe("CEL-131-09 — the XSS boundary is unchanged", () => {
    it("is not a sanitizer and does not become one — nothing is stripped", () => {
        // The renderers' `dangerouslySetInnerHTML` boundary is exactly what it
        // was before this block. Asserted so a future reader does not mistake
        // this transform for sanitization, and so tightening the boundary
        // remains a deliberate, separate decision.
        const hostile = '<p onclick="alert(1)">x</p><img src="x" onerror="alert(1)">';
        expect(normalizeRichTextForRender(hostile)).toBe(hostile);
    });

    it("introduces no element or attribute the input did not contain", () => {
        const stored = '<ol><li data-list="bullet" onclick="alert(1)">a</li></ol>';
        const host = parse(normalizeRichTextForRender(stored));
        // The list element changed kind, and `data-list` moved into structure;
        // every OTHER attribute is carried across untouched rather than being
        // silently dropped (which would be sanitization) or extended.
        const li = host.querySelector("li")!;
        expect(li.getAttribute("onclick")).toBe("alert(1)");
        expect(host.querySelectorAll("script")).toHaveLength(0);
        const tags = new Set(Array.from(host.querySelectorAll("*")).map((e) => e.tagName));
        expect([...tags].sort()).toEqual(["LI", "UL"]);
    });

    it("does not execute anything while parsing", () => {
        // DOMParser("text/html") neither runs scripts nor fetches resources.
        const marker = "__celuma_block_e_xss__";
        (window as unknown as Record<string, unknown>)[marker] = false;
        normalizeRichTextForRender(
            `<p>a</p>\n<script>window["${marker}"]=true</script><img src="data:," onerror="window['${marker}']=true">`,
        );
        expect((window as unknown as Record<string, unknown>)[marker]).toBe(false);
    });
});
