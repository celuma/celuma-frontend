import React, { useId, useState } from "react";
import { Input } from "antd";
import AlertText from "./error_text";

type Status = "default" | "error" | "warning" | "success";

type Props = Omit<React.ComponentProps<typeof Input>, "status" | "onChange"> & {
    error?: string;
    status?: Exclude<Status, "default" | "error">;
    prefixNode?: React.ReactNode;
    showClear?: boolean;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
};

export default function TextField({error, status, prefixNode, showClear = false, value, onChange, disabled, style, ...rest}: Props) {
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
        prefix: "#0f8b8d",
        clear: "#94a3b8",
        clearHover: "#64748b",
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
    const prefixStyle: React.CSSProperties = {
        color: colors.prefix,
        marginRight: 8,
        display: "flex",
        alignItems: "center",
        paddingLeft: 10,
    };
    const inputStyle: React.CSSProperties = {
        background: "transparent",
        border: "none",
        boxShadow: "none",
        padding: "10px 12px",
        color: colors.text,
        flex: 1,
    };
    const clearStyle: React.CSSProperties = {
        border: "none",
        background: "transparent",
        cursor: "pointer",
        padding: "0 10px 0 6px",
        color: colors.clear,
        lineHeight: 1,
        fontSize: 16,
    };

    return (
        <div
            style={{ display: "grid", gap: 6, ...style }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            <style>{`.tf-${uid}::placeholder{color:${colors.placeholder};opacity:1;}`}</style>

            <div style={wrapperStyle}>
                {prefixNode && <span style={prefixStyle}>{prefixNode}</span>}

                <Input
                    {...rest}
                    disabled={disabled}
                    value={typeof value === "string" || typeof value === "number" || typeof value === "undefined" ? value : ""}
                    onChange={onChange}
                    bordered={false}
                    className={`tf-${uid}`}
                    style={inputStyle}
                    onFocus={(e) => { setFocused(true);  rest.onFocus?.(e); }}
                    onBlur={(e)  => { setFocused(false); rest.onBlur?.(e);  }}
                />

                {showClear && typeof value === "string" && value.length > 0 && !disabled && (
                    <button
                        type="button"
                        aria-label="Limpiar"
                        onClick={() => {
                            const event = { target: { value: "" } } as unknown as React.ChangeEvent<HTMLInputElement>;
                            onChange?.(event);
                        }}
                        style={clearStyle}
                        onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = colors.clearHover)}
                        onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = colors.clear)}
                    >
                        ×
                    </button>
                )}
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
