import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type RefObject } from "react";
import type Quill from "quill";
import { isMarkCurrent, markId, minimalEdit } from "../../lib/spelling/marks";
import type { SpellingMark } from "../../lib/spelling/session";
import { indicationCountText, SPELLING_MARK_COLOR, type ApplyOutcome, type SpellingFieldOptions } from "./spelling_context";
import { useSpellingField, type SpellingFieldAdapter } from "./use_spelling_field";

/**
 * The text Quill indexes into: string inserts as-is and one placeholder per
 * embed, so every offset in it is a Quill index (unlike `getText()`, which
 * drops embeds and shifts later offsets).
 */
export function quillText(quill: Quill): string {
    return quill
        .getContents()
        .ops.map((op) => (typeof op.insert === "string" ? op.insert : "\uFFFC"))
        .join("");
}

/** A DOM Range over Quill indexes `[start, end)` within text leaves, or null. */
function quillRange(quill: Quill, start: number, end: number): Range | null {
    if (end <= start) return null;
    const [startLeaf, startOffset] = quill.getLeaf(start);
    const [endLeaf, endOffset] = quill.getLeaf(end - 1);
    const startNode = startLeaf?.domNode;
    const endNode = endLeaf?.domNode;
    if (!(startNode instanceof Text) || !(endNode instanceof Text)) return null;
    try {
        const range = document.createRange();
        range.setStart(startNode, startOffset);
        range.setEnd(endNode, endOffset + 1);
        return range;
    } catch {
        return null;
    }
}

/**
 * Replaces one indicated word as a normal user edit (a Delta with source
 * "user"), isolated as its own undo step. Only the differing characters are
 * deleted/inserted, so formatting of the untouched characters — including a
 * word split across bold/italic runs — is preserved; inserted characters take
 * the inline formats of the character they replace. Never touches innerHTML.
 */
export function applyQuillReplacement(quill: Quill, mark: SpellingMark, replacement: string): ApplyOutcome {
    if (!quill.isEnabled()) return "refused";
    if (!isMarkCurrent(quillText(quill), mark)) return "stale";
    const edit = minimalEdit(mark.word, replacement);
    const from = mark.start + edit.from;
    const length = edit.to - edit.from;
    const sampleIndex = length > 0 ? from : Math.max(mark.start, from - 1);
    const attributes = quill.getContents(sampleIndex, 1).ops[0]?.attributes;
    const ops: Array<Record<string, unknown>> = [];
    if (from > 0) ops.push({ retain: from });
    if (edit.insert) ops.push(attributes ? { insert: edit.insert, attributes } : { insert: edit.insert });
    if (length > 0) ops.push({ delete: length });
    const history = quill.getModule("history") as { cutoff?: () => void } | undefined;
    history?.cutoff?.();
    quill.updateContents(ops as never, "user");
    history?.cutoff?.();
    quill.setSelection(mark.start + replacement.length, 0, "user");
    return "applied";
}

interface Underline {
    id: string;
    left: number;
    top: number;
    width: number;
}

/**
 * Céluma 1.4 (#29) — spelling assistance for a Quill editor.
 *
 * Underlines are absolutely positioned elements in a layer next to (never
 * inside) Quill's root, computed from DOM ranges, so the editor HTML that
 * react-quill reports as the section value is exactly what the author typed.
 * Recomputed on edits, resize, font loading and scroll.
 */
export function useQuillSpelling({
    spelling,
    getQuill,
    wrapperRef,
    readOnly,
}: {
    spelling?: SpellingFieldOptions;
    getQuill: () => Quill | null;
    wrapperRef: RefObject<HTMLDivElement | null>;
    readOnly: boolean;
}) {
    const [quill, setQuill] = useState<Quill | null>(null);
    const [text, setText] = useState("");
    const [composing, setComposing] = useState(false);
    const [underlines, setUnderlines] = useState<Underline[]>([]);
    const [frame, setFrame] = useState<CSSProperties | null>(null);
    const descriptionId = useId();
    const enabled = Boolean(spelling);

    useEffect(() => {
        if (!enabled) return;
        setQuill(getQuill());
    }, [enabled, getQuill]);

    useEffect(() => {
        if (!quill) return;
        const root = quill.root;
        // The application checker is the only one on covered fields: no native/OS checker fallback.
        root.setAttribute("spellcheck", "false");
        const update = () => setText(quillText(quill));
        const onStart = () => setComposing(true);
        // WebKit edits the DOM after compositionend; read it once Quill has synced.
        const onEnd = () => queueMicrotask(() => {
            setComposing(false);
            update();
        });
        update();
        quill.on("text-change", update);
        root.addEventListener("compositionstart", onStart);
        root.addEventListener("compositionend", onEnd);
        return () => {
            quill.off("text-change", update);
            root.removeEventListener("compositionstart", onStart);
            root.removeEventListener("compositionend", onEnd);
        };
    }, [quill]);

    const adapter: SpellingFieldAdapter = {
        isEditable: () => Boolean(quill && quill.isEnabled() && !readOnly),
        getAnchorRect: (mark) => {
            if (!quill) return null;
            const range = quillRange(quill, mark.start, mark.end);
            if (!range || typeof range.getClientRects !== "function") return null;
            return range.getClientRects()[0] ?? range.getBoundingClientRect();
        },
        reveal: (mark) => {
            if (!quill) return;
            const [leaf] = quill.getLeaf(mark.start);
            const node = leaf?.domNode;
            (node instanceof Text ? node.parentElement : (node as Element | undefined))?.scrollIntoView?.({ block: "nearest" });
        },
        refusal: () => null,
        apply: (mark, replacement) => (quill ? applyQuillReplacement(quill, mark, replacement) : "refused"),
        focus: () => quill?.focus(),
        contains: (node) => Boolean(wrapperRef.current?.contains(node)),
    };

    const field = useSpellingField(spelling, text, !readOnly && Boolean(quill), composing, adapter);
    const { marks } = field;

    const layout = useCallback(() => {
        const wrapper = wrapperRef.current;
        if (!quill || !wrapper) return;
        const container = quill.container as HTMLElement;
        const base = container.getBoundingClientRect();
        const outer = wrapper.getBoundingClientRect();
        // Same geometry → same state: no extra commit for a keystroke that moved nothing.
        const nextFrame = {
            left: base.left - outer.left,
            top: base.top - outer.top,
            width: base.width,
            height: base.height,
        };
        setFrame((prev) => (prev && prev.left === nextFrame.left && prev.top === nextFrame.top && prev.width === nextFrame.width && prev.height === nextFrame.height ? prev : nextFrame));
        const next: Underline[] = [];
        for (const mark of marks) {
            const range = quillRange(quill, mark.start, mark.end);
            // No layout engine (jsdom): nothing to draw, the summary still lists the word.
            if (!range || typeof range.getClientRects !== "function") continue;
            // A word split across inline formats yields one rect per text node (plus the
            // element's own box); draw one continuous underline per visual line.
            const lines: Array<{ left: number; right: number; bottom: number }> = [];
            for (const r of Array.from(range.getClientRects())) {
                if (r.width < 1) continue;
                const line = lines.find((l) => Math.abs(l.bottom - r.bottom) < 2 && r.left <= l.right + 1 && r.right >= l.left - 1);
                if (line) {
                    line.left = Math.min(line.left, r.left);
                    line.right = Math.max(line.right, r.right);
                    line.bottom = Math.max(line.bottom, r.bottom);
                } else {
                    lines.push({ left: r.left, right: r.right, bottom: r.bottom });
                }
            }
            lines.forEach((l, i) => {
                next.push({ id: `${markId(mark)}#${i}`, left: l.left - base.left, top: l.bottom - base.top - 3, width: l.right - l.left });
            });
        }
        setUnderlines((prev) => (
            prev.length === next.length && prev.every((u, i) => u.id === next[i].id && u.left === next[i].left && u.top === next[i].top && u.width === next[i].width)
                ? prev
                : next
        ));
    }, [quill, marks, wrapperRef]);

    // Underline geometry is read from the DOM (up to 300 marks, each a forced layout). Doing that
    // synchronously on every keystroke put it on the typing path (measured ≈ 30 ms per key in a
    // 20 000+ character section); one pass per frame keeps the layer in step without delaying the
    // typed character. The first pass after mount also runs here.
    useEffect(() => {
        const raf = requestAnimationFrame(layout);
        return () => cancelAnimationFrame(raf);
    }, [layout, text]);

    useEffect(() => {
        if (!quill) return;
        let raf = 0;
        const schedule = () => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(layout);
        };
        const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
        observer?.observe(quill.root);
        if (wrapperRef.current) observer?.observe(wrapperRef.current);
        quill.root.addEventListener("scroll", schedule, { passive: true });
        window.addEventListener("resize", schedule);
        document.fonts?.addEventListener?.("loadingdone", schedule);
        return () => {
            cancelAnimationFrame(raf);
            observer?.disconnect();
            quill.root.removeEventListener("scroll", schedule);
            window.removeEventListener("resize", schedule);
            document.fonts?.removeEventListener?.("loadingdone", schedule);
        };
    }, [quill, layout, wrapperRef]);

    // Pointer: clicking an underlined word shows its suggestions without moving focus.
    // Keyboard: Alt+Enter (captured before Quill's own bindings) and Escape.
    const fieldRef = useRef(field);
    fieldRef.current = field;
    useEffect(() => {
        const wrapper = wrapperRef.current;
        if (!quill || !wrapper || !enabled) return;
        const caret = () => quill.getSelection()?.index ?? null;
        const onClick = () => {
            const range = quill.getSelection();
            if (range && range.length === 0) fieldRef.current.openFromCaret(range.index, "passive");
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (!quill.root.contains(event.target as Node)) return;
            fieldRef.current.handleKeyDown(event, caret());
        };
        const onSelection = (range: { index: number; length: number } | null) => {
            if (range) fieldRef.current.handleCaretMove(range.length === 0 ? range.index : null);
        };
        quill.root.addEventListener("click", onClick);
        wrapper.addEventListener("keydown", onKeyDown, true);
        quill.on("selection-change", onSelection);
        return () => {
            quill.root.removeEventListener("click", onClick);
            wrapper.removeEventListener("keydown", onKeyDown, true);
            quill.off("selection-change", onSelection);
        };
    }, [quill, wrapperRef, enabled]);

    // Screen readers get the count with the editor's description.
    useEffect(() => {
        if (!quill) return;
        if (marks.length) quill.root.setAttribute("aria-describedby", descriptionId);
        else quill.root.removeAttribute("aria-describedby");
    }, [quill, marks.length, descriptionId]);

    const layer = field.active && frame ? (
        <div
            aria-hidden="true"
            className="celuma-spelling-layer"
            data-testid="spelling-quill-layer"
            style={{ position: "absolute", ...frame, overflow: "hidden", pointerEvents: "none", zIndex: 1 }}
        >
            {underlines.map((u) => (
                <div
                    key={u.id}
                    data-spelling-underline
                    style={{
                        position: "absolute",
                        left: u.left,
                        top: u.top,
                        width: u.width,
                        height: 4,
                        backgroundImage: WAVE,
                        backgroundRepeat: "repeat-x",
                        backgroundSize: "6px 4px",
                    }}
                />
            ))}
        </div>
    ) : null;

    const description = enabled && marks.length ? (
        <span
            id={descriptionId}
            style={{ position: "absolute", width: 1, height: 1, margin: -1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}
        >
            {`${indicationCountText(marks.length)}: ${marks.slice(0, 5).map((m) => m.word).join(", ")}. Alt+Enter muestra sugerencias.`}
        </span>
    ) : null;

    return { layer, description, marks, partial: field.partial, active: field.active };
}

const WAVE = `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='6' height='4' viewBox='0 0 6 4'><path d='M0 3 Q1.5 0.5 3 3 T6 3' fill='none' stroke='${SPELLING_MARK_COLOR}' stroke-width='1.2'/></svg>`,
)}")`;
