import { useEffect, useMemo, useState } from "react";
import { Layout, Table, Input, Tag, Empty, Button as AntButton } from "antd";
import { useLocation, useNavigate } from "react-router-dom";
import SidebarCeluma from "../components/ui/sidebar_menu";
import type { CelumaKey } from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import ErrorText from "../components/ui/error_text";
import { tokens } from "../components/design/tokens";

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
            patient: { id: string; full_name: string; patient_code: string };
        };
        title: string;
        diagnosis_text?: string | null;
        published_at?: string | null;
        created_at?: string | null;
        created_by?: string | null;
        signed_by?: string | null;
        signed_at?: string | null;
        version_no: number;
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
            [r.title, r.diagnosis_text, r.order.order_code, r.order.patient.full_name, r.order.patient.patient_code, r.branch.name, r.branch.code, r.order.requested_by]
                .filter(Boolean)
                .some((v) => String(v).toLowerCase().includes(q))
        );
    }, [rows, search]);

    const getStatusColor = (status: string) => {
        switch (status.toUpperCase()) {
            case "PUBLISHED": return "#22c55e";
            case "DRAFT": return "#f59e0b";
            case "PENDING": return "#3b82f6";
            default: return "#94a3b8";
        }
    };

    return (
        <Layout style={{ minHeight: "100vh", padding: 0, margin: 0 }}>
            <SidebarCeluma
                selectedKey={(pathname as CelumaKey) ?? "/home"}
                onNavigate={(k) => navigate(k)}
                logoSrc={logo}
            />
            <Layout.Content style={{ padding: 24, background: tokens.bg, fontFamily: tokens.textFont }}>
                <style>{`
                  .rl-card { background: #fff; border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,.06); padding: 16px; }
                  .rl-toolbar { display: flex; gap: 10px; align-items: center; justify-content: space-between; margin-bottom: 12px; }
                  .rl-title { margin: 0; font-size: 20px; }
                  .rl-search { max-width: 360px; }
                `}</style>

                <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gap: tokens.gap }}>
                    <div className="rl-card" style={{ borderRadius: tokens.radius, boxShadow: tokens.shadow, background: tokens.cardBg }}>
                        <div className="rl-toolbar">
                            <h2 className="rl-title" style={{ margin: 0, fontFamily: tokens.titleFont, fontSize: 20, fontWeight: 800, color: "#0d1b2a" }}>Reportes</h2>
                            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                <Input.Search
                                    className="rl-search"
                                    allowClear
                                    placeholder="Buscar por título, diagnóstico, orden o paciente" 
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    onSearch={(v) => setSearch(v)}
                                />
                                <AntButton type="primary" onClick={() => navigate("/reports/editor")}>Crear Reporte</AntButton>
                            </div>
                        </div>

                        <Table
                            loading={loading}
                            dataSource={filtered}
                            rowKey={(r) => r.id}
                            pagination={{ pageSize: 10, showSizeChanger: false }}
                            locale={{ emptyText: <Empty description="Sin reportes" /> }}
                            columns={[
                                { title: "Título", dataIndex: "title", key: "title", width: 200 },
                                { title: "Estado", dataIndex: "status", key: "status", width: 120, render: (v: string) => <Tag color={getStatusColor(v)}>{v}</Tag> },
                                { title: "Orden", key: "order", render: (_, r) => r.order.order_code, width: 140 },
                                { title: "Paciente", key: "patient", render: (_, r) => r.order.patient.full_name || r.order.patient.patient_code },
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

                        <ErrorText>{error}</ErrorText>
                    </div>
                </div>
            </Layout.Content>
        </Layout>
    );
}
