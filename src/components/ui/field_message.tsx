import React from "react";
import { ExclamationCircleFilled, CheckCircleFilled } from "@ant-design/icons";

type Variant = "error" | "warning" | "success";

const palette: Record<Variant, { color: string; bg: string; glow: string; icon: React.ReactNode }> = {
    error:   { color: "#e5484d", bg: "#fff0f1", glow: "rgba(229,72,77,.28)", icon: <ExclamationCircleFilled /> },
    warning: { color: "#d97706", bg: "#fff7ed", glow: "rgba(245,158,11,.28)", icon: <ExclamationCircleFilled /> },
    success: { color: "#059669", bg: "#ecfdf5", glow: "rgba(5,150,105,.25)", icon: <CheckCircleFilled /> },
};

type Props = {
    variant?: Variant;
    /** When true the chin is expanded; when false it retracts up behind the field. */
    open: boolean;
    children: React.ReactNode;
};

/**
 * FieldMessage — the validation "chin" that slides out from BEHIND a
 * floating-caption field. The field itself never changes shape: this panel is
 * stacked underneath it (lower z-index) and overlaps the field's bottom edge,
 * so when it expands it looks like the field's glow halo dropping downward to
 * reveal the message. It retracts by scaling back up behind the field.
 * Absolutely positioned, so it never shifts surrounding layout.
 */
export default function FieldMessage({ variant = "error", open, children }: Props) {
    const c = palette[variant];
    return (
        <div
            role="alert"
            aria-live="polite"
            style={{
                position: "absolute",
                top: "calc(100% - 16px)",
                left: 0,
                right: 0,
                zIndex: 1,
                background: c.bg,
                border: "none",
                borderRadius: 12,
                boxShadow: open ? `0 0 8px 2px ${c.glow}` : "none",
                padding: "20px 14px 9px",
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: c.color,
                fontWeight: 600,
                fontSize: 13,
                lineHeight: 1.3,
                transformOrigin: "top center",
                opacity: open ? 1 : 0,
                transform: open ? "scaleY(1)" : "scaleY(0.15)",
                transition: "opacity .2s ease, transform .22s ease, box-shadow .2s ease",
                pointerEvents: "none",
            }}
        >
            <span aria-hidden="true" style={{ display: "inline-flex", fontSize: 14, flexShrink: 0 }}>{c.icon}</span>
            <span>{children}</span>
        </div>
    );
}
