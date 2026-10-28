import { useCallback, useLayoutEffect, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { markId } from "../../lib/spelling/marks";
import type { SpellingMark } from "../../lib/spelling/session";
import { SPELLING_MARK_COLOR } from "./spelling_context";

export type PlainControl = HTMLInputElement | HTMLTextAreaElement;

const UNDERLINE_ROOM = 5;

const MIRRORED_PROPERTIES = [
    "fontFamily", "fontSize", "fontWeight", "fontStyle", "fontVariant", "fontStretch", "fontKerning",
    "fontFeatureSettings", "letterSpacing", "wordSpacing", "textTransform", "textIndent", "textAlign",
    "direction", "tabSize", "wordBreak", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
    "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
] as const;

/**
 * Céluma 1.4 (#29) — editor-only underline layer for an input/textarea: a
 * transparent copy of the control's text with the same box, font and wrapping,
 * drawn behind the (transparent-background) control and scrolled with it.
 * It is aria-hidden, takes no pointer events and is never part of the value.
 */
export default function SpellingMirror({
    target,
    value,
    marks,
    multiline,
    mirrorRef,
}: {
    target: RefObject<PlainControl | null>;
    value: string;
    marks: SpellingMark[];
    multiline: boolean;
    mirrorRef: RefObject<HTMLDivElement | null>;
}) {
    const [box, setBox] = useState<CSSProperties | null>(null);

    const syncScroll = useCallback(() => {
        const el = target.current;
        const mirror = mirrorRef.current;
        if (!el || !mirror) return;
        mirror.scrollTop = el.scrollTop;
        mirror.scrollLeft = el.scrollLeft;
    }, [target, mirrorRef]);

    useLayoutEffect(() => {
        let retry = 0;
        let attempts = 0;
        const measure = () => {
            const el = target.current;
            if (!el) {
                // The control's ref can be attached after this layer in the same commit.
                if (attempts++ < 10) retry = requestAnimationFrame(measure);
                return;
            }
            const cs = getComputedStyle(el);
            const px = (v: string) => parseFloat(v) || 0;
            const next: Record<string, string | number> = {};
            for (const prop of MIRRORED_PROPERTIES) next[prop] = cs[prop];
            next.left = el.offsetLeft;
            next.top = el.offsetTop;
            // clientWidth excludes a scrollbar, so wrapping matches the control's text area.
            next.width = el.clientWidth + px(cs.borderLeftWidth) + px(cs.borderRightWidth);
            // A few extra pixels below the control (with matching padding, so lines do not
            // move) keep the wavy underline of the last line from being clipped.
            next.height = el.clientHeight + px(cs.borderTopWidth) + px(cs.borderBottomWidth) + UNDERLINE_ROOM;
            next.paddingBottom = `${px(cs.paddingBottom) + UNDERLINE_ROOM}px`;
            // A single-line input centres its line in the content box; a line box of that height does the same.
            next.lineHeight = multiline
                ? cs.lineHeight
                : `${Math.max(0, el.clientHeight - px(cs.paddingTop) - px(cs.paddingBottom))}px`;
            setBox((prev) => {
                if (prev && Object.keys(next).every((k) => (prev as Record<string, unknown>)[k] === next[k])) return prev;
                return next as CSSProperties;
            });
            syncScroll();
        };
        measure();
        const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
        const observed = target.current;
        if (observed) observer?.observe(observed);
        else retry = requestAnimationFrame(() => {
            measure();
            if (target.current) observer?.observe(target.current);
        });
        window.addEventListener("resize", measure);
        document.fonts?.addEventListener?.("loadingdone", measure);
        return () => {
            cancelAnimationFrame(retry);
            observer?.disconnect();
            window.removeEventListener("resize", measure);
            document.fonts?.removeEventListener?.("loadingdone", measure);
        };
    }, [target, multiline, syncScroll]);

    useLayoutEffect(syncScroll, [value, marks, box, syncScroll]);

    const parts: ReactNode[] = [];
    let pos = 0;
    for (const mark of marks) {
        if (mark.start < pos || value.slice(mark.start, mark.end) !== mark.word) continue;
        parts.push(value.slice(pos, mark.start));
        parts.push(
            <span
                key={markId(mark)}
                data-spelling-mark={markId(mark)}
                style={{
                    textDecorationLine: "underline",
                    textDecorationStyle: "wavy",
                    textDecorationColor: SPELLING_MARK_COLOR,
                    textDecorationThickness: "1.5px",
                    textUnderlineOffset: "3px",
                    textDecorationSkipInk: "none",
                }}
            >
                {value.slice(mark.start, mark.end)}
            </span>,
        );
        pos = mark.end;
    }
    parts.push(value.slice(pos));

    return (
        <div
            ref={mirrorRef}
            aria-hidden="true"
            className="celuma-spelling-layer"
            data-testid="spelling-mirror"
            style={{
                ...(box ?? { display: "none" }),
                position: "absolute",
                margin: 0,
                boxSizing: "border-box",
                borderStyle: "solid",
                borderColor: "transparent",
                overflow: "hidden",
                whiteSpace: multiline ? "pre-wrap" : "pre",
                overflowWrap: multiline ? "break-word" : "normal",
                color: "transparent",
                pointerEvents: "none",
                userSelect: "none",
                zIndex: 0,
            }}
        >
            {parts}
            {/* Keeps a trailing line break measurable, as in the control. */}
            {"\u200B"}
        </div>
    );
}
