import React from "react";
import { tokens } from "../design/tokens";

type Props = {
    /** Icon shown inside the soft teal circle. */
    icon: React.ReactNode;
    /** Baloo title. */
    title: string;
    /** Muted description line(s). */
    description?: React.ReactNode;
    /** Optional action (typically a CelumaButton). */
    action?: React.ReactNode;
    /** Tint of the circle (defaults to teal). */
    color?: string;
    style?: React.CSSProperties;
};

/**
 * EmptyState — the Céluma empty/zero pattern: a soft tinted circle + icon, a
 * Baloo title, a muted description and an optional action. Used for "no report
 * selected", "no images", load errors, etc. 100% reusable.
 */
export default function EmptyState({ icon, title, description, action, color = tokens.primary, style }: Props) {
    return (
        <div
            style={{
                display: "grid",
                justifyItems: "center",
                textAlign: "center",
                gap: 10,
                padding: "48px 24px",
                ...style,
            }}
        >
            <div
                style={{
                    width: 64,
                    height: 64,
                    borderRadius: "50%",
                    background: `${color}1a`,
                    color,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 28,
                }}
            >
                {icon}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: tokens.textPrimary, fontFamily: tokens.titleFont }}>
                {title}
            </div>
            {description && (
                <div style={{ color: tokens.textSecondary, fontSize: 14, maxWidth: 420, lineHeight: 1.5 }}>
                    {description}
                </div>
            )}
            {action && <div style={{ marginTop: 6 }}>{action}</div>}
        </div>
    );
}
