import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import CelumaModal from "./celuma_modal";
import ActionButtonPanel from "./action_button_panel";
import CelumaTextArea from "./textarea_field";
import ModalFormFooter from "./modal_form_footer";
import Panel from "./panel";
import { tokens } from "../design/tokens";
import { FORMULA_MAX_LENGTH, ensureFormulaStyles, typesetFormula } from "../report/rich_text_formula";

/**
 * Céluma 1.5 (#95) — insert or edit one formula of a rich-text field.
 *
 * The author writes LaTeX; the drawing below updates as they type. Shortcuts
 * insert the constructs pathology reports use most at the caret. A source that
 * cannot be typeset cannot be inserted, so the editor only stores formulas
 * every surface can draw.
 */

type Snippet = { label: string; name: string; latex: string; /** caret offset from the start of `latex` */ caret?: number };

/** Shortcuts: what the button shows, its accessible name and the LaTeX it inserts. */
const FORMULA_SNIPPETS: readonly Snippet[] = [
    // `\dfrac`: a fraction at full text size; an inline `\frac` is set smaller (TeX's text style).
    { label: "a⁄b", name: "Fracción", latex: "\\dfrac{}{}", caret: 7 },
    { label: "√x", name: "Raíz cuadrada", latex: "\\sqrt{}", caret: 6 },
    { label: "xⁿ", name: "Exponente", latex: "^{}", caret: 2 },
    { label: "xᵢ", name: "Subíndice", latex: "_{}", caret: 2 },
    { label: "Σ", name: "Sumatoria", latex: "\\sum_{i=1}^{n} ", caret: 15 },
    { label: "×", name: "Multiplicación", latex: "\\times " },
    { label: "±", name: "Más o menos", latex: "\\pm " },
    { label: "≤", name: "Menor o igual", latex: "\\leq " },
    { label: "≥", name: "Mayor o igual", latex: "\\geq " },
    { label: "µ", name: "Micro", latex: "\\mu " },
    { label: "texto", name: "Texto dentro de la fórmula", latex: "\\text{}", caret: 6 },
];

/** Field caption, as in the report editor's field captions. */
const CAPTION_STYLE = { fontSize: 13, fontWeight: 600, color: tokens.textPrimary } as const;
/** LaTeX is code: a monospaced face keeps braces and backslashes legible. */
const MONO_FONT = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

type Props = {
    open: boolean;
    /** LaTeX of the formula being edited, or "" for a new one. */
    initialValue: string;
    /** True when editing an existing formula (changes the title and the confirm label). */
    editing: boolean;
    onConfirm: (latex: string) => void;
    onCancel: () => void;
};

export default function FormulaDialog({ open, initialValue, editing, onConfirm, onCancel }: Props) {
    // The editor mounts a new dialog (new `key`) for every opening, so this starts from the formula
    // being edited, or empty, and never from what a previous opening left behind.
    const [value, setValue] = useState(initialValue);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    useEffect(() => {
        if (open) ensureFormulaStyles();
    }, [open]);

    const source = value.trim();
    const result = useMemo(() => (source ? typesetFormula(source) : null), [source]);
    const tooLong = value.length > FORMULA_MAX_LENGTH;
    const canConfirm = !!result?.ok && !tooLong;

    // Caret to restore once the value a shortcut produced has been committed to the textarea.
    const pendingCaret = useRef<number | null>(null);
    useLayoutEffect(() => {
        const area = textareaRef.current;
        if (pendingCaret.current == null || !area) return;
        area.focus();
        area.setSelectionRange(pendingCaret.current, pendingCaret.current);
        pendingCaret.current = null;
    }, [value]);

    const insertSnippet = (snippet: Snippet) => {
        const area = textareaRef.current;
        const start = area?.selectionStart ?? value.length;
        const end = area?.selectionEnd ?? value.length;
        pendingCaret.current = start + (snippet.caret ?? snippet.latex.length);
        setValue(value.slice(0, start) + snippet.latex + value.slice(end));
    };

    const confirm = () => {
        if (canConfirm) onConfirm(source);
    };

    const error = tooLong
        ? `La fórmula no puede tener más de ${FORMULA_MAX_LENGTH} caracteres.`
        : result && !result.ok
            ? "No se pudo interpretar la fórmula. Revisa la notación (llaves, comandos)."
            : undefined;

    return (
        <CelumaModal
            open={open}
            title={editing ? "Editar fórmula" : "Insertar fórmula"}
            onCancel={onCancel}
            // A click outside must not throw away a formula being written; Cancelar, × and Esc close it.
            maskClosable={false}
            footer={null}
            width={600}
            destroyOnHidden
            afterOpenChange={(visible) => {
                if (visible) textareaRef.current?.focus();
            }}
        >
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    confirm();
                }}
                noValidate
                style={{ display: "grid", gap: 18 }}
            >
                <div style={{ display: "grid", gap: 8 }}>
                    <div style={CAPTION_STYLE}>Atajos</div>
                    <div role="toolbar" aria-label="Atajos de fórmula" style={{ display: "flex", flexWrap: "wrap" }}>
                        <ActionButtonPanel
                            actions={FORMULA_SNIPPETS.map((snippet) => ({
                                label: snippet.label,
                                tooltip: snippet.name,
                                ariaLabel: snippet.name,
                                onClick: () => insertSnippet(snippet),
                            }))}
                        />
                    </div>
                </div>

                <div style={{ display: "grid", gap: 8 }}>
                    <label htmlFor="celuma-formula-source" style={CAPTION_STYLE}>
                        Fórmula en notación LaTeX
                    </label>
                    <CelumaTextArea
                        value={value}
                        onChange={setValue}
                        inputRef={(el) => {
                            textareaRef.current = el;
                            if (el) {
                                el.id = "celuma-formula-source";
                                el.spellcheck = false;
                                el.style.fontFamily = MONO_FONT;
                                el.style.fontSize = "13px";
                            }
                        }}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                                e.preventDefault();
                                confirm();
                            }
                        }}
                        rows={3}
                        maxLength={FORMULA_MAX_LENGTH}
                        placeholder="Ejemplo: \dfrac{\text{células positivas}}{\text{células totales}} \times 100"
                        error={error}
                    />
                </div>

                <Panel data-testid="formula-preview-panel" style={{ display: "grid", gap: 10 }}>
                    <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: tokens.textPrimary }}>Vista previa</div>
                        <div style={{ fontSize: 13, color: tokens.textSecondary, marginTop: 2 }}>
                            La fórmula solo se muestra; no se calcula. Ctrl + Enter para confirmar.
                        </div>
                    </div>
                    <div
                        data-testid="formula-preview"
                        aria-live="polite"
                        style={{
                            minHeight: 52,
                            padding: "12px 14px",
                            borderRadius: 10,
                            background: "#fff",
                            border: "1px solid #eef1f0",
                            fontSize: 18,
                            color: tokens.textPrimary,
                            overflowX: "auto",
                            display: "flex",
                            alignItems: "center",
                        }}
                    >
                        {result?.ok ? (
                            <span dangerouslySetInnerHTML={{ __html: result.html }} />
                        ) : (
                            <span style={{ color: tokens.textSecondary, fontSize: 13 }}>
                                {source ? "Sin vista previa mientras la fórmula no sea válida." : "Escribe una fórmula para ver cómo quedará."}
                            </span>
                        )}
                    </div>
                </Panel>

                <ModalFormFooter
                    onCancel={onCancel}
                    submitLabel={editing ? "Guardar fórmula" : "Insertar fórmula"}
                    submitDisabled={!canConfirm}
                    hideRequiredNote
                />
            </form>
        </CelumaModal>
    );
}
