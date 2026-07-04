import React, { useEffect, useId, useRef, useState } from "react";
import { Input } from "antd";
import { EyeInvisibleOutlined, EyeTwoTone } from "@ant-design/icons";
import FieldMessage from "./field_message";

/** How long a validation message stays on screen before auto-hiding. */
const MESSAGE_AUTO_HIDE_MS = 5000;

type Status = "default" | "error" | "warning" | "success";

type Props = Omit<React.ComponentProps<typeof Input>, "status" | "type" | "onChange" | "placeholder"> & {
    label: string;
    error?: string;
    status?: Exclude<Status, "default" | "error">;
    prefixNode?: React.ReactNode;
    requiredMark?: boolean;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
};

export default function FloatingCaptionPassword({
    label,
    error,
    status,
    prefixNode,
    requiredMark = false,
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
    const hasMessage = !!error || finalStatus === "warning" || finalStatus === "success";
    const active = hovered || focused;
    const shownRef = useRef(false);

    // The chin appears once when a message is (re)triggered, then auto-hides. Hovering or
    // focusing "focuses" the glow into the crisp ring and dismisses the chin for good — it
    // won't pop back when the pointer leaves; it only returns if the error is provoked anew.
    useEffect(() => {
        if (!hasMessage) {
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
    }, [error, finalStatus, hasMessage, active]);
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
        glowError: "rgba(229, 72, 77, .28)",
        warning: "#f59e0b",
        ringWarning: "rgba(245, 158, 11, .20)",
        glowWarning: "rgba(245, 158, 11, .28)",
        success: "#059669",
        ringSuccess: "rgba(5,150,105,.20)",
        glowSuccess: "rgba(5,150,105,.25)",
        bg: "#fff",
    };

    // Attention glow when idle; crisp double-border ring when focused/hovered.
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

    const wrapperStyle: React.CSSProperties = {
        position: "relative",
        zIndex: 2,
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
            style={{ position: "relative", zIndex: active ? 30 : (finalStatus !== "default" ? 20 : 1), ...style }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            <div style={wrapperStyle}>
                {prefixNode && <span style={prefixStyle}>{prefixNode}</span>}

                <label htmlFor={`input-${uid}`} style={labelStyle}>
                    {label}
                    {requiredMark && <span style={{ color: colors.error }}> *</span>}
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
                    {visible ? <EyeTwoTone twoToneColor="#49b6ad" /> : <EyeInvisibleOutlined />}
                </button>
            </div>

            {hasMessage && (
                <FieldMessage variant={finalStatus === "default" ? "error" : finalStatus} open={msgVisible}>
                    {error
                        ? error
                        : finalStatus === "warning"
                            ? (rest["aria-describedby"] ?? "Advertencia")
                            : (rest["aria-describedby"] ?? "¡Todo correcto!")}
                </FieldMessage>
            )}
        </div>
    );
}
