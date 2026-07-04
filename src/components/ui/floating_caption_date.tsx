import React, { useEffect, useId, useRef, useState } from "react";
import { DatePicker } from "antd";
import dayjs from "dayjs";
import FieldMessage from "./field_message";

/** How long a validation message stays on screen before auto-hiding. */
const MESSAGE_AUTO_HIDE_MS = 5000;

type Status = "default" | "error" | "warning" | "success";

type Props = {
    label: React.ReactNode;
    value?: string;
    onChange?: (value: string) => void;
    placeholder?: string;
    error?: string;
    status?: Exclude<Status, "default" | "error">;
    requiredMark?: boolean;
    disabled?: boolean;
    style?: React.CSSProperties;
};

function parseToDayjs(value?: string | null) {
    if (!value) return null;
    const v = String(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
    const dt = dayjs(v);
    return dt.isValid() ? dt : null;
}

/**
 * FloatingCaptionDate — a date picker that matches FloatingCaptionInput /
 * FloatingCaptionSelect exactly (outlined teal box, 56px height, floating
 * caption label, required asterisk and inline error message). The calendar
 * popup is themed with Céluma teal so it never looks like the generic antd one.
 */
export default function FloatingCaptionDate({
    label,
    value,
    onChange,
    placeholder,
    error,
    status,
    requiredMark = false,
    disabled,
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
              .fcd-${uid} { display: flex !important; width: 100% !important; height: 52px !important; align-items: center; }
              .fcd-${uid} .ant-picker { background: transparent !important; border: none !important; box-shadow: none !important; height: 52px !important; padding: 0 12px !important; width: 100% !important; }
              .fcd-${uid} .ant-picker-input > input { font-size: 15px !important; color: ${colors.text}; font-family: inherit; }
              /* Keep the native placeholder invisible — the floating caption is the label. */
              .fcd-${uid} .ant-picker-input > input::placeholder { color: transparent !important; }
              .fcd-${uid} .ant-picker-suffix,
              .fcd-${uid} .ant-picker-clear { color: ${borderColor}; }
              .fcd-${uid} .ant-picker-clear { background: ${colors.bg}; }

              /* Céluma-themed calendar popup */
              .fcd-pop-${uid} .ant-picker-panel-container { border-radius: 14px; box-shadow: 0 10px 30px rgba(13,27,42,.12); }
              .fcd-pop-${uid} .ant-picker-header { color: ${colors.text}; }
              .fcd-pop-${uid} .ant-picker-header button:hover { color: ${colors.base}; }
              .fcd-pop-${uid} .ant-picker-cell-in-view.ant-picker-cell-today .ant-picker-cell-inner::before { border-color: ${colors.base} !important; border-radius: 8px; }
              .fcd-pop-${uid} .ant-picker-cell .ant-picker-cell-inner { border-radius: 8px; transition: background .15s, color .15s; }
              .fcd-pop-${uid} .ant-picker-cell-in-view:hover .ant-picker-cell-inner { background: ${colors.ringBase} !important; }
              .fcd-pop-${uid} .ant-picker-cell-in-view.ant-picker-cell-selected .ant-picker-cell-inner,
              .fcd-pop-${uid} .ant-picker-cell-in-view.ant-picker-cell-range-start .ant-picker-cell-inner,
              .fcd-pop-${uid} .ant-picker-cell-in-view.ant-picker-cell-range-end .ant-picker-cell-inner { background: ${colors.base} !important; color: #fff !important; }
              .fcd-pop-${uid} .ant-picker-today-btn { color: ${colors.base}; }
            `}</style>
            <div style={wrapperStyle}>
                <label style={labelStyle}>
                    {label}
                    {requiredMark && <span style={{ color: colors.error }}> *</span>}
                </label>
                <DatePicker
                    className={`fcd-${uid}`}
                    popupClassName={`fcd-pop-${uid}`}
                    value={parseToDayjs(value)}
                    onChange={(_, dateString) => onChange?.(Array.isArray(dateString) ? dateString[0] : dateString)}
                    format={{ format: "YYYY-MM-DD", type: "mask" }}
                    placeholder={placeholder ?? ""}
                    disabled={disabled}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    onOpenChange={setOpen}
                    style={{ width: "100%" }}
                    variant="borderless"
                    allowClear
                />
            </div>

            {error && (
                <FieldMessage variant="error" open={msgVisible}>{error}</FieldMessage>
            )}
        </div>
    );
}
