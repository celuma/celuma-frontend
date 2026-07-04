import React from "react";
import { Card, Empty } from "antd";
import {
    ContainerOutlined,
    FileDoneOutlined,
    ExperimentOutlined,
    UserOutlined,
} from "@ant-design/icons";
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
    /** Optional action rendered on the right side of the header (e.g. a "ver todo" link). */
    extra?: React.ReactNode;
}

const TYPE_CONFIG: Record<string, { color: string; bg: string; label: string; icon: React.ReactNode }> = {
    order:   { color: "#3b82f6", bg: "#eff6ff", label: "Orden",    icon: <ContainerOutlined /> },
    report:  { color: "#10b981", bg: "#ecfdf5", label: "Reporte",  icon: <FileDoneOutlined /> },
    sample:  { color: "#f59e0b", bg: "#fffbeb", label: "Muestra",  icon: <ExperimentOutlined /> },
    patient: { color: "#8b5cf6", bg: "#f5f3ff", label: "Paciente", icon: <UserOutlined /> },
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
    color: tokens.textPrimary,
    margin: 0,
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
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return "hace unos segundos";
    if (diff < 3600) {
        const m = Math.floor(diff / 60);
        return `hace ${m} ${m === 1 ? "minuto" : "minutos"}`;
    }
    if (diff < 86400) {
        const h = Math.floor(diff / 3600);
        return `hace ${h} ${h === 1 ? "hora" : "horas"}`;
    }
    if (diff < 604800) {
        const dd = Math.floor(diff / 86400);
        return `hace ${dd} ${dd === 1 ? "día" : "días"}`;
    }
    return d.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
};

const absoluteTimestamp = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })
        + " · " + d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
};

export default function RecentActivity({ title, items, loading = false, onItemClick, extra }: RecentActivityProps) {
    return (
        <Card
            loading={loading}
            style={cardStyle}
            styles={{ body: { padding: 20 } }}
        >
            <style>{`
                .celuma-feed-item { transition: background 0.15s ease; }
                .celuma-feed-item:hover { background: #f8fafa; }
                .celuma-feed-item:last-child .celuma-feed-line { display: none; }
            `}</style>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <h3 style={headerStyle}>{title}</h3>
                {extra}
            </div>

            {items.length === 0 ? (
                <Empty description="Sin actividad reciente" style={{ padding: "24px 0" }} />
            ) : (
                <div>
                    {items.map((item) => {
                        const t = TYPE_CONFIG[item.type] ?? { color: "#6b7280", bg: "#f3f4f6", label: item.type, icon: <ContainerOutlined /> };
                        const s = item.status
                            ? (STATUS_CONFIG[item.status.toUpperCase()] ?? { color: "#6b7280", bg: "#f3f4f6", label: item.status })
                            : null;
                        return (
                            <div
                                key={item.id}
                                className="celuma-feed-item"
                                onClick={() => onItemClick?.(item)}
                                style={{
                                    position: "relative",
                                    display: "flex",
                                    gap: 14,
                                    padding: "12px 10px",
                                    borderRadius: 10,
                                    cursor: onItemClick ? "pointer" : "default",
                                }}
                            >
                                {/* Timeline connector */}
                                <span
                                    className="celuma-feed-line"
                                    style={{
                                        position: "absolute",
                                        left: 27,
                                        top: 48,
                                        bottom: -12,
                                        width: 2,
                                        background: "#eef0f2",
                                    }}
                                />
                                {/* Type badge */}
                                <span
                                    style={{
                                        flexShrink: 0,
                                        width: 36,
                                        height: 36,
                                        borderRadius: "50%",
                                        background: t.bg,
                                        color: t.color,
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        fontSize: 16,
                                        border: "3px solid #fff",
                                        zIndex: 1,
                                    }}
                                >
                                    {t.icon}
                                </span>
                                {/* Content */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                        <span style={{ fontFamily: tokens.textFont, fontSize: 14, fontWeight: 600, color: tokens.textPrimary }}>
                                            {item.title}
                                        </span>
                                        <span style={pillStyle(t.color, t.bg)}>{t.label}</span>
                                        {s && <span style={pillStyle(s.color, s.bg)}>{s.label}</span>}
                                    </div>
                                    <div style={{ color: "#6b7280", fontSize: 13, marginTop: 3 }}>
                                        {item.description}
                                    </div>
                                    <div style={{ color: "#9ca3af", fontSize: 12, marginTop: 4 }} title={absoluteTimestamp(item.timestamp)}>
                                        {formatTimestamp(item.timestamp)}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </Card>
    );
}
