import { useEffect, useMemo, useState } from "react";
import { Layout, Table, Input, Tag, Empty, Button as AntButton } from "antd";
import { useLocation, useNavigate } from "react-router-dom";
import SidebarCeluma from "../components/ui/sidebar_menu";
import type { CelumaKey } from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import ErrorText from "../components/ui/error_text";

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

type SamplesListResponse = {
    samples: Array<{
        id: string;
        sample_code: string;
        type: string;
        state: string;
        tenant_id: string;
        branch: { id: string; name?: string; code?: string | null };
        order: { id: string; order_code: string; status: string };
    }>;
};

type OrdersListResponse = {
    orders: Array<{
        id: string;
        order_code: string;
        status: string;
        branch: { id: string; name?: string; code?: string | null };
        patient: { id: string; full_name: string; patient_code: string };
        requested_by?: string | null;
        notes?: string | null;
        created_at?: string | null;
        sample_count: number;
        has_report: boolean;
    }>;
};

export default function SamplesList() {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    type Row = SamplesListResponse["samples"][number] & { patient_name?: string; requested_by?: string | null };
    const [rows, setRows] = useState<Row[]>([]);
    const [search, setSearch] = useState("");

    useEffect(() => {
        (async () => {
            setLoading(true);
            setError(null);
            try {
                const [samplesRes, ordersRes] = await Promise.all([
                    getJSON<SamplesListResponse>("/v1/laboratory/samples/"),
                    getJSON<OrdersListResponse>("/v1/laboratory/orders/"),
                ]);
                const orderMap = new Map<string, { patient_name?: string; requested_by?: string | null }>();
                for (const o of ordersRes.orders || []) {
                    orderMap.set(o.id, {
                        patient_name: o.patient?.full_name || o.patient?.patient_code,
                        requested_by: o.requested_by ?? null,
                    });
                }
                const enriched = (samplesRes.samples || []).map((s) => ({
                    ...s,
                    patient_name: orderMap.get(s.order.id)?.patient_name,
                    requested_by: orderMap.get(s.order.id)?.requested_by ?? null,
                }));
                setRows(enriched);
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
            [r.sample_code, r.type, r.state, r.order.order_code, r.branch.name, r.branch.code, r.patient_name, r.requested_by]
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
            <Layout.Content style={{ padding: 24, background: "#f6f8fa" }}>
                <style>{`
                  .sl-card { background: #fff; border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,.06); padding: 16px; }
                  .sl-toolbar { display: flex; gap: 10px; align-items: center; justify-content: space-between; margin-bottom: 12px; }
                  .sl-title { margin: 0, font-size: 20px; }
                  .sl-search { max-width: 360px; }
                `}</style>

                <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gap: 16 }}>
                    <div className="sl-card">
                        <div className="sl-toolbar">
                            <h2 className="sl-title">Muestras</h2>
                            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                <Input.Search
                                    className="sl-search"
                                    allowClear
                                    placeholder="Buscar por código, tipo, orden o sucursal" 
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    onSearch={(v) => setSearch(v)}
                                />
                                <AntButton type="primary" onClick={() => navigate("/samples/register")}>Registrar Muestra</AntButton>
                            </div>
                        </div>

                        <Table
                            loading={loading}
                            dataSource={filtered}
                            rowKey={(r) => r.id}
                            pagination={{ pageSize: 10, showSizeChanger: false }}
                            locale={{ emptyText: <Empty description="Sin muestras" /> }}
                            columns={[
                                { title: "Código", dataIndex: "sample_code", key: "sample_code", width: 140 },
                                { title: "Tipo", dataIndex: "type", key: "type", width: 140 },
                                { title: "Estado", dataIndex: "state", key: "state", width: 120, render: (v: string) => <Tag color="#49b6ad">{v}</Tag> },
                                { title: "Orden", key: "order", render: (_, r: Row) => r.order.order_code, width: 140 },
                                { title: "Paciente", key: "patient", render: (_, r: Row) => r.patient_name || "—" },
                                { title: "Solicitante", key: "requested_by", render: (_, r: Row) => r.requested_by || "—" },
                                { title: "Sucursal", key: "branch", render: (_, r: Row) => `${r.branch.code ?? ""} ${r.branch.name ?? ""}`.trim() },
                            ]}
                            onRow={(record) => ({
                                onClick: () => navigate(`/samples/${record.id}`),
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


