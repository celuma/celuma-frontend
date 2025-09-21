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

type OrdersListResponse = {
    orders: Array<{
        id: string;
        order_code: string;
        status: string;
        tenant_id: string;
        branch: { id: string; name?: string; code?: string | null };
        patient: { id: string; full_name: string; patient_code: string };
        requested_by?: string | null;
        notes?: string | null;
        created_at?: string | null;
        sample_count: number;
        has_report: boolean;
    }>;
};

export default function CasesList() {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [rows, setRows] = useState<OrdersListResponse["orders"]>([]);
    const [search, setSearch] = useState("");

    useEffect(() => {
        (async () => {
            setLoading(true);
            setError(null);
            try {
                const data = await getJSON<OrdersListResponse>("/v1/laboratory/orders/");
                setRows(data.orders || []);
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
            [r.order_code, r.patient.full_name, r.patient.patient_code, r.branch.name, r.requested_by, r.notes]
                .filter(Boolean)
                .some((v) => String(v).toLowerCase().includes(q))
        );
    }, [rows, search]);

    return (
        <Layout style={{ minHeight: "100vh", padding: 0, margin: 0 }}>
            <SidebarCeluma
                selectedKey={(pathname as CelumaKey) ?? "/home"}
                onNavigate={(k) => navigate(k)}
                logoSrc={logo}
            />
            <Layout.Content style={{ padding: 24, background: tokens.bg, fontFamily: tokens.textFont }}>
                <style>{`
                  .cl-card { background: #fff; border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,.06); padding: 16px; }
                  .cl-toolbar { display: flex; gap: 10px; align-items: center; justify-content: space-between; margin-bottom: 12px; }
                  .cl-title { margin: 0; font-size: 20px; }
                  .cl-search { max-width: 360px; }
                `}</style>

                <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gap: tokens.gap }}>
                    <div className="cl-card" style={{ borderRadius: tokens.radius, boxShadow: tokens.shadow, background: tokens.cardBg }}>
                        <div className="cl-toolbar">
                            <h2 className="cl-title" style={{ margin: 0, fontFamily: tokens.titleFont, fontSize: 20, fontWeight: 800, color: "#0d1b2a" }}>Casos</h2>
                            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                <Input.Search
                                    className="cl-search"
                                    allowClear
                                    placeholder="Buscar por orden, paciente, sucursal" 
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    onSearch={(v) => setSearch(v)}
                                />
                                <AntButton type="primary" onClick={() => navigate("/cases/register")}>Registrar Caso</AntButton>
                            </div>
                        </div>

                        <Table
                            loading={loading}
                            dataSource={filtered}
                            rowKey={(r) => r.id}
                            pagination={{ pageSize: 10, showSizeChanger: false }}
                            locale={{ emptyText: <Empty description="Sin casos" /> }}
                            columns={[
                                { title: "Fecha", dataIndex: "created_at", key: "created_at", width: 180, render: (v: string | null) => v ? new Date(v).toLocaleString() : "—" },
                                { title: "Orden", dataIndex: "order_code", key: "order_code", width: 140 },
                                { title: "Paciente", key: "patient", render: (_, r) => r.patient.full_name || r.patient.patient_code },
                                { title: "Sucursal", key: "branch", render: (_, r) => `${r.branch.code ?? ""} ${r.branch.name ?? ""}`.trim() },
                                { title: "Estado", dataIndex: "status", key: "status", width: 120, render: (v: string) => <Tag color="#49b6ad">{v}</Tag> },
                                { title: "Muestras", dataIndex: "sample_count", key: "sample_count", width: 110 },
                                { title: "Reporte", dataIndex: "has_report", key: "has_report", width: 110, render: (v: boolean) => v ? <Tag color="#22c55e">Sí</Tag> : <Tag color="#94a3b8">No</Tag> },
                            ]}
                            onRow={(record) => ({
                                onClick: () => navigate(`/orders/${record.id}`),
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


