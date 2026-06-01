import React, { useEffect, useId, useState } from "react";
import { Input } from "antd";
import { EyeInvisibleOutlined, EyeTwoTone } from "@ant-design/icons";
import AlertText from "./error_text";

/** How long a validation message stays on screen before auto-hiding. */
const MESSAGE_AUTO_HIDE_MS = 5000;

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
    const [msgVisible, setMsgVisible] = useState(true);
    const uid = useId();

    const finalStatus: Status = error ? "error" : status ?? "default";

    // Show the message when it appears/changes, then auto-hide after a while.
    useEffect(() => {
        if (!error && finalStatus === "default") return;
        setMsgVisible(true);
        const t = setTimeout(() => setMsgVisible(false), MESSAGE_AUTO_HIDE_MS);
        return () => clearTimeout(t);
    }, [error, finalStatus]);
    const isFloating = focused || (value && String(value).length > 0);
    
    const colors = {
        base: "#49b6ad",
        baseHover: "#3da8a0",
        ringBase: "rgba(73,182,173,.20)",
        text: "#0d1b2a",
        placeholder: "#6b7280",
        prefix: "#49b6ad",
        error: "#e5484d",
        ringError: "rgba(229, 72, 77, .20)",
        warning: "#f59e0b",
        ringWarning: "rgba(245, 158, 11, .20)",
        success: "#059669",
        ringSuccess: "rgba(5,150,105,.20)",
        bg: "#fff",
    };

    const { borderColor, boxShadow } = (() => {
        const active = hovered || focused;
        const ring = (c: string) => (active ? `0 0 0 3px ${c}` : "none");
        if (finalStatus === "error") return { borderColor: colors.error, boxShadow: ring(colors.ringError) };
        if (finalStatus === "warning") return { borderColor: colors.warning, boxShadow: ring(colors.ringWarning) };
        if (finalStatus === "success") return { borderColor: colors.success, boxShadow: ring(colors.ringSuccess) };
        return {
            borderColor: active ? colors.baseHover : colors.base,
            boxShadow: ring(colors.ringBase),
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
        padding: "10px 12px",
        color: colors.text,
        flex: 1,
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
            style={{ position: "relative", ...style }}
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
                        setMsgVisible(true);
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
                    {visible ? <EyeTwoTone twoToneColor="#49b6ad" /> : <EyeInvisibleOutlined />}
                </button>
            </div>

            {msgVisible && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20 }}>
                    {error && <AlertText variant="error">{error}</AlertText>}
                    {!error && finalStatus === "warning" && (
                        <AlertText variant="warning">{rest["aria-describedby"] ?? "Advertencia"}</AlertText>
                    )}
                    {!error && finalStatus === "success" && (
                        <AlertText variant="success">{rest["aria-describedby"] ?? "¡Todo correcto!"}</AlertText>
                    )}
                </div>
            )}
        </div>
    );
}
