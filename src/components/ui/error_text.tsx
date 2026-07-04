import React, { useId } from "react";
import { ExclamationCircleFilled, CheckCircleFilled } from "@ant-design/icons";

type Variant = "error" | "warning" | "success";

type Props = {
    children?: React.ReactNode;
    variant?: Variant;
    showIcon?: boolean;
    title?: React.ReactNode;
    mt?: number;
};

export default function AlertText({children, variant = "error", showIcon = true, title, mt = 6,}: Props) {
    const uid = useId();
    if (!children && !title) return null;
    const palette: Record<Variant, { bg: string; text: string; icon: React.ReactNode }> = {
        error:   { bg: "#fff0f1", text: "#e5484d", icon: <ExclamationCircleFilled /> },
        warning: { bg: "#fff7ed", text: "#d97706", icon: <ExclamationCircleFilled /> },
        success: { bg: "#ecfdf5", text: "#059669", icon: <CheckCircleFilled /> },
    };
    const colors = palette[variant];
    const boxStyle: React.CSSProperties = {
        marginTop: mt,
        padding: "7px 12px",
        fontSize: 13,
        fontWeight: 600,
        color: colors.text,
        background: colors.bg,
        border: "none",
        borderRadius: 10,
        display: "flex",
        alignItems: "center",
        gap: 7,
        animation: `at-fadeIn-${uid} .25s ease-out`,
    };

    return (
        <div role="alert" aria-live="polite" style={boxStyle}>
            <style>{`
                @keyframes at-fadeIn-${uid} {
                  from { opacity: 0; transform: translateY(-4px); }
                  to   { opacity: 1; transform: translateY(0); }
                }
            `}</style>
            {showIcon && <span aria-hidden="true" style={{ fontSize: 14, color: colors.text, display: "inline-flex" }}>{colors.icon}</span>}
            <div style={{ display: "inline" }}>
                {title && <strong style={{ marginRight: 4 }}>{title}</strong>}
                {children}
            </div>
        </div>
    );
}
