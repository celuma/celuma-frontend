import { useEffect, useMemo, useState } from "react";
import { Layout, Table, Input, Tag, Empty, Button, Card, Space } from "antd";
import { useLocation, useNavigate } from "react-router-dom";
import SidebarCeluma from "../components/ui/sidebar_menu";
import type { CelumaKey } from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import ErrorText from "../components/ui/error_text";
import { tokens, cardStyle, cardTitleStyle } from "../components/design/tokens";

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
            <Layout.Content style={{ padding: tokens.contentPadding, background: tokens.bg, fontFamily: tokens.textFont }}>
                <div style={{ maxWidth: tokens.maxWidth, margin: "0 auto" }}>
                    <Card
                        title={<span style={cardTitleStyle}>Casos</span>}
                        extra={
                            <Space>
                                <Input.Search
                                    allowClear
                                    placeholder="Buscar por orden, paciente, sucursal" 
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    onSearch={(v) => setSearch(v)}
                                    style={{ width: 320 }}
                                />
                                <Button type="primary" onClick={() => navigate("/cases/register")}>
                                    Registrar Caso
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
                            locale={{ emptyText: <Empty description="Sin casos" /> }}
                            columns={[
                                { title: "Fecha", dataIndex: "created_at", key: "created_at", width: 180, render: (v: string | null) => v ? new Date(v).toLocaleString() : "—" },
                                { title: "Orden", dataIndex: "order_code", key: "order_code", width: 140 },
                                { title: "Paciente", key: "patient", render: (_, r) => r.patient.full_name || r.patient.patient_code },
                                { title: "Sucursal", key: "branch", render: (_, r) => `${r.branch.code ?? ""} ${r.branch.name ?? ""}`.trim() },
                                { title: "Estado", dataIndex: "status", key: "status", width: 120, render: (v: string) => <Tag color={tokens.primary}>{v}</Tag> },
                                { title: "Muestras", dataIndex: "sample_count", key: "sample_count", width: 110 },
                                { title: "Reporte", dataIndex: "has_report", key: "has_report", width: 110, render: (v: boolean) => v ? <Tag color="#22c55e">Sí</Tag> : <Tag color="#94a3b8">No</Tag> },
                            ]}
                            onRow={(record) => ({
                                onClick: () => navigate(`/orders/${record.id}`),
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


