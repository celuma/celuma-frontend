import React, { useId, useState } from "react";
import { Select } from "antd";
import AlertText from "./error_text";

type Status = "default" | "error" | "warning" | "success";

type Option = { value: string; label: React.ReactNode };

type Props = {
    value?: string;
    onChange?: (v?: string) => void;
    options: Option[];
    placeholder?: string;
    error?: string;
    status?: Exclude<Status, "default" | "error">;
    disabled?: boolean;
    style?: React.CSSProperties;
    showSearch?: boolean;
};

export default function SelectField({ value, onChange, options, placeholder, error, status, disabled, style, showSearch = false }: Props) {
    const uid = useId();
    const [hovered, setHovered] = useState(false);
    const [focused, setFocused] = useState(false);
    const finalStatus: Status = error ? "error" : status ?? "default";
    const colors = {
        base: "#0f8b8d",
        baseHover: "#0c6f71",
        ringBase: "rgba(15,139,141,.18)",
        text: "#0d1b2a",
        bg: "#fff",
        error: "#b91c1c",
        ringError: "rgba(185, 28, 28, .12)",
        warning: "#f59e0b",
        ringWarning: "rgba(245, 158, 11, .12)",
        success: "#059669",
        ringSuccess: "rgba(5,150,105,.12)",
        placeholder: "#6b7280",
    };

    const { borderColor, boxShadow } = (() => {
        if (finalStatus === "error")  return { borderColor: colors.error,   boxShadow: `0 0 0 3px ${colors.ringError}` };
        if (finalStatus === "warning")return { borderColor: colors.warning, boxShadow: `0 0 0 3px ${colors.ringWarning}` };
        if (finalStatus === "success")return { borderColor: colors.success, boxShadow: `0 0 0 3px ${colors.ringSuccess}` };
        const active = hovered || focused;
        return { borderColor: active ? colors.baseHover : colors.base, boxShadow: active ? `0 0 0 3px ${colors.ringBase}` : "none" };
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
        <div style={{ display: "grid", gap: 6, ...style }} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
            <style>{`
              .sf-${uid} .ant-select-selector { 
                background: transparent !important; 
                border: none !important; 
                box-shadow: none !important; 
                height: 44px !important; 
                border-radius: 12px !important; 
                padding: 10px 12px !important; 
                display: flex !important;
                align-items: center !important;
              }
              .sf-${uid}.ant-select-focused .ant-select-selector,
              .sf-${uid}.ant-select-open .ant-select-selector { 
                border: none !important; 
                box-shadow: none !important; 
              }
              .sf-${uid} .ant-select-selection-item { 
                font-size: 16px !important; 
                line-height: 24px !important; 
                color: ${colors.text}; 
                font-family: inherit; 
                padding: 0 !important;
              }
              .sf-${uid} .ant-select-selection-placeholder { 
                font-size: 16px !important; 
                line-height: 24px !important; 
                color: ${colors.placeholder}; 
                font-family: inherit; 
                padding: 0 !important;
              }
              .sf-${uid} .ant-select-selection-search-input { 
                font-size: 16px !important; 
                line-height: 24px !important; 
                color: ${colors.text}; 
                font-family: inherit; 
              }
              .sf-${uid} .ant-select-arrow { 
                color: ${colors.base}; 
              }
              .sf-${uid}.ant-select-disabled .ant-select-selector { opacity: .6; }
            `}</style>
            <div style={wrapperStyle}>
                <Select
                    className={`sf-${uid}`}
                    value={value}
                    onChange={(v) => onChange?.(v)}
                    options={options}
                    placeholder={placeholder}
                    disabled={disabled}
                    showSearch={showSearch}
                    optionFilterProp="label"
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    style={{ width: "100%" }}
                    dropdownStyle={{ borderRadius: 12 }}
                    bordered={false}
                    allowClear
                />
            </div>

            {error && <AlertText variant="error">{error}</AlertText>}
            {!error && finalStatus === "warning" && <AlertText variant="warning">Advertencia</AlertText>}
            {!error && finalStatus === "success" && <AlertText variant="success">¡Todo correcto!</AlertText>}
        </div>
    );
}