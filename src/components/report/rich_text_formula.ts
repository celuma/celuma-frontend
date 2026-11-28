/**
 * Céluma 1.5 (#95) — mathematical formulas in Reports V2 rich text.
 *
 * # What an author can do
 *
 * In a `richtext` field (report sections and their template defaults) the
 * author inserts a formula written in LaTeX notation — `\frac{a}{b}`,
 * `\sqrt{x}`, `\sum_{i=1}^{n}` — and sees it drawn as mathematics. A formula is
 * notation only: it is never calculated.
 *
 * # How it is stored
 *
 * Quill's formula embed: `<span class="ql-formula" data-value="\frac{a}{b}">`.
 * The **LaTeX source in `data-value` is the only authoritative content.** The
 * editor stores its root's raw HTML, so the span also carries the KaTeX
 * markup the editor drew; that markup is a display cache and every surface
 * ignores it: the editor rebuilds the formula from `data-value` when content
 * is loaded, and the renderers redraw it from `data-value` at render time
 * (`renderFormulasInto`), with the KaTeX version and options of the running
 * application. Stored HTML is never rewritten.
 *
 * # Safety
 *
 * KaTeX is a typesetter, not an evaluator: LaTeX here is parsed into a fixed
 * vocabulary of mathematical symbols and never executed. `trust: false`
 * refuses `\href`, `\url`, `\includegraphics` and `\html*` (no link, image,
 * class or style can come from a formula), and `maxExpand`/`maxSize` bound
 * macro expansion and sizes. A source KaTeX cannot parse is shown as its own
 * text (`celuma-formula-invalid`), readable rather than blank or red, and the
 * editor refuses to insert one.
 *
 * # Layout
 *
 * KaTeX needs its stylesheet and fonts. They are installed once in the
 * document (editor, preview, official PDF route) and travel inside every V2
 * page that holds a formula, because the local print copy clones pages into a
 * bare iframe (as `RICH_TEXT_FORMAT_CSS` does). A rendered formula is atomic
 * for the paginator: it is never split between pages, while KaTeX may still
 * break a long inline formula between lines after a relation or operator.
 * The fonts load lazily, so the renderer paginates again once they are ready
 * and the official render route waits for them (`formulaFontsSettled`).
 */

import katex from "katex";
import katexCss from "katex/dist/katex.min.css?inline";
import { ATOMIC_ATTR } from "./versioned/report_pagination";

/** Quill blot name / format name of a formula. */
export const FORMULA_FORMAT = "formula";
/** Class of the stored formula span (Quill's own). */
export const FORMULA_CLASS = "ql-formula";
/** Class of a formula whose source could not be typeset. */
export const FORMULA_INVALID_CLASS = "celuma-formula-invalid";
/** Longest LaTeX source the editor accepts for one formula. */
export const FORMULA_MAX_LENGTH = 1000;

const KATEX_OPTIONS: katex.KatexOptions = {
    displayMode: false,
    throwOnError: true,
    trust: false,
    strict: "ignore",
    maxSize: 10,
    maxExpand: 200,
    // Visual HTML plus hidden MathML, so screen readers announce the formula.
    output: "htmlAndMathml",
};

export type FormulaRender = { ok: true; html: string } | { ok: false; error: string };

/** Typesets `latex` (inline). Never throws; `ok: false` carries KaTeX's message. */
export function typesetFormula(latex: string): FormulaRender {
    const source = latex.trim();
    if (!source) return { ok: false, error: "empty" };
    try {
        return { ok: true, html: katex.renderToString(source, KATEX_OPTIONS) };
    } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
}

/**
 * Fills `node` (a formula span) with the drawing of `latex`, or with the
 * source as plain text when it cannot be typeset. Marks it atomic for the
 * paginator. Used by the editor's blot and by the renderers.
 */
export function drawFormula(node: HTMLElement, latex: string): void {
    const result = typesetFormula(latex);
    node.classList.toggle(FORMULA_INVALID_CLASS, !result.ok);
    node.setAttribute(ATOMIC_ATTR, "true");
    if (result.ok) {
        node.innerHTML = result.html;
    } else {
        node.textContent = latex;
    }
}

/**
 * Redraws every stored formula under `root` from its `data-value`, discarding
 * whatever markup the editor cached inside the span (and Quill's guard
 * characters). Returns whether anything was redrawn.
 */
export function renderFormulasInto(root: Element): boolean {
    const spans = Array.from(root.querySelectorAll<HTMLElement>(`span.${FORMULA_CLASS}`));
    let changed = false;
    for (const span of spans) {
        const latex = span.getAttribute("data-value");
        if (latex == null) continue;
        span.removeAttribute("contenteditable");
        drawFormula(span, latex);
        changed = true;
    }
    return changed;
}

/** True when stored HTML may hold a formula (cheap pre-check). */
export function mayContainFormula(html: string): boolean {
    return html.includes(FORMULA_CLASS);
}

/**
 * Rules of a rendered formula besides KaTeX's own. The rich-text host keeps
 * the author's whitespace (`pre-wrap`), which must not reach KaTeX's internal
 * markup; an invalid source reads as ordinary text in the report's colour.
 */
const FORMULA_EXTRA_CSS = [
    `.${FORMULA_CLASS} { white-space: normal; }`,
    `.${FORMULA_CLASS}.${FORMULA_INVALID_CLASS} { white-space: pre-wrap; font-family: inherit; color: inherit; }`,
].join("\n");

/** Complete stylesheet for formulas: KaTeX (with its font faces) and ours. */
export const FORMULA_CSS = [katexCss, FORMULA_EXTRA_CSS].join("\n");

/** Marks the `<style>` the renderer puts in a page that holds formulas. */
export const FORMULA_STYLE_ATTR = "data-celuma-formula-css";

const DOCUMENT_STYLE_ID = "celuma-formula-css";

/** Installs the formula stylesheet in the current document once. */
export function ensureFormulaStyles(doc: Document = document): void {
    if (doc.getElementById(DOCUMENT_STYLE_ID)) return;
    const style = doc.createElement("style");
    style.id = DOCUMENT_STYLE_ID;
    style.textContent = FORMULA_CSS;
    doc.head.appendChild(style);
}

/**
 * Font faces a typical formula uses. Loading them explicitly (instead of
 * waiting for the browser to discover them during layout) lets the renderer
 * paginate with the real glyph metrics.
 */
const FORMULA_FONT_FACES = [
    "1em KaTeX_Main",
    "italic 1em KaTeX_Main",
    "bold 1em KaTeX_Main",
    "italic 1em KaTeX_Math",
    "1em KaTeX_AMS",
    "1em KaTeX_Size1",
    "1em KaTeX_Size2",
];

let fontsPromise: Promise<void> | null = null;
let fontsLoaded = false;

/** Whether the formula fonts are already available (always true without a font API). */
export function formulaFontsReady(): boolean {
    return fontsLoaded || typeof document === "undefined" || !("fonts" in document);
}

/** Starts loading the formula fonts (once) and resolves when they settled, loaded or failed. */
export function loadFormulaFonts(): Promise<void> {
    if (formulaFontsReady()) return Promise.resolve();
    if (!fontsPromise) {
        ensureFormulaStyles();
        fontsPromise = Promise.all(FORMULA_FONT_FACES.map((face) => document.fonts.load(face).catch(() => [])))
            .then(() => undefined)
            .finally(() => {
                fontsLoaded = true;
            });
    }
    return fontsPromise;
}

/**
 * Resolves once any formula font load that was started has settled. The
 * official render route and the visual harness wait for it before reading
 * the pages, then let the renderer's repagination commit.
 */
export function formulaFontsSettled(): Promise<void> {
    return fontsPromise ?? Promise.resolve();
}
