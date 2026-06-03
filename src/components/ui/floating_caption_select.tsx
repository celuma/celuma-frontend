import React, { useEffect, useId, useRef, useState } from "react";
import { Select } from "antd";
import FieldMessage from "./field_message";

/** How long a validation message stays on screen before auto-hiding. */
const MESSAGE_AUTO_HIDE_MS = 5000;

type Status = "default" | "error" | "warning" | "success";

type Option = { value: string; label: React.ReactNode };

type Props = {
    label: React.ReactNode;
    value?: string;
    onChange?: (v?: string) => void;
    options: Option[];
    placeholder?: string;
    error?: string;
    status?: Exclude<Status, "default" | "error">;
    requiredMark?: boolean;
    disabled?: boolean;
    showSearch?: boolean;
    allowClear?: boolean;
    style?: React.CSSProperties;
};

/**
 * FloatingCaptionSelect — a Select that matches FloatingCaptionInput exactly
 * (same outlined teal box, 56px height, floating caption label and required
 * asterisk). Use it next to FloatingCaptionInput so dropdowns and text boxes
 * share one consistent look across forms.
 */
export default function FloatingCaptionSelect({
    label,
    value,
    onChange,
    options,
    placeholder,
    error,
    status,
    requiredMark = false,
    disabled,
    showSearch = false,
    allowClear = true,
    style,
}: Props) {
    const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
    const [hovered, setHovered] = useState(false);
    const [focused, setFocused] = useState(false);
    const [open, setOpen] = useState(false);
    const [msgVisible, setMsgVisible] = useState(true);

    const finalStatus: Status = error ? "error" : status ?? "default";
    const active = hovered || focused || open;
    const shownRef = useRef(false);

    // The chin appears once when the error is (re)triggered, then auto-hides. Hovering,
    // focusing or opening "focuses" the glow into the crisp ring and dismisses the chin
    // for good — it won't pop back when the pointer leaves; it only returns if the error
    // is provoked anew.
    useEffect(() => {
        if (!error) {
            shownRef.current = false;
            setMsgVisible(false);
            return;
        }
        if (active) {
            setMsgVisible(false);
            return;
        }
        if (!shownRef.current) {
            shownRef.current = true;
            setMsgVisible(true);
            const t = setTimeout(() => setMsgVisible(false), MESSAGE_AUTO_HIDE_MS);
            return () => clearTimeout(t);
        }
    }, [error, active]);
    const isFloating = focused || open || (value !== undefined && value !== "" && value !== null);

    const colors = {
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
    };

    // Attention glow when idle; crisp double-border ring when focused/open/hovered.
    const { borderColor, boxShadow } = (() => {
        const shadow = (ringC: string, glowC: string) => (active ? `0 0 0 3px ${ringC}` : `0 0 8px 2px ${glowC}`);
        if (finalStatus === "error") return { borderColor: colors.error, boxShadow: shadow(colors.ringError, colors.glowError) };
        if (finalStatus === "warning") return { borderColor: colors.warning, boxShadow: shadow(colors.ringWarning, colors.glowWarning) };
        if (finalStatus === "success") return { borderColor: colors.success, boxShadow: shadow(colors.ringSuccess, colors.glowSuccess) };
        return {
            borderColor: active ? colors.baseHover : colors.base,
            boxShadow: active ? `0 0 0 3px ${colors.ringBase}` : "none",
        };
    })();
    const elevated = active || finalStatus !== "default";

    const wrapperStyle: React.CSSProperties = {
        position: "relative",
        zIndex: 2,
        border: `2px solid ${borderColor}`,
        borderRadius: 12,
        background: colors.bg,
        transition: "border-color .2s, box-shadow .2s",
        boxShadow,
        opacity: disabled ? 0.6 : 1,
        height: 56,
        boxSizing: "border-box",
    };

    const labelColor = isFloating
        ? (finalStatus === "error" ? colors.error
            : finalStatus === "warning" ? colors.warning
            : finalStatus === "success" ? colors.success
            : colors.base)
        : colors.placeholder;

    const labelStyle: React.CSSProperties = {
        position: "absolute",
        left: 12,
        top: "50%",
        transform: isFloating ? "translateY(-36px) scale(0.85)" : "translateY(-50%)",
        transformOrigin: "left center",
        fontSize: isFloating ? 12 : 15,
        fontWeight: isFloating ? 600 : 400,
        color: labelColor,
        transition: "transform 0.2s ease, font-size 0.2s ease, color 0.2s ease, font-weight 0.2s ease",
        pointerEvents: "none",
        background: isFloating ? colors.bg : "transparent",
        padding: isFloating ? "0 6px" : "0",
        whiteSpace: "nowrap",
        borderRadius: isFloating ? 6 : 0,
        zIndex: 2,
    };

    return (
        <div
            style={{ position: "relative", zIndex: active ? 30 : elevated ? 20 : 1, ...style }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            <style>{`
              .fcs-${uid} { display: block !important; width: 100% !important; height: 52px !important; }
              .fcs-${uid} .ant-select-selector {
                background: transparent !important;
                border: none !important;
                box-shadow: none !important;
                height: 52px !important;
                border-radius: 12px !important;
                padding: 0 12px !important;
                display: flex !important;
                align-items: center !important;
              }
              .fcs-${uid}.ant-select-focused .ant-select-selector,
              .fcs-${uid}.ant-select-open .ant-select-selector { border: none !important; box-shadow: none !important; }
              .fcs-${uid} .ant-select-selection-item { font-size: 15px !important; line-height: 52px !important; color: ${colors.text}; padding: 0 !important; }
              .fcs-${uid} .ant-select-selection-search { inset-inline-start: 12px !important; inset-inline-end: 12px !important; }
              .fcs-${uid} .ant-select-selection-search-input { font-size: 15px !important; line-height: 52px !important; height: 52px !important; color: ${colors.text}; }
              .fcs-${uid} .ant-select-selection-placeholder { font-size: 15px !important; line-height: 52px !important; color: transparent !important; }
              .fcs-${uid} .ant-select-arrow,
              .fcs-${uid} .ant-select-clear { color: ${borderColor}; }
              .fcs-${uid} .ant-select-clear { background: ${colors.bg}; }
            `}</style>
            <div style={wrapperStyle}>
                <label style={labelStyle}>
                    {label}
                    {requiredMark && <span style={{ color: colors.error }}> *</span>}
                </label>
                <Select
                    className={`fcs-${uid}`}
                    value={value === "" ? undefined : value}
                    onChange={(v) => onChange?.(v)}
                    options={options}
                    placeholder={placeholder}
                    disabled={disabled}
                    showSearch={showSearch}
                    optionFilterProp="label"
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    onOpenChange={setOpen}
                    style={{ width: "100%" }}
                    variant="borderless"
                    dropdownStyle={{ borderRadius: 12 }}
                    allowClear={allowClear}
                />
            </div>

            {error && (
                <FieldMessage variant="error" open={msgVisible}>{error}</FieldMessage>
            )}
        </div>
    );
}
