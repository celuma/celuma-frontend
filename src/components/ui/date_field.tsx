import React, { useId, useState } from "react";
import { DatePicker } from "antd";
import AlertText from "./error_text";
import dayjs from "dayjs";

type Status = "default" | "error" | "warning" | "success";

type Props = {
    value?: string;
    error?: string;
    status?: Exclude<Status, "default" | "error">;
    disabled?: boolean;
    placeholder?: string;
    style?: React.CSSProperties;
    onChange?: (value: string) => void;
};

function parseToDayjs(value?: string | null) {
    if (!value) return null;
    const v = String(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
    const dt = dayjs(v);
    return dt.isValid() ? dt : null;
}

export default function DateField({ value, onChange, error, status, disabled, style, placeholder = "Fecha (AAAA-MM-DD)" }: Props) {
    const uid = useId();
    const [hovered, setHovered] = useState(false);
    const [focused, setFocused] = useState(false);
    const finalStatus: Status = error ? "error" : status ?? "default";

    const colors = {
        base: "#0f8b8d",
        baseHover: "#0c6f71",
        ringBase: "rgba(15,139,141,.18)",
        text: "#0d1b2a",
        placeholder: "#6b7280",
        error: "#b91c1c",
        ringError: "rgba(185, 28, 28, .12)",
        warning: "#f59e0b",
        ringWarning: "rgba(245, 158, 11, .12)",
        success: "#059669",
        ringSuccess: "rgba(5,150,105,.12)",
        bg: "#fff",
    };

    const { borderColor, boxShadow } = (() => {
        if (finalStatus === "error")  return { borderColor: colors.error,   boxShadow: `0 0 0 3px ${colors.ringError}` };
        if (finalStatus === "warning")return { borderColor: colors.warning, boxShadow: `0 0 0 3px ${colors.ringWarning}` };
        if (finalStatus === "success")return { borderColor: colors.success, boxShadow: `0 0 0 3px ${colors.ringSuccess}` };
        const active = hovered || focused;
        return {
            borderColor: active ? colors.baseHover : colors.base,
            boxShadow: active ? `0 0 0 3px ${colors.ringBase}` : "none",
        };
    })();

    const wrapperStyle: React.CSSProperties = {
        border: `2px solid ${borderColor}`,
        borderRadius: 12,
        background: colors.bg,
        transition: "border-color .2s, box-shadow .2s",
        display: "flex",
        alignItems: "center",
        position: "relative",
        boxShadow,
        opacity: disabled ? 0.6 : 1,
    };

    return (
        <div
            style={{ display: "grid", gap: 6, ...style }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            <style>{`
              .df-${uid} .ant-picker { 
                background: transparent !important; 
                border: none !important; 
                box-shadow: none !important; 
                height: 44px !important; 
                border-radius: 12px !important; 
                padding: 10px 12px !important; 
                width: 100% !important;
              }
              .df-${uid} .ant-picker-focused { 
                border: none !important; 
                box-shadow: none !important; 
              }
              .df-${uid} .ant-picker-input input { 
                font-size: 16px !important; 
                line-height: 24px !important; 
                color: ${colors.text}; 
                font-family: inherit; 
                padding: 0 !important;
              }
              .df-${uid} .ant-picker-input input::placeholder { 
                color: ${colors.placeholder}; 
              }
              .df-${uid} .ant-picker-suffix { 
                color: ${colors.base}; 
              }
              .df-${uid}.ant-picker-disabled .ant-picker { opacity: .6; }
            `}</style>
            <div style={wrapperStyle}>
                <DatePicker
                    className={`df-${uid}`}
                    value={parseToDayjs(value)}
                    onChange={(_, dateString) => onChange?.(Array.isArray(dateString) ? dateString[0] : dateString)}
                    format={{
                        format: 'YYYY-MM-DD',
                        type: 'mask',
                    }}
                    placeholder={placeholder}
                    disabled={disabled}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    style={{ width: "100%" }}
                    bordered={false}
                    allowClear
                />
            </div>

            {error && <AlertText variant="error">{error}</AlertText>}
            {!error && finalStatus === "warning" && (
                <AlertText variant="warning">Advertencia</AlertText>
            )}
            {!error && finalStatus === "success" && (
                <AlertText variant="success">¡Todo correcto!</AlertText>
            )}
        </div>
    );
}