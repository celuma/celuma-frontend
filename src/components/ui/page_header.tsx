import React from "react";
import { Card } from "antd";
import { tokens, cardStyle, pageTitleStyle, subtitleStyle } from "../design/tokens";

interface PageHeaderProps {
    /** Main page title. */
    title: React.ReactNode;
    /** Supporting line under the title. */
    subtitle?: React.ReactNode;
    /** Optional content rendered on the right side (e.g. an action button or a status pill). */
    extra?: React.ReactNode;
}

/**
 * PageHeader — the standard header card used at the top of every page.
 *
 * Provides a single, consistent look across the app: the Céluma teal accent
 * indicator on the left, the page title (Baloo 2, 24/800) and an optional
 * subtitle, plus an optional right-aligned action area. It carries the
 * `celuma-page-header` / `celuma-page-cta` classes so the existing responsive
 * rules (stacking + full-width CTA on mobile) keep working.
 */
export default function PageHeader({ title, subtitle, extra }: PageHeaderProps) {
    return (
        <Card
            style={{ ...cardStyle, borderLeft: `5px solid ${tokens.secondary}` }}
            styles={{ body: { padding: tokens.cardPadding } }}
        >
            <div
                className="celuma-page-header"
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}
            >
                <div style={{ minWidth: 0 }}>
                    <h1 style={pageTitleStyle}>{title}</h1>
                    {subtitle && <p style={subtitleStyle}>{subtitle}</p>}
                </div>
                {extra && <div className="celuma-page-cta" style={{ flexShrink: 0 }}>{extra}</div>}
            </div>
        </Card>
    );
}
