import React, { useState } from "react";
import ErrorText from "./error_text";

type Props = {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    rows?: number;
    maxLength?: number;
    disabled?: boolean;
    error?: string;
    autoFocus?: boolean;
    /** Show a live character counter (only when `maxLength` is set). Default true. */
    showCount?: boolean;
    /** Optional control rendered inside the box, bottom-right (e.g. a send button). */
    action?: React.ReactNode;
    /** Ref to the underlying textarea (e.g. for cursor position / focus). */
    inputRef?: React.Ref<HTMLTextAreaElement>;
    onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
    style?: React.CSSProperties;
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
    showCount = true,
    action,
    inputRef,
    onKeyDown,
    style,
}: Props) {
    const [hovered, setHovered] = useState(false);
    const [focused, setFocused] = useState(false);

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
                <textarea
                    ref={inputRef}
                    value={value ?? ""}
                    onChange={(e) => onChange(e.target.value)}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    onKeyDown={onKeyDown}
                    rows={rows}
                    placeholder={placeholder}
                    maxLength={maxLength}
                    disabled={disabled}
                    autoFocus={autoFocus}
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
                    }}
                />
                {action}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1 }}>{error && <ErrorText>{error}</ErrorText>}</div>
                {maxLength && showCount && (
                    <span style={{ fontSize: 11, color: colors.counter, flexShrink: 0 }}>
                        {(value ?? "").length}/{maxLength}
                    </span>
                )}
            </div>
        </div>
    );
}
