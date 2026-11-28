import { useCallback, useEffect, useRef, useState } from "react";
import ReactQuill, { Quill } from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";
import { tokens } from "../design/tokens";
import {
    RICH_TEXT_BASE_SIZE_PT,
    RICH_TEXT_EDITOR_FORMATS,
    RICH_TEXT_LINE_HEIGHTS,
    RICH_TEXT_LINE_HEIGHT_CLASS,
    RICH_TEXT_LINE_HEIGHT_FORMAT,
    RICH_TEXT_LINE_HEIGHT_VALUES,
    RICH_TEXT_POINT_VAR,
    RICH_TEXT_SIZES_PT,
    RICH_TEXT_SIZE_PICKER,
    RICH_TEXT_SIZE_VALUES,
    richTextEditorListCss,
    richTextFormatCss,
    richTextSizeValue,
} from "../report/rich_text_formats";
import { FORMULA_CLASS, FORMULA_FORMAT, drawFormula, ensureFormulaStyles } from "../report/rich_text_formula";
import FormulaDialog from "./formula_dialog";
import type { SpellingFieldOptions } from "../spelling/spelling_context";
import { useQuillSpelling } from "../spelling/quill_spelling";
import { SpellingSummary } from "../spelling/spelling_summary";

type Props = {
    value: string;
    /** `source` is Quill's: "user" for edits, "api"/"silent" for programmatic changes. */
    onChange: (html: string, source?: string) => void;
    readOnly?: boolean;
    placeholder?: string;
    /** Quill modules (toolbar config…). Defaults to a Céluma-friendly rich toolbar. */
    modules?: Record<string, unknown>;
    /**
     * Formats the editor keeps (Quill's `formats` allow-list). Anything else —
     * typically colours or fonts pasted from another program — is dropped, so
     * only formatting the report renderers support can be stored.
     */
    formats?: string[];
    /** Min height of the editor area. */
    minHeight?: number;
    /**
     * Opt-in local spelling assistance (report authoring only, Céluma 1.4 #29).
     * Requires an enclosing SpellingProvider; other screens pass nothing and
     * keep the editor exactly as before.
     */
    spelling?: SpellingFieldOptions;
};

/*
 * Céluma 1.5 (#60): font sizes are point sizes from a fixed list, stored as
 * `ql-size-<N>pt` classes. Quill's size format is global, so its allow-list is
 * replaced once here; the stock small/large/huge values are no longer sizes.
 */
const SizeClass = Quill.import("attributors/class/size") as { whitelist: string[] | undefined };
SizeClass.whitelist = [...RICH_TEXT_SIZE_VALUES];
Quill.register(SizeClass as never, true);

/*
 * Céluma 1.5 (#63): line spacing per paragraph. Quill has no such format, so a
 * block-scoped class attributor is registered: `ql-line-height-115` on the
 * paragraph, heading or list item; the 1.5 default stores nothing.
 */
const Parchment = Quill.import("parchment") as {
    ClassAttributor: new (attrName: string, keyName: string, options: { scope: number; whitelist: string[] }) => unknown;
    Scope: { BLOCK: number };
};
const LineHeightClass = new Parchment.ClassAttributor(RICH_TEXT_LINE_HEIGHT_FORMAT, RICH_TEXT_LINE_HEIGHT_CLASS, {
    scope: Parchment.Scope.BLOCK,
    whitelist: RICH_TEXT_LINE_HEIGHT_VALUES,
});
Quill.register(LineHeightClass as never, true);

/*
 * Céluma 1.5 (#95): formulas. Quill's own formula blot draws through a global
 * `window.katex` with its own options; this one uses the bundled KaTeX through
 * `drawFormula`, so the editor, the preview, the PDF and the print copy share
 * one set of safe options. The LaTeX source in `data-value` is the value.
 */
type EmbedStatic = {
    new (...args: never[]): { value(): Record<string, unknown> };
    create(value: unknown): Node;
};
const Embed = Quill.import("blots/embed") as unknown as EmbedStatic;
class CelumaFormulaBlot extends Embed {
    static blotName = FORMULA_FORMAT;
    static className = FORMULA_CLASS;
    static tagName = "SPAN";
    static create(value: unknown): Node {
        const node = super.create(value) as HTMLElement;
        if (typeof value === "string") {
            drawFormula(node, value);
            node.setAttribute("data-value", value);
        }
        return node;
    }
    static value(node: HTMLElement): string | null {
        return node.getAttribute("data-value");
    }
    html(): string {
        const latex = String(this.value()[FORMULA_FORMAT] ?? "");
        const escaped = latex.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        return `<span>${escaped}</span>`;
    }
}
Quill.register(`formats/${FORMULA_FORMAT}`, CelumaFormulaBlot as never, true);

/** Event the toolbar's formula button sends to its editor (modules stay static for ReactQuill). */
const FORMULA_REQUEST_EVENT = "celuma-formula-request";

/** One report point in editor pixels: the editor shows 10 pt prose at 14 px. */
const EDITOR_FONT_PX = 14;
const EDITOR_POINT_PX = EDITOR_FONT_PX / RICH_TEXT_BASE_SIZE_PT;

/** `.ql-picker-label` and `.ql-picker-item` of a picker option, for its text. */
function pickerOption(picker: string, value: string | null): string {
    const attr = value == null ? ":not([data-value])" : `[data-value="${value}"]`;
    const base = `.celuma-quill .ql-snow .ql-picker.ql-${picker}`;
    return `${base} .ql-picker-label${attr}::before, ${base} .ql-picker-item${attr}::before`;
}

/**
 * Spanish option names for the toolbar pickers (quill.snow.css ships them in
 * English). The size picker names "no size" by the size it renders at (10 pt)
 * and lists every option in the toolbar's own type size, so the list reads as
 * plain choices rather than a preview.
 */
const PICKER_CSS = [
    `${pickerOption("header", null)} { content: "Normal"; }`,
    ...[1, 2, 3].map((level) => `${pickerOption("header", String(level))} { content: "Título ${level}"; }`),
    `${pickerOption("size", null)} { content: "${RICH_TEXT_BASE_SIZE_PT} pt"; }`,
    ...RICH_TEXT_SIZES_PT.map((pt) => `${pickerOption("size", richTextSizeValue(pt))} { content: "${pt} pt"; }`),
    ...RICH_TEXT_LINE_HEIGHTS.map(
        (o) => `${pickerOption(RICH_TEXT_LINE_HEIGHT_FORMAT, o.value || null)} { content: "${o.label}"; }`,
    ),
    // The closed picker shows a spacing glyph before the value so it reads as line spacing.
    `.celuma-quill .ql-snow .ql-picker.ql-${RICH_TEXT_LINE_HEIGHT_FORMAT} { width: 72px; }`,
    `.celuma-quill .ql-snow .ql-picker.ql-${RICH_TEXT_LINE_HEIGHT_FORMAT} .ql-picker-label { padding-left: 22px; }`,
    `.celuma-quill .ql-snow .ql-picker.ql-${RICH_TEXT_LINE_HEIGHT_FORMAT} .celuma-line-spacing-glyph { position: absolute; left: 7px; top: 50%; transform: translateY(-50%); font-size: 13px; line-height: 1; }`,
].join("\n");

/**
 * Spanish names for the toolbar buttons Quill leaves unnamed: shown as a
 * tooltip on hover (`title`) and announced by screen readers (`aria-label`).
 */
const TOOLBAR_BUTTON_NAMES: ReadonlyArray<[selector: string, name: string]> = [
    ["button.ql-bold", "Negrita"],
    ["button.ql-italic", "Cursiva"],
    ["button.ql-underline", "Subrayado"],
    ['button.ql-script[value="sub"]', "Subíndice"],
    ['button.ql-script[value="super"]', "Superíndice"],
    ["button.ql-formula", "Fórmula"],
    ['button.ql-list[value="ordered"]', "Lista numerada"],
    ['button.ql-list[value="bullet"]', "Lista con viñetas"],
    ["button.ql-link", "Insertar enlace"],
    ["button.ql-clean", "Quitar formato"],
];

function labelToolbar(toolbar: HTMLElement | null | undefined) {
    if (!toolbar) return;
    const name = (el: Element | null, text: string) => {
        if (!el) return;
        el.setAttribute("aria-label", text);
        el.setAttribute("title", text);
    };
    for (const [selector, text] of TOOLBAR_BUTTON_NAMES) name(toolbar.querySelector(selector), text);
    name(toolbar.querySelector(".ql-picker.ql-header .ql-picker-label"), "Estilo de párrafo");
    toolbar.querySelectorAll(".ql-picker.ql-header .ql-picker-item").forEach((item) => {
        const value = item.getAttribute("data-value");
        item.setAttribute("aria-label", value ? `Título ${value}` : "Normal");
    });
    name(toolbar.querySelector(".ql-picker.ql-size .ql-picker-label"), "Tamaño de letra");
    toolbar.querySelectorAll(".ql-picker.ql-size .ql-picker-item").forEach((item) => {
        const value = item.getAttribute("data-value");
        item.setAttribute("aria-label", value ? value.replace(/pt$/, " pt") : `${RICH_TEXT_BASE_SIZE_PT} pt`);
    });
    // Céluma 1.5 (#62): alignment of the paragraph(s) under the caret or selection.
    name(toolbar.querySelector(".ql-picker.ql-align .ql-picker-label"), "Alineación del párrafo");
    toolbar.querySelectorAll(".ql-picker.ql-align .ql-picker-item").forEach((item) => {
        name(item, ALIGN_NAMES[item.getAttribute("data-value") ?? ""] ?? ALIGN_NAMES[""]);
    });
    // Céluma 1.5 (#63): line spacing of the paragraph(s) under the caret or selection.
    const spacing = toolbar.querySelector(`.ql-picker.ql-${RICH_TEXT_LINE_HEIGHT_FORMAT} .ql-picker-label`);
    name(spacing, "Interlineado");
    if (spacing && !spacing.querySelector(".celuma-line-spacing-glyph")) {
        const glyph = document.createElement("span");
        glyph.className = "celuma-line-spacing-glyph";
        glyph.setAttribute("aria-hidden", "true");
        glyph.textContent = "↕";
        spacing.prepend(glyph);
    }
    toolbar.querySelectorAll(`.ql-picker.ql-${RICH_TEXT_LINE_HEIGHT_FORMAT} .ql-picker-item`).forEach((item) => {
        const value = item.getAttribute("data-value");
        const option = RICH_TEXT_LINE_HEIGHTS.find((o) => (o.value || null) === value);
        name(item, `Interlineado ${option?.label ?? ""}`.trim());
    });
}

const ALIGN_NAMES: Record<string, string> = {
    "": "Alinear a la izquierda",
    center: "Centrar",
    right: "Alinear a la derecha",
    justify: "Justificar",
};

const DEFAULT_MODULES = {
    toolbar: {
        container: [
            [
                { header: [1, 2, 3, false] },
                { size: [...RICH_TEXT_SIZE_PICKER] },
                { [RICH_TEXT_LINE_HEIGHT_FORMAT]: RICH_TEXT_LINE_HEIGHTS.map((o) => o.value) },
            ],
            ["bold", "italic", "underline"],
            [{ script: "sub" }, { script: "super" }, FORMULA_FORMAT],
            [{ align: [] }],
            [{ list: "ordered" }, { list: "bullet" }],
            ["link"],
            ["clean"],
        ],
        handlers: {
            // Céluma 1.5 (#95): opens the editor's formula dialog instead of Quill's tooltip.
            [FORMULA_FORMAT](this: { quill: { container: HTMLElement } }) {
                this.quill.container.dispatchEvent(new CustomEvent(FORMULA_REQUEST_EVENT));
            },
        },
    },
};

type FormulaTarget = { index: number; length: number; value: string; editing: boolean };

type QuillLike = ReturnType<ReactQuill["getEditor"]>;

/** The formula the selection covers exactly, if any (keyboard path to editing one). */
function selectedFormula(quill: QuillLike, index: number, length: number): string | null {
    if (length !== 1) return null;
    const op = quill.getContents(index, 1).ops[0];
    const insert = op?.insert as Record<string, unknown> | string | undefined;
    if (insert && typeof insert === "object" && typeof insert[FORMULA_FORMAT] === "string") {
        return insert[FORMULA_FORMAT] as string;
    }
    return null;
}

/**
 * CelumaRichText — ReactQuill (snow) re-skinned to the Céluma language so the
 * rich-text editor stops looking like raw Quill: 2px neutral outline that turns
 * teal on focus with a soft ring, a rounded tinted toolbar whose buttons light up
 * teal on hover/active, brand typography and a comfortable editor area. 100%
 * reusable wherever rich text is edited (report sections, templates, …).
 */
export default function CelumaRichText({
    value,
    onChange,
    readOnly = false,
    placeholder,
    modules = DEFAULT_MODULES,
    formats = RICH_TEXT_EDITOR_FORMATS,
    minHeight = 140,
    spelling,
}: Props) {
    const quillRef = useRef<ReactQuill | null>(null);
    const wrapperRef = useRef<HTMLDivElement | null>(null);
    const getQuill = useCallback(() => {
        try {
            return quillRef.current?.getEditor() ?? null;
        } catch {
            return null;
        }
    }, []);
    const assist = useQuillSpelling({ spelling, getQuill, wrapperRef, readOnly });
    useEffect(() => {
        labelToolbar(wrapperRef.current?.querySelector<HTMLElement>(".ql-toolbar"));
    }, [modules]);

    // Céluma 1.5 (#95): insert a formula from the toolbar, or edit one by clicking it (or by
    // selecting exactly that formula and pressing the toolbar button).
    const [formulaTarget, setFormulaTarget] = useState<FormulaTarget | null>(null);
    // A new dialog per opening, so it never shows what a previous opening left behind.
    const [formulaOpening, setFormulaOpening] = useState(0);
    useEffect(() => {
        if (formats.includes(FORMULA_FORMAT)) ensureFormulaStyles();
    }, [formats]);
    useEffect(() => {
        const quill = getQuill();
        if (!quill || readOnly) return;
        const onRequest = () => {
            const range = quill.getSelection(true) ?? { index: quill.getLength() - 1, length: 0 };
            const existing = selectedFormula(quill, range.index, range.length);
            setFormulaOpening((n) => n + 1);
            setFormulaTarget({ index: range.index, length: range.length, value: existing ?? "", editing: existing != null });
        };
        const onClick = (event: MouseEvent) => {
            const node = (event.target as HTMLElement | null)?.closest?.(`.${FORMULA_CLASS}`);
            if (!node || !quill.root.contains(node)) return;
            const blot = Quill.find(node);
            if (!blot || blot instanceof Quill) return;
            const index = quill.getIndex(blot as never);
            const value = node.getAttribute("data-value") ?? "";
            quill.setSelection(index, 1, "user");
            setFormulaOpening((n) => n + 1);
            setFormulaTarget({ index, length: 1, value, editing: true });
        };
        quill.container.addEventListener(FORMULA_REQUEST_EVENT, onRequest);
        quill.root.addEventListener("click", onClick);
        return () => {
            quill.container.removeEventListener(FORMULA_REQUEST_EVENT, onRequest);
            quill.root.removeEventListener("click", onClick);
        };
    // `modules`/`formats`: ReactQuill builds a new Quill when they change; listen on the current one.
    }, [getQuill, readOnly, modules, formats]);

    const closeFormula = () => {
        setFormulaTarget(null);
        getQuill()?.focus();
    };
    const confirmFormula = (latex: string) => {
        const quill = getQuill();
        const target = formulaTarget;
        setFormulaTarget(null);
        if (!quill || !target) return;
        if (target.length > 0) quill.deleteText(target.index, target.length, "user");
        quill.insertEmbed(target.index, FORMULA_FORMAT, latex, "user");
        quill.setSelection(target.index + 1, 0, "user");
    };
    const formulaDialog = (
        <FormulaDialog
            key={formulaOpening}
            open={formulaTarget != null}
            initialValue={formulaTarget?.value ?? ""}
            editing={formulaTarget?.editing ?? false}
            onConfirm={confirmFormula}
            onCancel={closeFormula}
        />
    );
    const editor = (
        <div className="celuma-quill" ref={wrapperRef} style={spelling ? { position: "relative" } : undefined}>
            <style>{`
                .celuma-quill { border-radius: 12px; }
                .celuma-quill .ql-toolbar.ql-snow {
                    border: 2px solid #e5e7eb;
                    border-bottom: 1px solid #eef1f0;
                    border-radius: 12px 12px 0 0;
                    background: #fafbfc;
                    padding: 8px 10px;
                    font-family: ${tokens.textFont};
                }
                .celuma-quill .ql-container.ql-snow {
                    border: 2px solid #e5e7eb;
                    border-top: none;
                    border-radius: 0 0 12px 12px;
                    font-family: ${tokens.textFont};
                    font-size: 14px;
                    background: #fff;
                }
                .celuma-quill:focus-within .ql-toolbar.ql-snow,
                .celuma-quill:focus-within .ql-container.ql-snow {
                    border-color: ${tokens.primary};
                }
                .celuma-quill:focus-within { box-shadow: 0 0 0 4px ${tokens.primary}1a; }
                .celuma-quill .ql-editor {
                    min-height: ${minHeight}px;
                    color: ${tokens.textPrimary};
                    line-height: 1.6;
                    ${RICH_TEXT_POINT_VAR}: ${EDITOR_POINT_PX}px;
                }
                ${richTextFormatCss(".celuma-quill .ql-editor")}
                ${richTextEditorListCss(".celuma-quill .ql-editor")}
                .celuma-quill .ql-snow .ql-picker.ql-size { width: 84px; }
                ${PICKER_CSS}
                .celuma-quill .ql-editor.ql-blank::before {
                    color: #9ca3af;
                    font-style: normal;
                }
                /* Toolbar buttons — neutral at rest, teal on hover/active */
                .celuma-quill .ql-snow.ql-toolbar button,
                .celuma-quill .ql-snow .ql-picker-label {
                    border-radius: 6px;
                    transition: background .15s ease;
                }
                .celuma-quill .ql-snow .ql-stroke { stroke: #6b7280; }
                .celuma-quill .ql-snow .ql-fill { fill: #6b7280; }
                .celuma-quill .ql-snow .ql-picker { color: #6b7280; }
                .celuma-quill .ql-snow.ql-toolbar button:hover,
                .celuma-quill .ql-snow.ql-toolbar button.ql-active {
                    background: ${tokens.primary}1a;
                }
                .celuma-quill .ql-snow.ql-toolbar button:hover .ql-stroke,
                .celuma-quill .ql-snow.ql-toolbar button.ql-active .ql-stroke,
                .celuma-quill .ql-snow .ql-picker-label:hover .ql-stroke,
                .celuma-quill .ql-snow .ql-picker-label.ql-active .ql-stroke {
                    stroke: ${tokens.primary};
                }
                .celuma-quill .ql-snow.ql-toolbar button:hover .ql-fill,
                .celuma-quill .ql-snow.ql-toolbar button.ql-active .ql-fill {
                    fill: ${tokens.primary};
                }
                .celuma-quill .ql-snow .ql-picker-label:hover,
                .celuma-quill .ql-snow .ql-picker-item:hover,
                .celuma-quill .ql-snow .ql-picker-item.ql-selected {
                    color: ${tokens.primary};
                }
                .celuma-quill .ql-snow .ql-picker-options {
                    border-radius: 10px;
                    border: 1px solid #eef1f0;
                    box-shadow: ${tokens.shadow};
                    padding: 4px;
                }
                .celuma-quill .ql-snow a { color: ${tokens.primary}; }
            `}</style>
            <ReactQuill
                ref={quillRef}
                theme="snow"
                value={value}
                onChange={(html, _delta, source) => onChange(html, source)}
                readOnly={readOnly}
                placeholder={placeholder}
                modules={modules}
                formats={formats}
            />
            {assist.layer}
            {assist.description}
            {formulaDialog}
        </div>
    );
    if (!spelling) return editor;
    return (
        <>
            {editor}
            <SpellingSummary groupId={spelling.groupId ?? spelling.fieldId} style={{ marginTop: 6 }} />
        </>
    );
}
