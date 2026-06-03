import React, { useState } from "react";
import { Button as AntButton } from "antd";
import type { ButtonProps } from "antd";

type Props = Omit<ButtonProps, "size"> & {
    fullWidth?: boolean;
    /** Visual size: default pill CTA, `small` compact rectangular, `xsmall` for tight corners. */
    size?: "default" | "small" | "xsmall";
};

/**
 * Céluma button system. Three skins driven by `type` + `danger`:
 *  - Primary  (type="primary")        → solid teal fill. With `danger` → solid red.
 *  - Secondary (no type / "default")  → outlined; neutral at rest, teal on hover.
 *                                        With `danger` (cancel/delete/etc.) → red on hover.
 *  - text / link / dashed             → passed straight through to antd untouched.
 *
 * Sizes: `default` is the tall pill CTA; `small` is a compact rectangular
 * action button (detail headers, toolbars); `xsmall` is an even tighter chip
 * for corners / dense layouts.
 */
const TEAL = { base: "#49b6ad", hover: "#3da8a0", active: "#2e9692", disabled: "#a8d4d0", tint: "#eaf7f5" };
const RED = { base: "#e5484d", hover: "#dc2626", active: "#b91c1c", disabled: "#f3b4b6", tint: "#fef2f2" };
const NEUTRAL = { border: "#d1d5db", text: "#374151", disabledBorder: "#e5e7eb", disabledText: "#9ca3af" };

export default function Button({
    fullWidth,
    style,
    danger,
    type,
    size,
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
    const small = size === "small";
    const xsmall = size === "xsmall";
    const iconOnly = children == null || children === false;
    const pal = danger ? RED : TEAL;
    const antdSize = small || xsmall ? "small" : undefined;
    const dim = xsmall ? 30 : small ? 38 : 44;

    // text / link / dashed buttons keep antd's native look (compact icon/text buttons).
    if (!isPrimary && !isSecondary) {
        return (
            <AntButton
                {...rest}
                type={type}
                danger={danger}
                size={antdSize}
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
        height: dim,
        width: iconOnly ? dim : fullWidth ? "100%" : "auto",
        fontSize: xsmall ? 13 : small ? 14 : 16,
        fontWeight: xsmall || small ? 600 : 700,
        borderRadius: xsmall ? 8 : small ? 10 : 999,
        padding: iconOnly ? 0 : xsmall ? "0 12px" : small ? "0 16px" : "0 28px",
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
    } else if (iconOnly) {
        // Borderless icon button: transparent until hover, then a soft tint — sits cleanly inside a Panel.
        const color = disabled ? NEUTRAL.disabledText : hover ? pal.base : NEUTRAL.text;
        const bg = !disabled && hover ? pal.tint : "transparent";
        skin = { backgroundColor: bg, borderColor: "transparent", color, cursor: disabled ? "not-allowed" : "pointer" };
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
