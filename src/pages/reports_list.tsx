import { useEffect, useMemo, useState } from "react";
import { Layout, Table, Input, Tag, Empty, Button, Card, Space, Avatar } from "antd";
import { useLocation, useNavigate } from "react-router-dom";
import SidebarCeluma from "../components/ui/sidebar_menu";
import type { CelumaKey } from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import ErrorText from "../components/ui/error_text";
import { tokens, cardStyle, cardTitleStyle } from "../components/design/tokens";

// Generate initials from full name
const getInitials = (fullName?: string): string => {
    if (!fullName) return "P";
    const parts = fullName.trim().split(/\s+/);
    const first = parts[0]?.[0]?.toUpperCase() || "";
    const last = parts.length > 1 ? parts[parts.length - 1]?.[0]?.toUpperCase() : "";
    return first + last || "P";
};

// Generate a consistent color based on name
const getAvatarColor = (name: string): string => {
    const colors = [
        "#0f8b8d", "#3b82f6", "#8b5cf6", "#ec4899", 
        "#f59e0b", "#10b981", "#ef4444", "#6366f1"
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
};

function getApiBase(): string {
    return import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL || "/api");
}

async function getJSON<TRes>(path: string): Promise<TRes> {
    const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
    const headers: Record<string, string> = { accept: "application/json" };
    if (token) headers["Authorization"] = token;
    const res = await fetch(`${getApiBase()}${path}`, { method: "GET", headers, credentials: "include" });
    const text = await res.text();
    let parsed: unknown = undefined;
    try { parsed = text ? JSON.parse(text) : undefined; } catch { /* ignore */ }
    if (!res.ok) {
        const message = (parsed as { message?: string } | undefined)?.message ?? `${res.status} ${res.statusText}`;
        throw new Error(message);
    }
    return parsed as TRes;
}

type ReportsListResponse = {
    reports: Array<{
        id: string;
        status: string;
        tenant_id: string;
        branch: { id: string; name?: string; code?: string | null };
        order: {
            id: string;
            order_code: string;
            status: string;
            requested_by?: string | null;
            patient?: { id: string; full_name: string; patient_code: string };
        };
        title?: string | null;
        diagnosis_text?: string | null;
        published_at?: string | null;
        created_at?: string | null;
        created_by?: string | null;
        signed_by?: string | null;
        signed_at?: string | null;
        version_no?: number | null;
        has_pdf: boolean;
    }>;
};

export default function ReportsList() {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [rows, setRows] = useState<ReportsListResponse["reports"]>([]);
    const [search, setSearch] = useState("");

    useEffect(() => {
        (async () => {
            setLoading(true);
            setError(null);
            try {
                const data = await getJSON<ReportsListResponse>("/v1/reports/");
                setRows(data.reports || []);
            } catch (err) {
                setError(err instanceof Error ? err.message : "Ocurrió un error inesperado.");
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return rows;
        return rows.filter((r) =>
            [r.title, r.diagnosis_text, r.order.order_code, r.order.patient?.full_name, r.order.patient?.patient_code, r.branch.name, r.branch.code, r.order.requested_by]
                .filter(Boolean)
                .some((v) => String(v).toLowerCase().includes(q))
        );
    }, [rows, search]);

    // Report status configuration
    const REPORT_STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
        DRAFT: { color: "#f59e0b", bg: "#fffbeb", label: "Borrador" },
        IN_REVIEW: { color: "#3b82f6", bg: "#eff6ff", label: "En Revisión" },
        APPROVED: { color: "#10b981", bg: "#ecfdf5", label: "Aprobado" },
        PUBLISHED: { color: "#22c55e", bg: "#f0fdf4", label: "Publicado" },
        RETRACTED: { color: "#ef4444", bg: "#fef2f2", label: "Retractado" },
    };

    return (
        <Layout style={{ minHeight: "100vh", padding: 0, margin: 0 }}>
            <SidebarCeluma
                selectedKey={(pathname as CelumaKey) ?? "/home"}
                onNavigate={(k) => navigate(k)}
                logoSrc={logo}
            />
            <Layout.Content style={{ padding: tokens.contentPadding, background: tokens.bg, fontFamily: tokens.textFont }}>
                <div style={{ maxWidth: tokens.maxWidth, margin: "0 auto" }}>
                    <Card
                        title={<span style={cardTitleStyle}>Reportes</span>}
                        extra={
                            <Space>
                                <Input.Search
                                    allowClear
                                    placeholder="Buscar por título, diagnóstico, orden o paciente" 
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    onSearch={(v) => setSearch(v)}
                                    style={{ width: 320 }}
                                />
                                <Button type="primary" onClick={() => navigate("/reports/editor")}>
                                    Crear Reporte
                                </Button>
                            </Space>
                        }
                        style={cardStyle}
                    >
                        <Table
                            loading={loading}
                            dataSource={filtered}
                            rowKey={(r) => r.id}
                            pagination={{ pageSize: 10, showSizeChanger: false }}
                            locale={{ emptyText: <Empty description="Sin reportes" /> }}
                            columns={[
                                { title: "Título", dataIndex: "title", key: "title", width: 200 },
                                { title: "Estado", dataIndex: "status", key: "status", width: 120, render: (v: string) => {
                                    const config = REPORT_STATUS_CONFIG[v] || { color: "#6b7280", bg: "#f3f4f6", label: v };
                                    return (
                                        <div style={{
                                            backgroundColor: config.bg,
                                            color: config.color,
                                            borderRadius: 12,
                                            fontSize: 11,
                                            fontWeight: 500,
                                            padding: "4px 10px",
                                            display: "inline-block",
                                        }}>
                                            {config.label}
                                        </div>
                                    );
                                } },
                                { title: "Orden", key: "order", render: (_, r) => r.order.order_code, width: 140 },
                                { 
                                    title: "Paciente", 
                                    key: "patient", 
                                    render: (_, r) => {
                                        const patientName = r.order.patient?.full_name || r.order.patient?.patient_code;
                                        if (!patientName) return "—";
                                        const initials = getInitials(patientName);
                                        const color = getAvatarColor(patientName);
                                        return (
                                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                                <Avatar
                                                    size={32}
                                                    style={{
                                                        backgroundColor: color,
                                                        fontSize: 13,
                                                        fontWeight: 600,
                                                        flexShrink: 0,
                                                    }}
                                                >
                                                    {initials}
                                                </Avatar>
                                                <span style={{ fontWeight: 500 }}>{patientName}</span>
                                            </div>
                                        );
                                    }
                                },
                                { title: "Sucursal", key: "branch", render: (_, r) => `${r.branch.code ?? ""} ${r.branch.name ?? ""}`.trim() },
                                { title: "Publicado", dataIndex: "published_at", key: "published_at", width: 180, render: (v: string | null) => v ? new Date(v).toLocaleString() : "—" },
                                { 
                                    title: "Firmado por", 
                                    key: "signed_by", 
                                    width: 150, 
                                    render: (_, r) => r.signed_by && r.status === "PUBLISHED" ? r.signed_by : "—" 
                                },
                                { title: "Versión", dataIndex: "version_no", key: "version_no", width: 100 },
                                { title: "PDF", dataIndex: "has_pdf", key: "has_pdf", width: 80, render: (v: boolean) => v ? <Tag color="#22c55e">Sí</Tag> : <Tag color="#94a3b8">No</Tag> },
                            ]}
                            onRow={(record) => ({
                                onClick: () => navigate(`/reports/${record.id}`),
                                style: { cursor: "pointer" },
                            })}
                        />
                        {error && <ErrorText>{error}</ErrorText>}
                    </Card>
                </div>
            </Layout.Content>
        </Layout>
    );
}
