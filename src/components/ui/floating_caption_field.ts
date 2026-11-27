import type React from "react";
import { useCallback, useEffect, useState } from "react";
import "./floating_caption_select.css";

/**
 * Céluma 1.5 (#85 follow-up): the one field-level look shared by the floating-caption dropdowns
 * (FloatingCaptionSelect and FloatingCaptionMultiSelect). Both wrappers draw their outline, focus
 * treatment and caption from here, so a dropdown never needs page-level focus or alignment styles.
 * See CELUMA_DESIGN_SYSTEM.md §4 "Form fields".
 */

export type FieldStatus = "default" | "error" | "warning" | "success";

export const FIELD_COLORS = {
    base: "#49b6ad",
    baseHover: "#3da8a0",
    ringBase: "rgba(73,182,173,.20)",
    text: "#0d1b2a",
    placeholder: "#6b7280",
    bg: "#fff",
    error: "#e5484d",
    ringError: "rgba(229, 72, 77, .20)",
    glowError: "rgba(229, 72, 77, .28)",
    warning: "#f59e0b",
    ringWarning: "rgba(245, 158, 11, .20)",
    glowWarning: "rgba(245, 158, 11, .28)",
    success: "#059669",
    ringSuccess: "rgba(5,150,105,.20)",
    glowSuccess: "rgba(5,150,105,.25)",
} as const;

/**
 * Keyboard focus darkens the field's own 2px border; nothing is drawn inside or around it apart
 * from the usual soft ring. Every colour keeps at least 4.5:1 against the white field and page
 * (#1f7a75 5.1:1, #c62a2f 5.6:1, #b45309 5.0:1, #047857 5.5:1), so the indicator is visible
 * without a second outline. Pointer focus keeps the lighter hover border, as before.
 */
export const FIELD_FOCUS_BORDER: Record<FieldStatus, string> = {
    default: "#1f7a75",
    error: "#c62a2f",
    warning: "#b45309",
    success: "#047857",
};

/** The 56px outlined box, its 2px border, and the field's 52px inner height. */
export const FIELD_HEIGHT = 56;
export const FIELD_INNER_HEIGHT = 52;

/** Classes for the shared popup (radius, option rhythm, wrapping long labels). */
export const FIELD_POPUP_CLASS = "fc-select-popup";

export function fieldChrome(status: FieldStatus, active: boolean, keyboardFocus: boolean) {
    const c = FIELD_COLORS;
    const shadow = (ringC: string, glowC: string) => (active ? `0 0 0 3px ${ringC}` : `0 0 8px 2px ${glowC}`);
    const base = (() => {
        if (status === "error") return { borderColor: c.error, boxShadow: shadow(c.ringError, c.glowError) };
        if (status === "warning") return { borderColor: c.warning, boxShadow: shadow(c.ringWarning, c.glowWarning) };
        if (status === "success") return { borderColor: c.success, boxShadow: shadow(c.ringSuccess, c.glowSuccess) };
        return { borderColor: active ? c.baseHover : c.base, boxShadow: active ? `0 0 0 3px ${c.ringBase}` : "none" };
    })();
    return keyboardFocus ? { ...base, borderColor: FIELD_FOCUS_BORDER[status] } : base;
}

/** Caption colour once floated (status colour), or the placeholder grey while it sits inside. */
export function captionColor(status: FieldStatus, floating: boolean): string {
    if (!floating) return FIELD_COLORS.placeholder;
    if (status === "error") return FIELD_COLORS.error;
    if (status === "warning") return FIELD_COLORS.warning;
    if (status === "success") return FIELD_COLORS.success;
    return FIELD_COLORS.base;
}

/**
 * The caption. Resting, it is centred in the 52px inner box like a placeholder. Floated, its
 * centre sits on the middle of the 2px top border (`top: -1px`, i.e. one pixel above the padding
 * box), and its white background is the cutout. The same rule holds however tall the field grows.
 */
export function captionStyle(status: FieldStatus, floating: boolean): React.CSSProperties {
    return {
        position: "absolute",
        left: 12,
        top: floating ? -1 : FIELD_INNER_HEIGHT / 2,
        transform: floating ? "translateY(-50%) scale(0.85)" : "translateY(-50%)",
        transformOrigin: "left center",
        fontSize: floating ? 12 : 15,
        fontWeight: floating ? 600 : 400,
        lineHeight: "16px",
        color: captionColor(status, floating),
        transition: "transform 0.2s ease, top 0.2s ease, font-size 0.2s ease, color 0.2s ease, font-weight 0.2s ease",
        pointerEvents: "none",
        background: floating ? FIELD_COLORS.bg : "transparent",
        padding: floating ? "0 6px" : "0",
        whiteSpace: "nowrap",
        borderRadius: floating ? 6 : 0,
        maxWidth: "calc(100% - 44px)",
        overflow: "hidden",
        textOverflow: "ellipsis",
        zIndex: 3,
    };
}

// ── Input modality ────────────────────────────────────────────────────────────
// The antd Select's search input matches :focus-visible on every focus (it is a text input), so
// the browser cannot tell a click from a Tab here. One document-level listener records the last
// modality; a field focused right after a key press shows the keyboard indicator.
let lastModality: "keyboard" | "pointer" = "pointer";
let listening = false;
function listen() {
    if (listening || typeof document === "undefined") return;
    listening = true;
    document.addEventListener("keydown", (e) => { if (!e.metaKey && !e.ctrlKey && !e.altKey) lastModality = "keyboard"; }, true);
    document.addEventListener("pointerdown", () => { lastModality = "pointer"; }, true);
    document.addEventListener("mousedown", () => { lastModality = "pointer"; }, true);
}

/**
 * Whether the field currently has keyboard focus: focus that arrived from the keyboard, or any key
 * pressed inside the field afterwards (arrows, Enter, typing). A pointer press inside resets it.
 */
export function useKeyboardFocus() {
    const [keyboardFocus, setKeyboardFocus] = useState(false);
    useEffect(listen, []);
    const onFocus = useCallback(() => setKeyboardFocus(lastModality === "keyboard"), []);
    const onBlur = useCallback(() => setKeyboardFocus(false), []);
    const onKeyDown = useCallback(() => setKeyboardFocus(true), []);
    const onPointerDown = useCallback(() => setKeyboardFocus(false), []);
    return { keyboardFocus, onFocus, onBlur, onKeyDown, onPointerDown };
}

/** Joins the shared popup class with a consumer's own (catalog/person popups keep theirs). */
export function popupClassNames<T extends { popup?: { root?: string } } | undefined>(classNames: T) {
    const root = [FIELD_POPUP_CLASS, classNames?.popup?.root].filter(Boolean).join(" ");
    return { ...(classNames ?? {}), popup: { ...(classNames?.popup ?? {}), root } };
}
