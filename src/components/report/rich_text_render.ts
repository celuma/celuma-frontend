/**
 * Céluma 1.3.1 Block E (CEL-131-09) — rendering the report editor's rich text
 * outside the editor.
 *
 * # The problem, exactly
 *
 * Report `richtext` sections are authored with Quill 2 (`react-quill-new`,
 * `components/ui/celuma_rich_text.tsx`) and stored as the editor root's raw
 * `innerHTML`. Quill 2 does **not** use `<ul>` for bullet lists. Both list
 * kinds are one `<ol>` whose items carry the kind as an attribute, with an
 * empty `<span class="ql-ui">` where the marker will be drawn:
 *
 * ```html
 * <ol>
 *   <li data-list="bullet"><span class="ql-ui" contenteditable="false"></span>alpha</li>
 *   <li data-list="ordered"><span class="ql-ui" contenteditable="false"></span>uno</li>
 * </ol>
 * ```
 *
 * Inside the editor that renders correctly, because `quill.snow.css` hides the
 * native marker (`.ql-editor li { list-style-type: none }`) and draws the right
 * one into `.ql-ui::before` — a bullet for `bullet`, a CSS counter for
 * `ordered`. Every OTHER surface — the report preview, the official PDF (which
 * is this same React tree rendered by headless Chromium at
 * `/internal/report-render/...`), and the local print copy — renders the markup
 * bare. A bare `<ol>` numbers every child, so **bullets appeared as numbers**,
 * and a bullet run immediately followed by a numbered run shared one counter,
 * so the numbered list did not even start at 1.
 *
 * # The fix, and what it deliberately is not
 *
 * The stored HTML is **correct and unambiguous** — `data-list` distinguishes the
 * two kinds losslessly — so nothing about persistence changes. This module is a
 * pure, render-time transform from Quill's editor markup to the equivalent
 * semantic HTML, applied where the renderers already inject the content:
 *
 * ```html
 * <ul><li>alpha</li></ul><ol><li>uno</li></ol>
 * ```
 *
 * which needs no stylesheet at all, and therefore behaves identically in the
 * preview, the official PDF and the local print clone (which copies renderer
 * DOM into a bare iframe and would drop any document-level CSS).
 *
 * This is the same normalization Quill itself performs in
 * `getSemanticHTML()` — with one deliberate difference: Quill drops the `<br>`
 * from an empty paragraph, collapsing an author's intentional blank line.
 * `<p><br></p>` is preserved here verbatim.
 *
 * # Whitespace
 *
 * `.ql-editor` declares `white-space: pre-wrap`, so runs of spaces the author
 * types are preserved in the editor and were collapsed everywhere else.
 * `RICH_TEXT_CONTENT_CSS` applies that same declaration to the rendering
 * container, and nothing else: paragraph margins, font sizes and every other
 * typographic rule are left exactly as they render today, because those are the
 * shipped appearance of every existing report rather than a defect.
 *
 * Because `pre-wrap` also stops the browser from discarding whitespace-only
 * text nodes BETWEEN block elements, pretty-printed HTML (`</p>\n<p>`) would
 * otherwise gain a blank line it never had. Quill never emits such whitespace,
 * but imported or hand-edited content can, so the transform removes exactly
 * those nodes — source formatting that no surface has ever rendered — and
 * touches no whitespace inside a text-bearing element.
 *
 * # Security
 *
 * This is not a sanitizer and does not pretend to be one. The renderers'
 * `dangerouslySetInnerHTML` boundary is unchanged: the same author-supplied
 * HTML reaches the same sink, and `DOMParser.parseFromString(..., "text/html")`
 * neither executes scripts nor fetches resources. Content with nothing to
 * normalize is returned byte-identically, so no element or attribute can be
 * introduced that the input did not already contain.
 */

/** Class the renderers put on the element that receives rich-text HTML. */
export const RICH_TEXT_CONTENT_CLASS = "celuma-rich-content";

/**
 * The one content rule the renderers need, mirrored from `.ql-editor` in
 * `quill.snow.css` so the editor and every rendering surface agree on
 * whitespace. Deliberately minimal — see the module docstring.
 *
 * Injected INTO each rendered page rather than into the document, because
 * `use_local_print.ts` clones page elements into a bare iframe; a rule living
 * in the app's stylesheet would not survive that copy.
 */
export const RICH_TEXT_CONTENT_CSS = `.${RICH_TEXT_CONTENT_CLASS} { white-space: pre-wrap; }`;

/** Tags whose whitespace-only siblings are source formatting, never content. */
const BLOCK_TAGS = new Set([
    "ADDRESS", "ARTICLE", "ASIDE", "BLOCKQUOTE", "DIV", "DL", "DD", "DT",
    "FIELDSET", "FIGCAPTION", "FIGURE", "FOOTER", "FORM", "H1", "H2", "H3",
    "H4", "H5", "H6", "HEADER", "HR", "LI", "MAIN", "NAV", "OL", "P", "PRE",
    "SECTION", "TABLE", "TBODY", "TD", "TFOOT", "TH", "THEAD", "TR", "UL",
]);

/** Quill's per-item marker placeholder — editor chrome, never content. */
const MARKER_SELECTOR = "span.ql-ui";

/** `class="ql-indent-3"` → 3. Quill expresses nesting depth this way. */
function indentLevelOf(item: Element): number {
    const match = /(?:^|\s)ql-indent-(\d+)(?:\s|$)/.exec(item.getAttribute("class") ?? "");
    return match ? Number(match[1]) : 0;
}

function isWhitespaceOnlyText(node: Node): boolean {
    return node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim() === "";
}

function isBlockElement(node: Node | null): boolean {
    return node != null && node.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has((node as Element).tagName);
}

/**
 * Drops whitespace-only text nodes that sit between block elements (or at the
 * edge of a block container). Those exist only because someone pretty-printed
 * the HTML; no renderer has ever shown them, and under `pre-wrap` they would
 * become visible blank lines.
 */
function stripInterBlockWhitespace(root: Element): boolean {
    let changed = false;
    const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const doomed: Text[] = [];
    let current = walker.nextNode();
    while (current) {
        if (isWhitespaceOnlyText(current)) {
            const before = current.previousSibling;
            const after = current.nextSibling;
            const leftIsBlockBoundary = before === null || isBlockElement(before);
            const rightIsBlockBoundary = after === null || isBlockElement(after);
            // Only when BOTH neighbours are block boundaries: a whitespace node
            // next to inline content (`<b>a</b> <i>b</i>`) is a real space.
            if (leftIsBlockBoundary && rightIsBlockBoundary && (isBlockElement(before) || isBlockElement(after))) {
                doomed.push(current as Text);
            }
        }
        current = walker.nextNode();
    }
    for (const node of doomed) {
        node.remove();
        changed = true;
    }
    return changed;
}

type ListKind = "ul" | "ol";

/** `data-list` value → the semantic list element that renders it natively. */
function kindFor(value: string | null): ListKind {
    // Quill's own kinds are `bullet`, `ordered`, `checked` and `unchecked`.
    // Only `ordered` is a numbered list; the checkbox kinds are bullet-shaped
    // and this toolbar does not offer them, so they fall through to `ul`
    // rather than silently becoming numbers.
    return value === "ordered" ? "ol" : "ul";
}

/**
 * Rebuilds one Quill list container as properly nested `<ul>` / `<ol>`.
 *
 * Quill keeps every item — of every kind and every depth — as a flat child of a
 * single `<ol>`, with depth carried by `ql-indent-N`. This walks that flat run
 * and reconstructs the tree, starting a new sibling list whenever the kind
 * changes at the same depth (so a bullet run followed by a numbered run become
 * two lists, and the numbers restart at 1, exactly as the editor shows them).
 */
function rebuildList(container: Element): Element[] {
    const doc = container.ownerDocument;
    const items = Array.from(container.children).filter((child) => child.tagName === "LI");

    const roots: Element[] = [];
    /** The list open at each depth, and the `<li>` that would own a deeper one. */
    const openLists: Array<{ list: Element; kind: ListKind }> = [];
    const openItems: Element[] = [];

    for (const item of items) {
        // An item may open at most ONE level deeper than what is currently
        // open. Quill never emits a bigger jump; hand-edited HTML that does is
        // clamped rather than dropped.
        const depth = Math.min(indentLevelOf(item), openLists.length);
        const kind = kindFor(item.getAttribute("data-list"));

        // Returning to a shallower depth closes everything below it.
        openLists.length = Math.min(openLists.length, depth + 1);
        openItems.length = Math.min(openItems.length, depth + 1);

        // Start a new list when this depth has none open, or when the kind
        // changes — so a bullet run followed by a numbered run become two
        // sibling lists and the numbering restarts at 1, exactly as the editor
        // shows it. Sharing one container is the defect in miniature.
        const existing = openLists[depth];
        if (!existing || existing.kind !== kind) {
            const list = doc.createElement(kind);
            if (depth === 0) {
                roots.push(list);
            } else {
                openItems[depth - 1].appendChild(list);
            }
            openLists[depth] = { list, kind };
        }

        const li = doc.createElement("li");
        // Carry the item's own content across verbatim, minus the editor's
        // marker placeholder — `data-list` and `ql-indent-N` are now expressed
        // by the structure itself, so they are not copied.
        item.querySelectorAll(MARKER_SELECTOR).forEach((marker) => marker.remove());
        while (item.firstChild) li.appendChild(item.firstChild);
        for (const attr of Array.from(item.attributes)) {
            if (attr.name === "data-list") continue;
            if (attr.name === "class") {
                const kept = attr.value.split(/\s+/).filter((c) => c && !/^ql-indent-\d+$/.test(c)).join(" ");
                if (kept) li.setAttribute("class", kept);
                continue;
            }
            li.setAttribute(attr.name, attr.value);
        }

        openLists[depth].list.appendChild(li);
        openItems[depth] = li;
    }

    return roots;
}

/** True when `container` is a Quill list container rather than an ordinary list. */
function isQuillList(container: Element): boolean {
    return Array.from(container.children).some(
        (child) => child.tagName === "LI" && child.hasAttribute("data-list"),
    );
}

function normalizeLists(root: Element): boolean {
    let changed = false;
    // Live-safe: snapshot first, since each replacement mutates the tree.
    const candidates = Array.from(root.querySelectorAll("ol, ul")).filter(isQuillList);
    for (const container of candidates) {
        const replacements = rebuildList(container);
        container.replaceWith(...replacements);
        changed = true;
    }
    return changed;
}

/**
 * Converts stored rich-text HTML into the semantic HTML the report renderers
 * display. Pure; the stored content is never modified.
 *
 * Returns the input **unchanged, byte for byte** when there is nothing to
 * normalize — which is every report authored before Quill 2's list format and
 * every fixture whose HTML is already semantic — so this cannot alter how an
 * existing report renders.
 */
export function normalizeRichTextForRender(html: string): string {
    if (!html) return html;
    // Cheap bail-out: Quill list markup always carries `data-list`, and only
    // pretty-printed HTML has whitespace between tags.
    if (!html.includes("data-list") && !/>\s+</.test(html)) return html;

    const parsed = new DOMParser().parseFromString(`<div id="celuma-rt">${html}</div>`, "text/html");
    const root = parsed.getElementById("celuma-rt");
    if (!root) return html;

    // Lists first: rebuilding them removes the marker spans that would
    // otherwise look like inline content to the whitespace pass.
    const listsChanged = normalizeLists(root);
    const whitespaceChanged = stripInterBlockWhitespace(root);

    return listsChanged || whitespaceChanged ? root.innerHTML : html;
}
