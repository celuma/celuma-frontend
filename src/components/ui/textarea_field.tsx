import React, { useCallback, useRef, useState } from "react";
import ErrorText from "./error_text";
import type { SpellingFieldOptions } from "../spelling/spelling_context";
import { usePlainSpelling } from "../spelling/plain_spelling";
import { SpellingSummary } from "../spelling/spelling_summary";

type Props = {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    rows?: number;
    maxLength?: number;
    disabled?: boolean;
    error?: string;
    autoFocus?: boolean;
    /**
     * Optional rewrite of what the user typed or pasted (e.g. flatten line
     * breaks, cap the length). When it changes the text, the caret is put back
     * where the edit logically ended instead of jumping to the end; plain typing
     * is passed through untouched.
     */
    normalize?: (raw: string) => string;
    /** Accessible name for the textarea (Spanish, per field). */
    ariaLabel?: string;
    /** Show a live character counter (only when `maxLength` is set). Default true. */
    showCount?: boolean;
    /** Optional control rendered inside the box, bottom-right (e.g. a send button). */
    action?: React.ReactNode;
    /** Ref to the underlying textarea (e.g. for cursor position / focus). */
    inputRef?: React.Ref<HTMLTextAreaElement>;
    onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
    style?: React.CSSProperties;
    /**
     * Opt-in local spelling assistance (report authoring only, Céluma 1.4 #29).
     * Requires an enclosing SpellingProvider; without it the textarea is
     * exactly as before. Suggestions that would break `maxLength` or
     * `normalize` are refused, never truncated.
     */
    spelling?: SpellingFieldOptions;
};

/**
 * CelumaTextArea — a multiline text input that matches the Céluma field look:
 * the same 2px teal outline, 12px radius and soft focus ring as SearchField /
 * FloatingCaptionInput, with an optional character counter and inline error.
 * Use it anywhere a multiline input is needed instead of antd's Input.TextArea.
 */
export default function CelumaTextArea({
    value,
    onChange,
    placeholder,
    rows = 4,
    maxLength,
    disabled,
    error,
    autoFocus,
    ariaLabel,
    normalize,
    showCount = true,
    action,
    inputRef,
    onKeyDown,
    style,
    spelling,
}: Props) {
    const [hovered, setHovered] = useState(false);
    const [focused, setFocused] = useState(false);
    const ownRef = useRef<HTMLTextAreaElement | null>(null);
    const setRefs = useCallback(
        (el: HTMLTextAreaElement | null) => {
            ownRef.current = el;
            if (typeof inputRef === "function") inputRef(el);
            else if (inputRef) (inputRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
        },
        [inputRef],
    );
    const assist = usePlainSpelling({
        spelling,
        elementRef: ownRef,
        value: value ?? "",
        disabled,
        multiline: true,
        maxLength,
        normalize,
    });

    const colors = {
        base: "#49b6ad",
        baseHover: "#3da8a0",
        ring: "rgba(73,182,173,.20)",
        text: "#0d1b2a",
        placeholder: "#6b7280",
        counter: "#94a3b8",
        error: "#e5484d",
        ringError: "rgba(229, 72, 77, .20)",
    };
    const active = hovered || focused;
    const borderColor = error ? colors.error : active ? colors.baseHover : colors.base;
    const boxShadow = error
        ? `0 0 0 3px ${colors.ringError}`
        : active
            ? `0 0 0 3px ${colors.ring}`
            : "none";

    const textarea = (
        <textarea
            {...assist.controlProps}
            ref={spelling ? setRefs : inputRef}
            value={value ?? ""}
            onChange={(e) => {
                const el = e.target;
                const raw = el.value;
                const next = normalize ? normalize(raw) : raw;
                if (next !== raw) {
                    // Where the caret belongs: the normalized text that precedes it.
                    const caret = Math.min(normalize!(raw.slice(0, el.selectionStart ?? raw.length)).length, next.length);
                    // React re-syncs the DOM value after this handler; restore afterwards.
                    queueMicrotask(() => {
                        if (document.activeElement === el && el.value === next) el.setSelectionRange(caret, caret);
                    });
                }
                onChange(next);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={spelling ? (e) => { if (!assist.handleKeyDown(e)) onKeyDown?.(e); } : onKeyDown}
            rows={rows}
            placeholder={placeholder}
            maxLength={maxLength}
            disabled={disabled}
            autoFocus={autoFocus}
            aria-label={ariaLabel}
            style={{
                flex: 1,
                minWidth: 0,
                border: "none",
                outline: "none",
                background: "transparent",
                resize: "none",
                fontSize: 14,
                lineHeight: 1.6,
                color: colors.text,
                fontFamily: "inherit",
                display: "block",
                ...(spelling ? { position: "relative" as const, zIndex: 1 } : null),
            }}
        />
    );

    return (
        <div style={{ display: "grid", gap: 6, ...style }}>
            <div
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                style={{
                    border: `2px solid ${borderColor}`,
                    borderRadius: 12,
                    background: "#fff",
                    boxShadow,
                    transition: "border-color .2s, box-shadow .2s",
                    opacity: disabled ? 0.6 : 1,
                    padding: "10px 12px",
                    display: "flex",
                    alignItems: "flex-end",
                    gap: 8,
                }}
            >
                {spelling ? (
                    <div style={{ position: "relative", flex: 1, minWidth: 0, display: "flex" }}>
                        {textarea}
                        {assist.layer}
                        {assist.description}
                    </div>
                ) : textarea}
                {action}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1 }}>
                    {error && <ErrorText>{error}</ErrorText>}
                    {spelling && <SpellingSummary groupId={spelling.groupId ?? spelling.fieldId} />}
                </div>
                {maxLength && showCount && (
                    <span style={{ fontSize: 11, color: colors.counter, flexShrink: 0 }}>
                        {(value ?? "").length}/{maxLength}
                    </span>
                )}
            </div>
        </div>
    );
}
