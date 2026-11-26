/**
 * Céluma 1.5 — author formatting for Reports V2 rich text (#60).
 *
 * # What an author can choose
 *
 * The report editor (`components/ui/celuma_rich_text.tsx`) lets the author pick
 * a font size for a selection from a fixed list of point sizes, and mark text
 * as subscript or superscript (units and notations such as ×10⁹/L or CO₂).
 * "Normal" is the absence of a size: such text keeps the section's own size,
 * so prose authored before this change renders exactly as it did.
 *
 * # How it is stored
 *
 * Quill stores a size as a class on an inline span — `<span class="ql-size-12pt">`
 * — and sub/superscript as native `<sub>` / `<sup>`. Nothing about persistence
 * changes: section content is still the editor's raw HTML and is never
 * rewritten. A class means nothing outside the editor on its own, so the rules
 * below give it the same meaning on every surface.
 *
 * # One set of rules, two scales
 *
 * The rendered report sets rich text at 10 pt, so `ql-size-12pt` there is
 * literally 12 pt. The editor shows text at 14 px, so the same literal 12 pt
 * would look *smaller* than the surrounding normal text there. Every size rule
 * is therefore written as `N × --celuma-rt-pt`: the report leaves the variable
 * unset and gets real points, the editor sets it to "one report point in editor
 * pixels" (14 px / 10) so sizes keep the same proportions the author will see
 * in the report.
 *
 * The renderer injects these rules into every rendered page (like
 * `RICH_TEXT_CONTENT_CSS`), so the editor preview, the official PDF and the
 * local print copy — which clones pages into a bare iframe — all carry them.
 * The frozen Legacy renderer deliberately does not.
 */

import { RICH_TEXT_CONTENT_CLASS } from "./rich_text_render";

/** Point size of rich-text prose in the V2 report (the "Normal" size). */
export const RICH_TEXT_BASE_SIZE_PT = 10;

/** Sizes an author may choose besides "Normal", in points, smallest first. */
export const RICH_TEXT_SIZES_PT = [8, 9, 11, 12, 14, 16] as const;

/** Quill size value for a point size: `12` → `"12pt"` (class `ql-size-12pt`). */
export function richTextSizeValue(pt: number): string {
    return `${pt}pt`;
}

/** Every Quill size value the editor accepts. Anything else is not a size. */
export const RICH_TEXT_SIZE_VALUES: readonly string[] = RICH_TEXT_SIZES_PT.map(richTextSizeValue);

/**
 * Toolbar picker options: the sizes in order with "Normal" (`false`, Quill's
 * "no size") in its natural place between 9 and 11 pt.
 */
export const RICH_TEXT_SIZE_PICKER: ReadonlyArray<string | false> = [
    ...RICH_TEXT_SIZES_PT.filter((pt) => pt < RICH_TEXT_BASE_SIZE_PT).map(richTextSizeValue),
    false,
    ...RICH_TEXT_SIZES_PT.filter((pt) => pt > RICH_TEXT_BASE_SIZE_PT).map(richTextSizeValue),
];

/**
 * Formats the editor keeps (Quill's `formats` allow-list): exactly what its
 * toolbar can produce. Anything else — typically colours or fonts pasted from
 * another program — is dropped when content enters the editor, so only
 * formatting the report renderers give a meaning to can be stored.
 */
export const RICH_TEXT_EDITOR_FORMATS: string[] = [
    "header", "bold", "italic", "underline", "script", "size", "list", "indent", "link",
];

/** CSS variable holding the length of one report point on a given surface. */
export const RICH_TEXT_POINT_VAR = "--celuma-rt-pt";

/**
 * Format rules for rich text inside `scope`. Sizes scale with
 * `--celuma-rt-pt` (1 pt when unset). Sub/superscript keep `line-height: 0`
 * so a raised or lowered run never makes its line taller than its neighbours,
 * which would otherwise change line spacing and, in the report, pagination.
 */
export function richTextFormatCss(scope: string): string {
    const sizes = RICH_TEXT_SIZES_PT.map(
        (pt) => `${scope} .ql-size-${richTextSizeValue(pt)} { font-size: calc(${pt} * var(${RICH_TEXT_POINT_VAR}, 1pt)); }`,
    );
    return [...sizes, `${scope} sub, ${scope} sup { line-height: 0; }`].join("\n");
}

/**
 * List markers by nesting depth — one scheme for the editor and the report.
 *
 * Numbered: 1. → a. → i. and again from 1. (Quill's own cycle in the editor).
 * Bullets: • → ◦ → ▪ for the third level and deeper (the browser's report
 * default, which the editor now shows too instead of • at every level).
 * Depth counts every enclosing list, bullet or numbered, exactly as Quill's
 * `ql-indent-N` does, so a numbered list under a bullet is numbered a., b.…
 */
export const RICH_TEXT_LIST_DEPTHS = 9;
const ORDERED_STYLES = ["decimal", "lower-alpha", "lower-roman"] as const;
const BULLET_STYLES = ["disc", "circle", "square"] as const;
const BULLET_CHARS = ["\\2022", "\\25E6", "\\25AA"] as const;

/** `list-style-type` for a numbered or bullet list at `depth` (0 = top level). */
export function richTextListStyle(kind: "ordered" | "bullet", depth: number): string {
    return kind === "ordered" ? ORDERED_STYLES[depth % 3] : BULLET_STYLES[Math.min(depth, 2)];
}

/**
 * Rendered (semantic) lists: `normalizeRichTextForRender` turns Quill's flat
 * list into nested `<ol>`/`<ul>`, whose depth is the number of enclosing lists.
 * Each deeper selector is more specific, so the deepest matching rule wins.
 */
function renderedListCss(scope: string): string {
    const rules: string[] = [];
    for (let depth = 0; depth <= RICH_TEXT_LIST_DEPTHS; depth++) {
        const ancestors = ":is(ol, ul) ".repeat(depth);
        rules.push(`${scope} ${ancestors}ol { list-style-type: ${richTextListStyle("ordered", depth)}; }`);
        rules.push(`${scope} ${ancestors}ul { list-style-type: ${richTextListStyle("bullet", depth)}; }`);
    }
    return rules.join("\n");
}

/**
 * Editor lists: Quill draws every marker into `.ql-ui::before` and already
 * cycles numbers by `ql-indent-N`; only the bullets need their level glyph.
 */
export function richTextEditorListCss(scope: string): string {
    const rules: string[] = [];
    for (let depth = 1; depth <= RICH_TEXT_LIST_DEPTHS; depth++) {
        const glyph = BULLET_CHARS[Math.min(depth, 2)];
        rules.push(`${scope} li[data-list="bullet"].ql-indent-${depth} > .ql-ui::before { content: "${glyph}"; }`);
    }
    return rules.join("\n");
}

/** Format rules for the V2 renderer's rich-text hosts (preview, PDF, print). */
export const RICH_TEXT_FORMAT_CSS = [
    richTextFormatCss(`.${RICH_TEXT_CONTENT_CLASS}`),
    renderedListCss(`.${RICH_TEXT_CONTENT_CLASS}`),
].join("\n");
