import React, { useState } from "react";
import { Button as AntButton } from "antd";
import type { ButtonProps } from "antd";

type Props = ButtonProps & {
    fullWidth?: boolean;
};

/**
 * Céluma button system. Three skins driven by `type` + `danger`:
 *  - Primary  (type="primary")        → solid teal fill. With `danger` → solid red.
 *  - Secondary (no type / "default")  → outlined; neutral at rest, teal on hover.
 *                                        With `danger` (cancel/delete/etc.) → red on hover.
 *  - text / link / dashed             → passed straight through to antd untouched.
 */
const TEAL = { base: "#49b6ad", hover: "#3da8a0", active: "#2e9692", disabled: "#a8d4d0", tint: "#eaf7f5" };
const RED = { base: "#e5484d", hover: "#dc2626", active: "#b91c1c", disabled: "#f3b4b6", tint: "#fef2f2" };
const NEUTRAL = { border: "#d1d5db", text: "#374151", disabledBorder: "#e5e7eb", disabledText: "#9ca3af" };

export default function Button({
    fullWidth,
    style,
    danger,
    type,
    disabled,
    onMouseEnter,
    onMouseLeave,
    onMouseDown,
    onMouseUp,
    children,
    ...rest
}: Props) {
    const [hover, setHover] = useState(false);
    const [pressed, setPressed] = useState(false);

    const isPrimary = type === "primary";
    const isSecondary = type === undefined || type === "default";
    const pal = danger ? RED : TEAL;

    // text / link / dashed buttons keep antd's native look (compact icon/text buttons).
    if (!isPrimary && !isSecondary) {
        return (
            <AntButton
                {...rest}
                type={type}
                danger={danger}
                disabled={disabled}
                style={{ width: fullWidth ? "100%" : undefined, ...style }}
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
                onMouseDown={onMouseDown}
                onMouseUp={onMouseUp}
            >
                {children}
            </AntButton>
        );
    }

    const base: React.CSSProperties = {
        height: 44,
        fontSize: 16,
        fontWeight: 700,
        borderRadius: 999,
        padding: "0 28px",
        width: fullWidth ? "100%" : "auto",
        borderWidth: 2,
        borderStyle: "solid",
        transition: "background .15s, border-color .15s, color .15s, transform .05s",
        transform: pressed && !disabled ? "translateY(1px)" : "none",
        boxShadow: "none",
    };

    let skin: React.CSSProperties;
    if (isPrimary) {
        const bg = disabled ? pal.disabled : pressed ? pal.active : hover ? pal.hover : pal.base;
        skin = { backgroundColor: bg, borderColor: bg, color: "#fff", cursor: disabled ? "not-allowed" : "pointer" };
    } else {
        const borderColor = disabled ? NEUTRAL.disabledBorder : hover ? pal.base : NEUTRAL.border;
        const textColor = disabled ? NEUTRAL.disabledText : hover ? pal.base : NEUTRAL.text;
        const bg = !disabled && hover ? pal.tint : "#fff";
        skin = { backgroundColor: bg, borderColor, color: textColor, cursor: disabled ? "not-allowed" : "pointer" };
    }

    return (
        <AntButton
            {...rest}
            type={isPrimary ? "primary" : "default"}
            disabled={disabled}
            style={{ ...base, ...skin, ...style }}
            onMouseEnter={(e) => { if (!disabled) setHover(true); onMouseEnter?.(e); }}
            onMouseLeave={(e) => { setHover(false); setPressed(false); onMouseLeave?.(e); }}
            onMouseDown={(e) => { if (!disabled) setPressed(true); onMouseDown?.(e); }}
            onMouseUp={(e) => { setPressed(false); onMouseUp?.(e); }}
        >
            {children}
        </AntButton>
    );
}
