import React, { useId } from "react";

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
    const palette: Record<Variant, { bg: string; border: string; text: string; icon: string }> = {
        error:   { bg: "#fee2e2", border: "#fecaca", text: "#b91c1c", icon: "⚠️" },
        warning: { bg: "#fff7ed", border: "#fde68a", text: "#b45309", icon: "⚠️" },
        success: { bg: "#ecfdf5", border: "#a7f3d0", text: "#065f46", icon: "✅" },
    };
    const colors = palette[variant];
    const boxStyle: React.CSSProperties = {
        marginTop: mt,
        padding: "6px 10px",
        fontSize: 13,
        fontWeight: 500,
        color: colors.text,
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: 6,
        display: "flex",
        alignItems: "center",
        gap: 6,
        animation: `at-fadeIn-${uid} .25s ease-in`,
    };

    return (
        <div role="alert" aria-live="polite" style={boxStyle}>
            <style>{`
                @keyframes at-fadeIn-${uid} {
                  from { opacity: 0; transform: translateY(-4px); }
                  to   { opacity: 1; transform: translateY(0); }
                }
            `}</style>
            {showIcon && <span aria-hidden="true" style={{ fontSize: 14 }}>{colors.icon}</span>}
            <div style={{ display: "inline" }}>
                {title && <strong style={{ marginRight: 4 }}>{title}</strong>}
                {children}
            </div>
        </div>
    );
}
