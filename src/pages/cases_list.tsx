import { useEffect, useMemo, useState } from "react";
import { Layout, Input, Tag, Button, Card, Space } from "antd";
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
        labels?: Array<{ id: string; name: string; color: string }>;
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
            [r.order_code, r.patient.full_name, r.patient.patient_code, r.requested_by, r.notes]
                .filter(Boolean)
                .some((v) => String(v).toLowerCase().includes(q))
        );
    }, [rows, search]);

    // Get unique statuses for filter
    const statusFilters = useMemo(() => {
        const statuses = new Set(rows.map(r => r.status));
        return Array.from(statuses).map(status => ({
            text: renderStatusChip(status, "order").props.children,
            value: status,
        }));
    }, [rows]);

    const columns: ColumnsType<OrdersListResponse["orders"][number]> = [
        { 
            title: "Código", 
            dataIndex: "order_code", 
            key: "order_code", 
            width: 140,
            sorter: stringSorter("order_code"),
            defaultSortOrder: "ascend",
        },
        { 
            title: "Paciente", 
            key: "patient", 
            render: (_, r) => (
                <PatientCell
                    patientId={r.patient.id}
                    patientName={r.patient.full_name || r.patient.patient_code}
                    patientCode={r.patient.patient_code}
                />
            ),
        },
        { 
            title: "Estado", 
            dataIndex: "status", 
            key: "status", 
            width: 120,
            render: (status: string) => renderStatusChip(status, "order"),
            filters: statusFilters,
            onFilter: (value, record) => record.status === value,
        },
        ...(rows.some(r => r.labels && r.labels.length > 0) ? [{
            title: "Labels",
            key: "labels",
            width: 200,
            render: (_: any, r: OrdersListResponse["orders"][number]) => 
                r.labels && r.labels.length > 0 ? renderLabels(r.labels) : <span style={{ color: "#888", fontSize: 12 }}>—</span>,
        }] : []),
        { 
            title: "Muestras", 
            dataIndex: "sample_count", 
            key: "sample_count", 
            width: 110,
            align: "center" as const,
        },
        { 
            title: "Reporte", 
            dataIndex: "has_report", 
            key: "has_report", 
            width: 110,
            align: "center" as const,
            render: (v: boolean) => v ? <Tag color="#22c55e">Sí</Tag> : <Tag color="#94a3b8">No</Tag>,
        },
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
                        title={<span style={cardTitleStyle}>Ordenes</span>}
                        extra={
                            <Space>
                                <Input.Search
                                    allowClear
                                    placeholder="Buscar por orden, paciente" 
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
                        <CelumaTable
                            dataSource={filtered}
                            columns={columns}
                            rowKey={(r) => r.id}
                            loading={loading}
                            onRowClick={(record) => navigate(`/orders/${record.id}`)}
                            emptyText="Sin casos"
                            pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: ["10", "20", "50"] }}
                        />
                        {error && <ErrorText>{error}</ErrorText>}
                    </Card>
                </div>
            </Layout.Content>
        </Layout>
    );
}
