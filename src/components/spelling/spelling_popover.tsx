import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { CloseOutlined, LeftOutlined, RightOutlined } from "@ant-design/icons";
import { tokens } from "../design/tokens";
import { SPELLING_MARK_COLOR, type PopoverMode } from "./spelling_context";

export type SuggestionState =
    | { status: "loading" }
    | { status: "ready"; items: string[] }
    | { status: "error" };

type Props = {
    mode: PopoverMode;
    fieldLabel: string;
    word: string;
    suggestions: SuggestionState;
    /** Why a suggestion cannot be applied in this field (e.g. caption length), or null. */
    refusal: (replacement: string) => string | null;
    /** Why the last chosen suggestion was not applied (shown and announced), or null. */
    notice?: string | null;
    getAnchorRect: () => DOMRect | null;
    position: { index: number; total: number };
    onApply: (replacement: string) => void;
    onIgnore: () => void;
    onClose: () => void;
    onPrevious: () => void;
    onNext: () => void;
    /** Lets the provider tell clicks inside the dialog from clicks outside it. */
    containerRef: RefObject<HTMLDivElement | null>;
};

const POPOVER_WIDTH = 300;
const GAP = 6;
const MARGIN = 8;

function placement(anchor: DOMRect, height: number): CSSProperties {
    const width = Math.min(POPOVER_WIDTH, window.innerWidth - 2 * MARGIN);
    const left = Math.max(MARGIN, Math.min(anchor.left, window.innerWidth - width - MARGIN));
    const below = anchor.bottom + GAP;
    const top = below + height > window.innerHeight - MARGIN && anchor.top - GAP - height > MARGIN
        ? anchor.top - GAP - height
        : below;
    return { left, top, width };
}

const buttonBase: CSSProperties = {
    font: "inherit",
    fontSize: 13,
    borderRadius: 8,
    cursor: "pointer",
    lineHeight: 1.3,
};

/**
 * Céluma 1.4 (#29) — the suggestion dialog for one indicated word.
 *
 * Opening, browsing, ignoring or dismissing it never edits the field; only
 * choosing a suggestion does. "Pasivo" (opened by clicking a word) leaves the
 * caret in the editor; "activo" (Alt+Enter or the field summary) takes focus
 * and is fully keyboard-operable: arrows move between options, Tab stays
 * inside, Escape closes and returns focus.
 */
export default function SpellingPopover({
    mode,
    fieldLabel,
    word,
    suggestions,
    refusal,
    notice = null,
    getAnchorRect,
    position,
    onApply,
    onIgnore,
    onClose,
    onPrevious,
    onNext,
    containerRef,
}: Props) {
    const titleId = useId();
    const descriptionId = useId();
    const [style, setStyle] = useState<CSSProperties | null>(null);

    useLayoutEffect(() => {
        let frame = 0;
        const update = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                const anchor = getAnchorRect();
                const height = containerRef.current?.offsetHeight ?? 160;
                if (anchor) setStyle(placement(anchor, height));
            });
        };
        const anchor = getAnchorRect();
        if (anchor) setStyle(placement(anchor, containerRef.current?.offsetHeight ?? 160));
        window.addEventListener("scroll", update, { capture: true, passive: true });
        window.addEventListener("resize", update);
        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener("scroll", update, { capture: true });
            window.removeEventListener("resize", update);
        };
    }, [getAnchorRect, containerRef, word, suggestions.status]);

    // Active mode: focus moves into the dialog, then to the first suggestion once known.
    const focusedFirst = useRef(false);
    useEffect(() => {
        if (mode !== "active") return;
        const root = containerRef.current;
        if (!root) return;
        if (!root.contains(document.activeElement)) root.focus({ preventScroll: true });
        if (suggestions.status === "loading" || focusedFirst.current) return;
        if (document.activeElement === root) {
            const first = root.querySelector<HTMLButtonElement>("[data-spelling-option]:not([disabled])")
                ?? root.querySelector<HTMLButtonElement>("[data-spelling-ignore]");
            first?.focus({ preventScroll: true });
            focusedFirst.current = true;
        }
    }, [mode, suggestions.status, containerRef, word]);
    useEffect(() => {
        focusedFirst.current = false;
    }, [word]);

    const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        // Keep keys inside the dialog: an enclosing modal must not react to them.
        e.stopPropagation();
        if (e.key === "Escape") {
            e.preventDefault();
            onClose();
            return;
        }
        const root = containerRef.current;
        if (!root) return;
        const focusables = [...root.querySelectorAll<HTMLButtonElement>("button:not([disabled])")];
        const index = focusables.indexOf(document.activeElement as HTMLButtonElement);
        const move = (delta: number) => {
            e.preventDefault();
            const next = focusables[(index + delta + focusables.length) % focusables.length];
            next?.focus({ preventScroll: true });
        };
        if (e.key === "ArrowDown" || e.key === "ArrowRight") move(1);
        else if (e.key === "ArrowUp" || e.key === "ArrowLeft") move(-1);
        else if (e.key === "Tab" && focusables.length) move(e.shiftKey ? -1 : 1);
    };

    const items = suggestions.status === "ready" ? suggestions.items : [];

    const body = (
        <div
            ref={containerRef}
            role="dialog"
            aria-modal="false"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            tabIndex={-1}
            data-testid="spelling-popover"
            className="celuma-spelling-popover"
            onKeyDown={onKeyDown}
            // Passive mode: clicking an option must not take focus (and the caret) from the editor.
            onMouseDown={(e) => {
                if (mode === "passive" || (e.target as HTMLElement).closest("button")) e.preventDefault();
            }}
            style={{
                position: "fixed",
                zIndex: 1060,
                visibility: style ? "visible" : "hidden",
                ...(style ?? { left: 0, top: 0, width: POPOVER_WIDTH }),
                background: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                boxShadow: tokens.shadow,
                padding: 12,
                display: "grid",
                gap: 10,
                fontFamily: tokens.textFont,
                fontSize: 13,
                color: tokens.textPrimary,
                outline: "none",
            }}
        >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                    <div id={titleId} style={{ fontSize: 11.5, fontWeight: 600, color: tokens.textSecondary }}>
                        Ortografía · {fieldLabel}
                    </div>
                    <div id={descriptionId} style={{ marginTop: 2, overflowWrap: "anywhere" }}>
                        Posible error:{" "}
                        <strong
                            style={{
                                textDecorationLine: "underline",
                                textDecorationStyle: "wavy",
                                textDecorationColor: SPELLING_MARK_COLOR,
                                textUnderlineOffset: 3,
                            }}
                        >
                            {word}
                        </strong>
                    </div>
                </div>
                <button
                    type="button"
                    aria-label="Cerrar sugerencias"
                    onClick={onClose}
                    style={{ ...buttonBase, border: "none", background: "transparent", color: tokens.textSecondary, padding: 4 }}
                >
                    <CloseOutlined />
                </button>
            </div>

            {notice && (
                <div
                    role="alert"
                    data-testid="spelling-apply-notice"
                    style={{
                        fontSize: 12.5,
                        color: "#92400e",
                        background: "#fffbeb",
                        border: "1px solid #fde68a",
                        borderRadius: 8,
                        padding: "6px 8px",
                    }}
                >
                    {notice}
                </div>
            )}

            <div role="group" aria-label="Sugerencias" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {suggestions.status === "loading" && (
                    <span role="status" style={{ color: tokens.textSecondary }}>Buscando sugerencias…</span>
                )}
                {suggestions.status === "error" && (
                    <span role="status" style={{ color: tokens.textSecondary }}>No se pudieron obtener sugerencias.</span>
                )}
                {suggestions.status === "ready" && items.length === 0 && (
                    <span role="status" style={{ color: tokens.textSecondary }}>
                        Sin sugerencias. Puede ser un término válido que el diccionario no conoce (por ejemplo, vocabulario médico).
                    </span>
                )}
                {items.map((item) => {
                    const reason = refusal(item);
                    return (
                        <button
                            key={item}
                            type="button"
                            data-spelling-option
                            disabled={reason !== null}
                            aria-label={reason ? `${item}: ${reason}` : `Reemplazar por ${item}`}
                            title={reason ?? undefined}
                            onClick={() => onApply(item)}
                            className="celuma-spelling-option"
                            style={{
                                ...buttonBase,
                                padding: "4px 10px",
                                border: `1px solid ${reason ? "#e5e7eb" : `${tokens.primary}66`}`,
                                background: reason ? "#f9fafb" : "#eaf7f5",
                                color: reason ? "#9ca3af" : "#1f6f69",
                                fontWeight: 600,
                                cursor: reason ? "not-allowed" : "pointer",
                            }}
                        >
                            {item}
                            {reason && <span style={{ fontWeight: 400 }}> ({reason})</span>}
                        </button>
                    );
                })}
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <button
                    type="button"
                    data-spelling-ignore
                    onClick={onIgnore}
                    className="celuma-spelling-option"
                    style={{ ...buttonBase, padding: "4px 10px", border: "1px solid #d1d5db", background: "#fff", color: "#374151" }}
                >
                    Ignorar en este reporte
                </button>
                {position.total > 1 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 4, color: tokens.textSecondary, fontSize: 12 }}>
                        <button
                            type="button"
                            aria-label="Indicación anterior"
                            onClick={onPrevious}
                            className="celuma-spelling-option"
                            style={{ ...buttonBase, border: "1px solid #e5e7eb", background: "#fff", padding: "2px 6px" }}
                        >
                            <LeftOutlined />
                        </button>
                        <span aria-live="polite">{position.index + 1} de {position.total}</span>
                        <button
                            type="button"
                            aria-label="Siguiente indicación"
                            onClick={onNext}
                            className="celuma-spelling-option"
                            style={{ ...buttonBase, border: "1px solid #e5e7eb", background: "#fff", padding: "2px 6px" }}
                        >
                            <RightOutlined />
                        </button>
                    </div>
                )}
            </div>
            {mode === "active" && (
                <div style={{ fontSize: 11, color: tokens.textSecondary }}>Esc para cerrar sin cambios.</div>
            )}
        </div>
    );

    return createPortal(body, document.body);
}
