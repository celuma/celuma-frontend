import React, { useId, useState } from "react";
import { Input } from "antd";
import { EyeInvisibleOutlined, EyeTwoTone } from "@ant-design/icons";
import AlertText from "./error_text";

type Status = "default" | "error" | "warning" | "success";

type Props = Omit<React.ComponentProps<typeof Input>, "status" | "type" | "onChange" | "placeholder"> & {
    label: string;
    error?: string;
    status?: Exclude<Status, "default" | "error">;
    prefixNode?: React.ReactNode;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
};

export default function FloatingCaptionPassword({
    label,
    error,
    status,
    prefixNode,
    value,
    onChange,
    disabled,
    style,
    ...rest
}: Props) {
    const [hovered, setHovered] = useState(false);
    const [focused, setFocused] = useState(false);
    const [visible, setVisible] = useState(false);
    const uid = useId();
    
    const finalStatus: Status = error ? "error" : status ?? "default";
    const isFloating = focused || (value && String(value).length > 0);
    
    const colors = {
        base: "#0f8b8d",
        baseHover: "#0c6f71",
        ringBase: "rgba(15,139,141,.18)",
        text: "#0d1b2a",
        placeholder: "#6b7280",
        prefix: "#0f8b8d",
        error: "#b91c1c",
        ringError: "rgba(185, 28, 28, .12)",
        warning: "#f59e0b",
        ringWarning: "rgba(245, 158, 11, .12)",
        success: "#059669",
        ringSuccess: "rgba(5,150,105,.12)",
        bg: "#fff",
    };

    const { borderColor, boxShadow } = (() => {
        if (finalStatus === "error") {
            return { borderColor: colors.error, boxShadow: `0 0 8px 2px rgba(185, 28, 28, 0.15)` };
        }
        if (finalStatus === "warning") {
            return { borderColor: colors.warning, boxShadow: `0 0 8px 2px rgba(245, 158, 11, 0.15)` };
        }
        if (finalStatus === "success") {
            return { borderColor: colors.success, boxShadow: `0 0 8px 2px rgba(5, 150, 105, 0.15)` };
        }
        const active = hovered || focused;
        return {
            borderColor: active ? colors.baseHover : colors.base,
            boxShadow: active ? `0 0 0 3px ${colors.ringBase}` : "none",
        };
    })();

    const wrapperStyle: React.CSSProperties = {
        position: "relative",
        border: `2px solid ${borderColor}`,
        borderRadius: 12,
        background: colors.bg,
        transition: "border-color .2s, box-shadow .2s",
        display: "flex",
        alignItems: "center",
        boxShadow,
        opacity: disabled ? 0.6 : 1,
        minHeight: 56,
    };

    const labelStyle: React.CSSProperties = {
        position: "absolute",
        left: prefixNode ? 38 : 12,
        top: "50%",
        transform: isFloating
            ? "translateY(-36px) scale(0.85)"
            : "translateY(-50%)",
        transformOrigin: "left center",
        fontSize: isFloating ? 12 : 15,
        fontWeight: isFloating ? 600 : 400,
        color: isFloating 
            ? (finalStatus === "error" ? colors.error 
                : finalStatus === "warning" ? colors.warning 
                : finalStatus === "success" ? colors.success 
                : colors.base)
            : colors.placeholder,
        transition: "transform 0.2s ease, font-size 0.2s ease, color 0.2s ease, font-weight 0.2s ease",
        pointerEvents: "none",
        background: isFloating ? colors.bg : "transparent",
        padding: isFloating ? "0 6px" : "0",
        whiteSpace: "nowrap",
        borderRadius: isFloating ? 6 : 0,
    };

    const prefixStyle: React.CSSProperties = {
        color: finalStatus === "error" ? colors.error 
            : finalStatus === "warning" ? colors.warning 
            : finalStatus === "success" ? colors.success 
            : colors.prefix,
        marginRight: 8,
        display: "flex",
        alignItems: "center",
        paddingLeft: 10,
        zIndex: 1,
    };

    const inputStyle: React.CSSProperties = {
        background: "transparent",
        border: "none",
        boxShadow: "none",
        padding: isFloating ? "16px 12px 6px 12px" : "10px 12px",
        color: colors.text,
        flex: 1,
        transition: "padding 0.2s ease",
    };

    const toggleBtnStyle: React.CSSProperties = {
        border: "none",
        background: "transparent",
        cursor: "pointer",
        padding: "0 12px 0 6px",
        display: "flex",
        alignItems: "center",
        fontSize: 18,
        color: "#94a3b8",
        zIndex: 1,
    };

    return (
        <div
            style={{ display: "grid", gap: 6, ...style }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            <div style={wrapperStyle}>
                {prefixNode && <span style={prefixStyle}>{prefixNode}</span>}

                <label htmlFor={`input-${uid}`} style={labelStyle}>
                    {label}
                </label>

                <Input
                    {...rest}
                    id={`input-${uid}`}
                    disabled={disabled}
                    value={typeof value === "string" || typeof value === "number" || typeof value === "undefined" ? value : ""}
                    onChange={onChange}
                    type={visible ? "text" : "password"}
                    bordered={false}
                    style={inputStyle}
                    onFocus={(e) => {
                        setFocused(true);
                        rest.onFocus?.(e);
                    }}
                    onBlur={(e) => {
                        setFocused(false);
                        rest.onBlur?.(e);
                    }}
                />

                <button
                    type="button"
                    aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
                    onClick={() => setVisible((v) => !v)}
                    style={toggleBtnStyle}
                >
                    {visible ? <EyeTwoTone twoToneColor="#0f8b8d" /> : <EyeInvisibleOutlined />}
                </button>
            </div>

            {error && <AlertText variant="error">{error}</AlertText>}
            {!error && finalStatus === "warning" && (
                <AlertText variant="warning">{rest["aria-describedby"] ?? "Advertencia"}</AlertText>
            )}
            {!error && finalStatus === "success" && (
                <AlertText variant="success">{rest["aria-describedby"] ?? "¡Todo correcto!"}</AlertText>
            )}
        </div>
    );
}
