import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type RefObject } from "react";
import { isMarkCurrent, markId, textWithReplacement } from "../../lib/spelling/marks";
import type { SpellingMark } from "../../lib/spelling/session";
import { indicationCountText, type ApplyOutcome, type SpellingFieldOptions } from "./spelling_context";
import SpellingMirror, { type PlainControl } from "./spelling_mirror";
import { useSpellingField, type SpellingFieldAdapter } from "./use_spelling_field";

const visuallyHidden: CSSProperties = {
    position: "absolute",
    width: 1,
    height: 1,
    margin: -1,
    padding: 0,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
    border: 0,
};

/**
 * Replaces one indicated word in an input/textarea through the browser's own
 * editing command, so the change goes through the control's normal onChange
 * pipeline (normalizers, state, save) and native undo/redo restores it.
 * Refuses when the field changed since the check or would break its limits;
 * never truncates.
 *
 * There is no other way to add an entry to a control's native undo history,
 * so when the command is unavailable, fails or yields something else the
 * correction is refused instead of being written directly: the value and the
 * selection are left exactly as they were (`unsupported`). If the browser did
 * edit the field differently, that native step is taken back first; when it
 * cannot be, the outcome is `mismatch` and is never reported as applied.
 */
export function applyPlainReplacement(
    el: PlainControl,
    mark: SpellingMark,
    replacement: string,
    limits: { maxLength?: number; normalize?: (raw: string) => string } = {},
): ApplyOutcome {
    if (el.disabled || el.readOnly) return "refused";
    const live = el.value;
    if (!isMarkCurrent(live, mark)) return "stale";
    const expected = textWithReplacement(live, mark, replacement);
    if (limits.maxLength != null && expected.length > limits.maxLength) return "refused";
    if (limits.normalize && limits.normalize(expected) !== expected) return "refused";
    const selection = { start: el.selectionStart, end: el.selectionEnd, direction: el.selectionDirection };
    // Plain text has no formatting to protect, so the whole word is replaced: native
    // redo then leaves the caret after the word, as it does for an ordinary edit.
    el.focus({ preventScroll: true });
    el.setSelectionRange(mark.start, mark.end);
    let native = false;
    try {
        native = replacement
            ? document.execCommand("insertText", false, replacement)
            : document.execCommand("delete", false);
    } catch {
        native = false;
    }
    if (native && el.value === expected) {
        const caret = mark.start + replacement.length;
        el.setSelectionRange(caret, caret);
        return "applied";
    }
    if (el.value !== live) {
        try {
            document.execCommand("undo", false);
        } catch {
            // Checked below.
        }
    }
    if (el.value !== live) return "mismatch";
    if (selection.start != null && selection.end != null) {
        el.setSelectionRange(selection.start, selection.end, selection.direction ?? undefined);
    }
    return "unsupported";
}

/**
 * Céluma 1.4 (#29) — spelling assistance for a plain `<input>` or
 * `<textarea>`. Returns the editor-only mirror layer (to render, positioned,
 * right after the control inside a relatively positioned wrapper; its z-index
 * keeps it behind the control), the props
 * to spread on the control, and a screen-reader description. The control's
 * value, onChange and caret handling are untouched; a mark is never part of
 * its value. Without `spelling` options everything is inert.
 */
export function usePlainSpelling({
    spelling,
    elementRef,
    value,
    disabled,
    multiline,
    maxLength,
    normalize,
}: {
    spelling?: SpellingFieldOptions;
    elementRef: RefObject<PlainControl | null>;
    value: string;
    disabled?: boolean;
    multiline: boolean;
    maxLength?: number;
    normalize?: (raw: string) => string;
}) {
    const [composing, setComposing] = useState(false);
    const mirrorRef = useRef<HTMLDivElement | null>(null);
    const descriptionId = useId();

    const findMarkElement = (mark: SpellingMark) =>
        mirrorRef.current?.querySelector<HTMLElement>(`[data-spelling-mark="${CSS.escape(markId(mark))}"]`) ?? null;

    const adapter: SpellingFieldAdapter = {
        isEditable: () => Boolean(elementRef.current && !elementRef.current.disabled && !elementRef.current.readOnly),
        getAnchorRect: (mark) => findMarkElement(mark)?.getBoundingClientRect() ?? null,
        reveal: (mark) => {
            const el = elementRef.current;
            const span = findMarkElement(mark);
            if (!el) return;
            if (span) {
                if (span.offsetTop < el.scrollTop || span.offsetTop + span.offsetHeight > el.scrollTop + el.clientHeight) {
                    el.scrollTop = Math.max(0, span.offsetTop - el.clientHeight / 3);
                }
                if (span.offsetLeft < el.scrollLeft || span.offsetLeft + span.offsetWidth > el.scrollLeft + el.clientWidth) {
                    el.scrollLeft = Math.max(0, span.offsetLeft - el.clientWidth / 3);
                }
                if (mirrorRef.current) {
                    mirrorRef.current.scrollTop = el.scrollTop;
                    mirrorRef.current.scrollLeft = el.scrollLeft;
                }
            }
            el.scrollIntoView?.({ block: "nearest", inline: "nearest" });
        },
        refusal: (mark, replacement) => {
            const next = textWithReplacement(elementRef.current?.value ?? value, mark, replacement);
            if (maxLength != null && next.length > maxLength) return `excede el límite de ${maxLength} caracteres`;
            if (normalize && normalize(next) !== next) return "no es compatible con el formato del campo";
            return null;
        },
        apply: (mark, replacement) =>
            elementRef.current ? applyPlainReplacement(elementRef.current, mark, replacement, { maxLength, normalize }) : "refused",
        focus: () => elementRef.current?.focus(),
        contains: (node) => Boolean(elementRef.current?.contains(node) || mirrorRef.current?.contains(node)),
    };

    const field = useSpellingField(spelling, value ?? "", !disabled, composing, adapter);
    const caret = () => elementRef.current?.selectionStart ?? null;

    // Opened, browsed or dismissed suggestions never touch the value; nothing else is overridden.
    const controlProps = spelling
        ? {
            spellCheck: false,
            "aria-describedby": field.marks.length ? descriptionId : undefined,
            onClick: () => {
                const el = elementRef.current;
                if (el && el.selectionStart === el.selectionEnd) field.openFromCaret(el.selectionStart, "passive");
            },
            onSelect: () => field.handleCaretMove(caret()),
            onCompositionStart: () => setComposing(true),
            onCompositionEnd: () => setComposing(false),
            onScroll: () => {
                if (mirrorRef.current && elementRef.current) {
                    mirrorRef.current.scrollTop = elementRef.current.scrollTop;
                    mirrorRef.current.scrollLeft = elementRef.current.scrollLeft;
                }
            },
        }
        : {};

    /** Call first from the control's onKeyDown; returns true when the key was handled. */
    const handleKeyDown = (event: KeyboardEvent<PlainControl>) => (spelling ? field.handleKeyDown(event, caret()) : false);

    // Leave composition state when the control stops being editable mid-composition.
    useEffect(() => {
        if (disabled) setComposing(false);
    }, [disabled]);

    const layer = spelling && field.active ? (
        <SpellingMirror target={elementRef} value={value ?? ""} marks={field.marks} multiline={multiline} mirrorRef={mirrorRef} />
    ) : null;

    const description = spelling && field.marks.length ? (
        <span id={descriptionId} style={visuallyHidden}>
            {`${indicationCountText(field.marks.length)}: ${field.marks.slice(0, 5).map((m) => m.word).join(", ")}. Alt+Enter muestra sugerencias.`}
        </span>
    ) : null;

    return { layer, description, controlProps, handleKeyDown, marks: field.marks, partial: field.partial, active: field.active };
}
