import React, { useEffect, useId, useRef, useState } from "react";
import { Select } from "antd";
import FieldMessage from "./field_message";

/** How long a validation message stays on screen before auto-hiding. */
const MESSAGE_AUTO_HIDE_MS = 5000;

type Status = "default" | "error" | "warning" | "success";

type Option = { value: string; label: React.ReactNode };

type Props = {
    label: React.ReactNode;
    value?: string[];
    onChange?: (v: string[]) => void;
    options: Option[];
    placeholder?: string;
    error?: string;
    status?: Exclude<Status, "default" | "error">;
    requiredMark?: boolean;
    disabled?: boolean;
    allowClear?: boolean;
    style?: React.CSSProperties;
};

/**
 * FloatingCaptionMultiSelect — the multiple-selection sibling of
 * FloatingCaptionSelect. Same outlined teal box, floating caption label and
 * required asterisk, but auto-growing so selected tags wrap. Use it wherever a
 * form needs to pick several values (roles, branches, …) so multi-selects share
 * the same look as the rest of the Céluma fields.
 */
export default function FloatingCaptionMultiSelect({
    label,
    value,
    onChange,
    options,
    placeholder,
    error,
    status,
    requiredMark = false,
    disabled,
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

    const hasValue = Array.isArray(value) && value.length > 0;
    const isFloating = focused || open || hasValue;

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
        minHeight: 56,
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        padding: isFloating ? "8px 6px 6px" : "0 6px",
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
        top: isFloating ? 0 : "50%",
        transform: isFloating ? "translateY(-50%) scale(0.85)" : "translateY(-50%)",
        transformOrigin: "left center",
        fontSize: isFloating ? 12 : 15,
        fontWeight: isFloating ? 600 : 400,
        color: labelColor,
        transition: "transform 0.2s ease, top 0.2s ease, font-size 0.2s ease, color 0.2s ease, font-weight 0.2s ease",
        pointerEvents: "none",
        background: isFloating ? colors.bg : "transparent",
        padding: isFloating ? "0 6px" : "0",
        whiteSpace: "nowrap",
        borderRadius: isFloating ? 6 : 0,
        zIndex: 3,
    };

    return (
        <div
            style={{ position: "relative", zIndex: active ? 30 : elevated ? 20 : 1, ...style }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            <style>{`
              .fcms-${uid} { display: block !important; width: 100% !important; }
              .fcms-${uid} .ant-select-selector {
                background: transparent !important;
                border: none !important;
                box-shadow: none !important;
                border-radius: 12px !important;
                padding: 0 6px !important;
                min-height: 38px !important;
                display: flex !important;
                align-items: center !important;
              }
              .fcms-${uid}.ant-select-focused .ant-select-selector,
              .fcms-${uid}.ant-select-open .ant-select-selector { border: none !important; box-shadow: none !important; }
              .fcms-${uid} .ant-select-selection-item {
                background: ${colors.ringBase} !important;
                border: 1px solid ${colors.base}55 !important;
                color: ${colors.baseHover} !important;
                border-radius: 8px !important;
                font-size: 13px !important;
                font-weight: 500 !important;
              }
              .fcms-${uid} .ant-select-selection-search-input { font-size: 15px !important; color: ${colors.text}; }
              .fcms-${uid} .ant-select-selection-placeholder { font-size: 15px !important; color: transparent !important; }
              .fcms-${uid} .ant-select-arrow,
              .fcms-${uid} .ant-select-clear { color: ${borderColor}; }
              .fcms-${uid} .ant-select-clear { background: ${colors.bg}; }
            `}</style>
            <div style={wrapperStyle}>
                <label style={labelStyle}>
                    {label}
                    {requiredMark && <span style={{ color: colors.error }}> *</span>}
                </label>
                <Select
                    mode="multiple"
                    className={`fcms-${uid}`}
                    value={value ?? []}
                    onChange={(v) => onChange?.(v as string[])}
                    options={options}
                    placeholder={placeholder}
                    disabled={disabled}
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
