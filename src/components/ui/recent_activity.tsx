import React from "react";
import { Card, List, Empty } from "antd";
import { tokens } from "../design/tokens";

interface RecentActivityItem {
    id: string;
    title: string;
    description: string;
    timestamp: string;
    type: "order" | "report" | "sample" | "patient";
    status?: string;
}

interface RecentActivityProps {
    title: string;
    items: RecentActivityItem[];
    loading?: boolean;
    onItemClick?: (item: RecentActivityItem) => void;
}

export default function RecentActivity({ title, items, loading = false, onItemClick }: RecentActivityProps) {
    const cardStyle: React.CSSProperties = {
        borderRadius: tokens.radius,
        boxShadow: tokens.shadow,
        background: tokens.cardBg,
        border: "none",
        height: "100%",
    };

    const headerStyle: React.CSSProperties = {
        fontFamily: tokens.titleFont,
        fontSize: 18,
        fontWeight: 800,
        color: "#0d1b2a",
        margin: 0,
        marginBottom: 16,
    };

    const TYPE_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
        order:   { color: "#3b82f6", bg: "#eff6ff",  label: "Orden" },
        report:  { color: "#10b981", bg: "#ecfdf5",  label: "Reporte" },
        sample:  { color: "#f59e0b", bg: "#fffbeb",  label: "Muestra" },
        patient: { color: "#8b5cf6", bg: "#f5f3ff",  label: "Paciente" },
    };

    const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
        PUBLISHED:  { color: "#22c55e", bg: "#f0fdf4", label: "Publicado" },
        DRAFT:      { color: "#f59e0b", bg: "#fffbeb", label: "Borrador" },
        RECEIVED:   { color: "#3b82f6", bg: "#eff6ff", label: "Recibida" },
        PROCESSING: { color: "#8b5cf6", bg: "#f5f3ff", label: "En Proceso" },
        COMPLETED:  { color: "#10b981", bg: "#ecfdf5", label: "Completada" },
        RELEASED:   { color: "#10b981", bg: "#ecfdf5", label: "Liberada" },
        REVIEW:     { color: "#ec4899", bg: "#fdf2f8", label: "Revisión" },
        DIAGNOSIS:  { color: "#8b5cf6", bg: "#f5f3ff", label: "Diagnóstico" },
    };

    const pillStyle = (color: string, bg: string): React.CSSProperties => ({
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: 100,
        fontSize: 11,
        fontWeight: 600,
        backgroundColor: bg,
        color,
        lineHeight: 1.6,
        letterSpacing: "0.01em",
    });

    const formatTimestamp = (ts: string) => {
        const d = new Date(ts);
        return d.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })
            + " · " + d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
    };

    return (
        <Card
            loading={loading}
            style={cardStyle}
            styles={{ body: { padding: 20 } }}
        >
            <h3 style={headerStyle}>{title}</h3>
            <List
                dataSource={items}
                locale={{ emptyText: <Empty description="Sin actividad reciente" /> }}
                renderItem={(item) => (
                    <List.Item
                        style={{ 
                            padding: "12px 0", 
                            cursor: onItemClick ? "pointer" : "default",
                            borderBottom: "1px solid #f3f4f6"
                        }}
                        onClick={() => onItemClick?.(item)}
                    >
                        <List.Item.Meta
                            title={
                                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                    <span style={{ fontFamily: tokens.textFont, fontSize: 14, fontWeight: 600 }}>
                                        {item.title}
                                    </span>
                                    {(() => {
                                        const t = TYPE_CONFIG[item.type] ?? { color: "#6b7280", bg: "#f3f4f6", label: item.type };
                                        return <span style={pillStyle(t.color, t.bg)}>{t.label}</span>;
                                    })()}
                                    {item.status && (() => {
                                        const s = STATUS_CONFIG[item.status.toUpperCase()] ?? { color: "#6b7280", bg: "#f3f4f6", label: item.status };
                                        return <span style={pillStyle(s.color, s.bg)}>{s.label}</span>;
                                    })()}
                                </div>
                            }
                            description={
                                <div>
                                    <div style={{ color: "#6b7280", fontSize: 13, marginBottom: 2 }}>
                                        {item.description}
                                    </div>
                                    <div style={{ color: "#9ca3af", fontSize: 12 }}>
                                        {formatTimestamp(item.timestamp)}
                                    </div>
                                </div>
                            }
                        />
                    </List.Item>
                )}
            />
        </Card>
    );
}
