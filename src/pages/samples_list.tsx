import { useEffect, useMemo, useState } from "react";
import { Layout, Input, Button, Card, Space } from "antd";
import { useLocation, useNavigate } from "react-router-dom";
import type { ColumnsType } from "antd/es/table";
import SidebarCeluma from "../components/ui/sidebar_menu";
import type { CelumaKey } from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import ErrorText from "../components/ui/error_text";
import { tokens, cardStyle, cardTitleStyle } from "../components/design/tokens";
import { CelumaTable } from "../components/ui/celuma_table";
import { PatientCell, renderStatusChip, renderLabels, stringSorter } from "../components/ui/table_helpers";

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
        order: { id: string; order_code: string; status: string; patient?: { id: string; full_name: string; patient_code: string } | null };
        received_at?: string | null;
        labels?: Array<{ id: string; name: string; color: string }>;
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
    type Row = SamplesListResponse["samples"][number] & { patient_name?: string; patient_id?: string; patient_code?: string; requested_by?: string | null };
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
                const orderMap = new Map<string, { patient_id: string; patient_name?: string; patient_code?: string; requested_by?: string | null }>();
                for (const o of ordersRes.orders || []) {
                    orderMap.set(o.id, {
                        patient_id: o.patient.id,
                        patient_name: o.patient?.full_name || o.patient?.patient_code,
                        patient_code: o.patient?.patient_code,
                        requested_by: o.requested_by ?? null,
                    });
                }
                const enriched = (samplesRes.samples || []).map((s) => ({
                    ...s,
                    patient_id: orderMap.get(s.order.id)?.patient_id,
                    patient_name: orderMap.get(s.order.id)?.patient_name,
                    patient_code: orderMap.get(s.order.id)?.patient_code,
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
            [r.sample_code, r.type, r.state, r.order.order_code, r.patient_name, r.requested_by]
                .filter(Boolean)
                .some((v) => String(v).toLowerCase().includes(q))
        );
    }, [rows, search]);

    // Get unique states and types for filters
    const stateFilters = useMemo(() => {
        const states = new Set(rows.map(r => r.state));
        return Array.from(states).map(state => ({
            text: renderStatusChip(state, "sample").props.children,
            value: state,
        }));
    }, [rows]);

    const typeFilters = useMemo(() => {
        const types = new Set(rows.map(r => r.type));
        return Array.from(types).map(type => ({
            text: type,
            value: type,
        }));
    }, [rows]);

    const columns: ColumnsType<Row> = [
        { 
            title: "Código", 
            dataIndex: "sample_code", 
            key: "sample_code", 
            width: 140,
            sorter: stringSorter("sample_code"),
            defaultSortOrder: "ascend",
        },
        { 
            title: "Orden", 
            key: "order", 
            width: 140,
            render: (_, r) => (
                <span 
                    style={{ color: "#0f8b8d", cursor: "pointer", fontWeight: 500 }}
                    onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/orders/${r.order.id}`);
                    }}
                >
                    {r.order.order_code}
                </span>
            ),
        },
        { 
            title: "Paciente", 
            key: "patient", 
            render: (_, r) => {
                if (!r.patient_name || !r.patient_id) return "—";
                return (
                    <PatientCell
                        patientId={r.patient_id}
                        patientName={r.patient_name}
                        patientCode={r.patient_code}
                    />
                );
            },
        },
        { 
            title: "Tipo", 
            dataIndex: "type", 
            key: "type", 
            width: 140,
            filters: typeFilters,
            onFilter: (value, record) => record.type === value,
        },
        { 
            title: "Estado", 
            dataIndex: "state", 
            key: "state", 
            width: 120,
            render: (state: string) => renderStatusChip(state, "sample"),
            filters: stateFilters,
            onFilter: (value, record) => record.state === value,
        },
        ...(rows.some(r => r.labels && r.labels.length > 0) ? [{
            title: "Labels",
            key: "labels",
            width: 200,
            render: (_: any, r: Row) => 
                r.labels && r.labels.length > 0 ? renderLabels(r.labels) : <span style={{ color: "#888", fontSize: 12 }}>—</span>,
        }] : []),
    ];

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
                        title={<span style={cardTitleStyle}>Muestras</span>}
                        extra={
                            <Space>
                                <Input.Search
                                    allowClear
                                    placeholder="Buscar por código, tipo, orden" 
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    onSearch={(v) => setSearch(v)}
                                    style={{ width: 320 }}
                                />
                                <Button type="primary" onClick={() => navigate("/samples/register")}>
                                    Registrar Muestra
                                </Button>
                            </Space>
                        }
                        style={cardStyle}
                    >
                        <CelumaTable
                            dataSource={filtered}
                            columns={columns}
                            rowKey={(r) => r.id}
                            loading={loading}
                            onRowClick={(record) => navigate(`/samples/${record.id}`)}
                            emptyText="Sin muestras"
                            pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: ["10", "20", "50"] }}
                        />
                        {error && <ErrorText>{error}</ErrorText>}
                    </Card>
                </div>
            </Layout.Content>
        </Layout>
    );
}
