import { useEffect, useMemo, useState } from "react";
import { Layout, Input, Button, Card, Space, Avatar, Tooltip } from "antd";
import { CheckCircleOutlined, ClockCircleOutlined } from "@ant-design/icons";
import { useLocation, useNavigate } from "react-router-dom";
import type { ColumnsType } from "antd/es/table";
import SidebarCeluma from "../components/ui/sidebar_menu";
import type { CelumaKey } from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import ErrorText from "../components/ui/error_text";
import { tokens, cardStyle, cardTitleStyle } from "../components/design/tokens";
import { CelumaTable } from "../components/ui/celuma_table";
import { PatientCell, renderStatusChip, stringSorter, getInitials, getAvatarColor } from "../components/ui/table_helpers";
import { usePageTitle } from "../hooks/use_page_title";

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
        reviewers?: Array<{ id: string; name: string; email: string; avatar_url?: string | null; status: string; review_id?: string | null }>;
    }>;
};

export default function ReportsList() {
    usePageTitle();
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
        return rows.filter((r) => {
            // Search in basic fields
            const basicFields = [r.title, r.diagnosis_text, r.order.order_code, r.order.patient?.full_name, r.order.patient?.patient_code, r.order.requested_by]
                .filter(Boolean)
                .some((v) => String(v).toLowerCase().includes(q));
            
            // Search in reviewers
            const reviewerMatch = r.reviewers?.some(reviewer => 
                reviewer.name.toLowerCase().includes(q) || reviewer.email.toLowerCase().includes(q)
            ) || false;
            
            return basicFields || reviewerMatch;
        });
    }, [rows, search]);

    // Get unique statuses for filter
    const statusFilters = useMemo(() => {
        const statuses = new Set(rows.map(r => r.status));
        return Array.from(statuses).map(status => ({
            text: renderStatusChip(status, "report").props.children,
            value: status,
        }));
    }, [rows]);

    // Get unique reviewers for filters
    const reviewerFilters = useMemo(() => {
        const reviewersMap = new Map<string, string>();
        rows.forEach(r => {
            r.reviewers?.forEach(reviewer => {
                if (!reviewersMap.has(reviewer.id)) {
                    reviewersMap.set(reviewer.id, reviewer.name);
                }
            });
        });
        return Array.from(reviewersMap.entries())
            .sort((a, b) => a[1].localeCompare(b[1]))
            .map(([id, name]) => ({
                text: name,
                value: id,
        }));
    }, [rows]);

    // Get unique patients for filters
    const patientFilters = useMemo(() => {
        const patients = new Map<string, string>();
        rows.forEach(r => {
            if (r.order.patient?.id && r.order.patient?.full_name) {
                patients.set(r.order.patient.id, r.order.patient.full_name);
            }
        });
        return Array.from(patients.entries())
            .sort((a, b) => a[1].localeCompare(b[1]))
            .map(([id, name]) => ({
                text: name,
                value: id,
            }));
    }, [rows]);

    // Published filter -> PDF filter
    const pdfFilters = [
        { text: "Con PDF", value: true },
        { text: "Sin PDF", value: false },
    ];

    const columns: ColumnsType<ReportsListResponse["reports"][number]> = [
        { 
            title: "Código", 
            key: "order", 
            width: 140,
            render: (_, r) => (
                <span 
                style={{ 
                    color: "#0f8b8d", 
                    cursor: "pointer", 
                    fontWeight: 600,
                    textDecoration: "none",
                    borderBottom: "1px dashed #0f8b8d"
                }}
                    onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/orders/${r.order.id}`);
                    }}
                >
                    {r.order.order_code}
                </span>
            ),
            sorter: (a, b) => a.order.order_code.localeCompare(b.order.order_code),
            defaultSortOrder: "ascend",
        },
        { 
            title: "Título", 
            dataIndex: "title", 
            key: "title", 
            width: 200,
            render: (title: string | null) => title || <span style={{ color: "#888" }}>Sin título</span>,
            sorter: (a, b) => (a.title || "").localeCompare(b.title || ""),
        },
        { 
            title: "Paciente", 
            key: "patient",
            sorter: (a, b) => {
                const nameA = a.order.patient?.full_name || a.order.patient?.patient_code || "";
                const nameB = b.order.patient?.full_name || b.order.patient?.patient_code || "";
                return nameA.localeCompare(nameB);
            },
            filters: patientFilters,
            onFilter: (value, record) => record.order.patient?.id === value,
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
            sorter: stringSorter("status"),
        },
        { 
            title: "PDF", 
            dataIndex: "has_pdf", 
            key: "has_pdf", 
            width: 80,
            align: "center" as const,
            render: (v: boolean) => v ? (
                <CheckCircleOutlined style={{ color: "#10b981", fontSize: 16 }} />
            ) : (
                <ClockCircleOutlined style={{ color: "#f59e0b", fontSize: 16 }} />
            ),
            filters: pdfFilters,
            onFilter: (value, record) => record.has_pdf === value,
        },
        ...(rows.some(r => r.reviewers && r.reviewers.length > 0) ? [{
            title: "Revisores",
            key: "reviewers",
            width: 140,
            filters: reviewerFilters,
            onFilter: (value: boolean | React.Key, record: ReportsListResponse["reports"][number]) => {
                return record.reviewers?.some(reviewer => reviewer.id === value) || false;
            },
            render: (_: unknown, r: ReportsListResponse["reports"][number]) => {
                if (!r.reviewers || r.reviewers.length === 0) return <span style={{ color: "#888" }}>—</span>;
                return (
                    <Avatar.Group maxCount={3} size="small">
                        {r.reviewers.map(reviewer => (
                            <Tooltip key={reviewer.id} title={`${reviewer.name} (${reviewer.status})`}>
                                <Avatar 
                                    size={24}
                                    src={reviewer.avatar_url}
                                    style={{ 
                                        backgroundColor: reviewer.avatar_url ? undefined : getAvatarColor(reviewer.name),
                                        fontSize: 10,
                                    }}
                                >
                                    {!reviewer.avatar_url && getInitials(reviewer.name)}
                                </Avatar>
                            </Tooltip>
                        ))}
                    </Avatar.Group>
                );
            },
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
                        title={<span style={cardTitleStyle}>Reportes</span>}
                        extra={
                            <Space>
                                <Input.Search
                                    allowClear
                                    placeholder="Buscar en reportes" 
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
                            pagination={{ pageSize: 10 }}
                            locale={{
                                filterTitle: 'Filtrar',
                                filterConfirm: 'Aceptar',
                                filterReset: 'Limpiar',
                                filterEmptyText: 'Sin filtros',
                                filterCheckall: 'Seleccionar todo',
                                filterSearchPlaceholder: 'Buscar en filtros',
                                emptyText: 'Sin reportes',
                                selectAll: 'Seleccionar todo',
                                selectInvert: 'Invertir selección',
                                selectNone: 'Limpiar selección',
                                selectionAll: 'Seleccionar todos',
                                sortTitle: 'Ordenar',
                                expand: 'Expandir fila',
                                collapse: 'Colapsar fila',
                                triggerDesc: 'Clic para ordenar descendente',
                                triggerAsc: 'Clic para ordenar ascendente',
                                cancelSort: 'Clic para cancelar ordenamiento',
                            }}
                        />
                        {error && <ErrorText>{error}</ErrorText>}
                    </Card>
                </div>
            </Layout.Content>
        </Layout>
    );
}
