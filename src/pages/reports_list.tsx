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
import { PatientCell, renderStatusChip, stringSorter } from "../components/ui/table_helpers";

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
            [r.title, r.diagnosis_text, r.order.order_code, r.order.patient?.full_name, r.order.patient?.patient_code, r.order.requested_by]
                .filter(Boolean)
                .some((v) => String(v).toLowerCase().includes(q))
        );
    }, [rows, search]);

    // Get unique statuses for filter
    const statusFilters = useMemo(() => {
        const statuses = new Set(rows.map(r => r.status));
        return Array.from(statuses).map(status => ({
            text: renderStatusChip(status, "report").props.children,
            value: status,
        }));
    }, [rows]);

    // Published filter
    const publishedFilters = [
        { text: "Publicado", value: "published" },
        { text: "No Publicado", value: "not_published" },
    ];

    const columns: ColumnsType<ReportsListResponse["reports"][number]> = [
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
            sorter: stringSorter("order.order_code"),
            defaultSortOrder: "ascend",
        },
        { 
            title: "Título", 
            dataIndex: "title", 
            key: "title", 
            width: 200,
            render: (title: string | null) => title || <span style={{ color: "#888" }}>Sin título</span>,
        },
        { 
            title: "Paciente", 
            key: "patient", 
            render: (_, r) => {
                const patientName = r.order.patient?.full_name || r.order.patient?.patient_code;
                if (!patientName || !r.order.patient) return "—";
                return (
                    <PatientCell
                        patientId={r.order.patient.id}
                        patientName={patientName}
                        patientCode={r.order.patient.patient_code}
                    />
                );
            },
        },
        { 
            title: "Estado", 
            dataIndex: "status", 
            key: "status", 
            width: 120,
            render: (status: string) => renderStatusChip(status, "report"),
            filters: statusFilters,
            onFilter: (value, record) => record.status === value,
        },
        { 
            title: "Publicado", 
            dataIndex: "published_at", 
            key: "published",
            width: 110,
            align: "center" as const,
            render: (v: string | null) => v ? <Tag color="#22c55e">Sí</Tag> : <Tag color="#94a3b8">No</Tag>,
            filters: publishedFilters,
            onFilter: (value, record) => {
                if (value === "published") return !!record.published_at;
                return !record.published_at;
            },
        },
        { 
            title: "Versión", 
            dataIndex: "version_no", 
            key: "version_no", 
            width: 90,
            align: "center" as const,
            render: (v: number | null) => v ?? "—",
        },
        { 
            title: "PDF", 
            dataIndex: "has_pdf", 
            key: "has_pdf", 
            width: 80,
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
                        <CelumaTable
                            dataSource={filtered}
                            columns={columns}
                            rowKey={(r) => r.id}
                            loading={loading}
                            onRowClick={(record) => navigate(`/reports/${record.id}`)}
                            emptyText="Sin reportes"
                            pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: ["10", "20", "50"] }}
                        />
                        {error && <ErrorText>{error}</ErrorText>}
                    </Card>
                </div>
            </Layout.Content>
        </Layout>
    );
}
