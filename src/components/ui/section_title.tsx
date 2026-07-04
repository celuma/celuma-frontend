import React from "react";
import { tokens } from "../design/tokens";

type Props = {
    children: React.ReactNode;
    /** Optional leading icon (rendered teal). */
    icon?: React.ReactNode;
    /** Optional right-aligned slot (e.g. a count or action). */
    extra?: React.ReactNode;
    style?: React.CSSProperties;
};

/**
 * SectionTitle — the Céluma form/section heading: Baloo 18/700 navy, optional
 * teal leading icon and a right-aligned `extra` slot. Used to head form sections
 * and cards across the app.
 */
export default function SectionTitle({ children, icon, extra, style }: Props) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, ...style }}>
            {icon && <span style={{ color: tokens.primary, fontSize: 18, display: "inline-flex" }}>{icon}</span>}
            <h3 style={{ margin: 0, fontFamily: tokens.titleFont, fontSize: 18, fontWeight: 700, color: tokens.textPrimary, flex: 1, lineHeight: 1.2 }}>
                {children}
            </h3>
            {extra}
        </div>
    );
}
