import React from "react";
import { Card } from "antd";
import { tokens } from "../design/tokens";

interface StatsCardProps {
    title: string;
    value?: string | number;
    icon?: React.ReactNode;
    color?: string;
    loading?: boolean;
    extra?: React.ReactNode;
    children?: React.ReactNode;
}

export default function StatsCard({ title, value, icon, color = "#0f8b8d", loading = false, extra, children }: StatsCardProps) {
    const baseCardStyle: React.CSSProperties = {
        borderRadius: tokens.radius,
        boxShadow: tokens.shadow,
        background: tokens.cardBg,
        border: "none",
        height: "100%",
    };

    const headerStyle: React.CSSProperties = {
        fontFamily: tokens.titleFont,
        fontSize: 16,
        fontWeight: 600,
        color: "#6b7280",
        margin: 0,
        marginBottom: 8,
    };

    const valueStyle: React.CSSProperties = {
        fontFamily: tokens.titleFont,
        fontSize: 32,
        fontWeight: 800,
        color: color,
        margin: 0,
        lineHeight: 1,
    };

    const iconStyle: React.CSSProperties = {
        fontSize: 24,
        color: color,
        marginBottom: 8,
    };

    if (children) {
        return (
            <Card
                loading={loading}
                title={<span style={{ fontFamily: tokens.titleFont, fontSize: 20, fontWeight: 800, color: "#0d1b2a" }}>{title}</span>}
                extra={extra}
                style={baseCardStyle}
                styles={{ body: { padding: "16px 24px 20px 24px" } }}
            >
                {children}
            </Card>
        );
    }

    return (
        <Card
            loading={loading}
            style={baseCardStyle}
            styles={{ body: { padding: 20 } }}
        >
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                {icon && <div style={iconStyle}>{icon}</div>}
                <h3 style={headerStyle}>{title}</h3>
                {value !== undefined && <div style={valueStyle}>{value}</div>}
            </div>
        </Card>
    );
}
