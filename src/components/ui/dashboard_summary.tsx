import React from "react";
import { Card } from "antd";
import { tokens } from "../design/tokens";

interface SummaryStats {
    total_patients: number;
    total_orders: number;
    total_samples: number;
    total_reports: number;
    pending_orders: number;
    draft_reports: number;
    published_reports: number;
}

interface DashboardSummaryProps {
    stats?: SummaryStats;
    loading?: boolean;
}

const cardStyle: React.CSSProperties = {
    borderRadius: tokens.radius,
    boxShadow: tokens.shadow,
    background: tokens.cardBg,
    border: "none",
};

const headerStyle: React.CSSProperties = {
    fontFamily: tokens.titleFont,
    fontSize: 18,
    fontWeight: 800,
    color: tokens.textPrimary,
    margin: "0 0 16px 0",
};

function ProgressRow({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
    const pct = total > 0 ? Math.round((value / total) * 100) : 0;
    return (
        <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{label}</span>
                <span style={{ fontSize: 13, color: "#6b7280" }}>
                    <span style={{ fontWeight: 700, color: tokens.textPrimary }}>{value}</span>
                    <span style={{ color: "#9ca3af" }}> / {total}</span>
                </span>
            </div>
            <div style={{ height: 8, borderRadius: 100, background: "#f1f3f5", overflow: "hidden" }}>
                <div
                    style={{
                        height: "100%",
                        width: `${pct}%`,
                        background: color,
                        borderRadius: 100,
                        transition: "width 0.4s ease",
                    }}
                />
            </div>
        </div>
    );
}

function StatChip({ label, value, color }: { label: string; value: number; color: string }) {
    return (
        <div
            style={{
                flex: 1,
                background: "#fafbfc",
                border: "1px solid #eef0f2",
                borderRadius: 10,
                padding: "12px 14px",
            }}
        >
            <div style={{ fontFamily: tokens.titleFont, fontSize: 22, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>{label}</div>
        </div>
    );
}

export default function DashboardSummary({ stats, loading = false }: DashboardSummaryProps) {
    const s = stats ?? {
        total_patients: 0, total_orders: 0, total_samples: 0, total_reports: 0,
        pending_orders: 0, draft_reports: 0, published_reports: 0,
    };

    return (
        <Card loading={loading} style={cardStyle} styles={{ body: { padding: 20 } }}>
            <h3 style={headerStyle}>Resumen del Laboratorio</h3>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <ProgressRow label="Órdenes pendientes" value={s.pending_orders} total={s.total_orders} color="#f59e0b" />
                <ProgressRow label="Reportes publicados" value={s.published_reports} total={s.total_reports} color="#22c55e" />
                <ProgressRow label="Reportes en borrador" value={s.draft_reports} total={s.total_reports} color="#3b82f6" />
            </div>

            <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
                <StatChip label="Pacientes" value={s.total_patients} color="#8b5cf6" />
                <StatChip label="Muestras procesadas" value={s.total_samples} color="#f59e0b" />
            </div>
        </Card>
    );
}
