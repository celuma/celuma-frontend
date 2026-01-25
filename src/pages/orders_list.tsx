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
import { PatientCell, renderStatusChip, renderLabels, stringSorter, getInitials, getAvatarColor } from "../components/ui/table_helpers";
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
        assignees?: Array<{ id: string; name: string; email: string; avatar_url?: string | null }>;
    }>;
};

export default function OrdersList() {
    usePageTitle();
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
        return rows.filter((r) => {
            // Search in basic fields
            const basicFields = [r.order_code, r.patient.full_name, r.patient.patient_code, r.requested_by, r.notes]
                .filter(Boolean)
                .some((v) => String(v).toLowerCase().includes(q));
            
            // Search in labels
            const labelMatch = r.labels?.some(label => 
                label.name.toLowerCase().includes(q)
            ) || false;
            
            // Search in assignees
            const assigneeMatch = r.assignees?.some(user => 
                user.name.toLowerCase().includes(q) || user.email.toLowerCase().includes(q)
            ) || false;
            
            return basicFields || labelMatch || assigneeMatch;
        });
    }, [rows, search]);

    // Get unique statuses for filter
    const statusFilters = useMemo(() => {
        const statuses = new Set(rows.map(r => r.status));
        return Array.from(statuses).map(status => ({
            text: renderStatusChip(status, "order").props.children,
            value: status,
        }));
    }, [rows]);

    // Get unique labels for filters
    const labelFilters = useMemo(() => {
        const labelsMap = new Map<string, { name: string; color: string }>();
        rows.forEach(r => {
            r.labels?.forEach(label => {
                if (!labelsMap.has(label.id)) {
                    labelsMap.set(label.id, { name: label.name, color: label.color });
                }
            });
        });
        return Array.from(labelsMap.entries())
            .sort((a, b) => a[1].name.localeCompare(b[1].name))
            .map(([id, label]) => ({
                text: label.name,
                value: id,
            }));
    }, [rows]);

    // Get unique assignees for filters
    const assigneeFilters = useMemo(() => {
        const assigneesMap = new Map<string, string>();
        rows.forEach(r => {
            r.assignees?.forEach(user => {
                if (!assigneesMap.has(user.id)) {
                    assigneesMap.set(user.id, user.name);
                }
            });
        });
        return Array.from(assigneesMap.entries())
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
            if (r.patient?.id && r.patient?.full_name) {
                patients.set(r.patient.id, r.patient.full_name);
            }
        });
        return Array.from(patients.entries())
            .sort((a, b) => a[1].localeCompare(b[1]))
            .map(([id, name]) => ({
                text: name,
                value: id,
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
            sorter: (a, b) => {
                const nameA = a.patient?.full_name || a.patient?.patient_code || "";
                const nameB = b.patient?.full_name || b.patient?.patient_code || "";
                return nameA.localeCompare(nameB);
            },
            filters: patientFilters,
            onFilter: (value, record) => record.patient?.id === value,
            render: (_, r) => {
                if (!r.patient?.full_name || !r.patient?.id) return "—";
                return (
                    <PatientCell
                        patientId={r.patient.id}
                        patientName={r.patient.full_name}
                        patientCode={r.patient.patient_code}
                    />
                );
            },
        },
        { 
            title: "Estado", 
            dataIndex: "status", 
            key: "status", 
            width: 120,
            render: (status: string) => renderStatusChip(status, "order"),
            filters: statusFilters,
            onFilter: (value, record) => record.status === value,
            sorter: stringSorter("status"),
        },
        ...(rows.some(r => r.labels && r.labels.length > 0) ? [{
            title: "Etiquetas",
            key: "labels",
            width: 200,
            filters: labelFilters,
            onFilter: (value: boolean | React.Key, record: OrdersListResponse["orders"][number]) => {
                return record.labels?.some(label => label.id === value) || false;
            },
            render: (_: unknown, r: OrdersListResponse["orders"][number]) => 
                r.labels && r.labels.length > 0 ? renderLabels(r.labels) : <span style={{ color: "#888", fontSize: 12 }}>—</span>,
        }] : []),
        { 
            title: "Reporte", 
            dataIndex: "has_report", 
            key: "has_report", 
            width: 110,
            align: "center" as const,
            render: (v: boolean) => v ? (
                <CheckCircleOutlined style={{ color: "#10b981", fontSize: 16 }} />
            ) : (
                <ClockCircleOutlined style={{ color: "#f59e0b", fontSize: 16 }} />
            ),
            filters: [
                { text: "Con Reporte", value: true },
                { text: "Sin Reporte", value: false },
            ],
            onFilter: (value, record) => record.has_report === value,
        },
        ...(rows.some(r => r.assignees && r.assignees.length > 0) ? [{
            title: "Asignados",
            key: "assignees",
            width: 140,
            filters: assigneeFilters,
            onFilter: (value: boolean | React.Key, record: OrdersListResponse["orders"][number]) => {
                return record.assignees?.some(user => user.id === value) || false;
            },
            render: (_: unknown, r: OrdersListResponse["orders"][number]) => {
                if (!r.assignees || r.assignees.length === 0) return <span style={{ color: "#888" }}>—</span>;
                return (
                    <Avatar.Group maxCount={3} size="small">
                        {r.assignees.map(user => (
                            <Tooltip key={user.id} title={user.name}>
                                <Avatar 
                                    size={24}
                                    src={user.avatar_url}
                                    style={{ 
                                        backgroundColor: user.avatar_url ? undefined : getAvatarColor(user.name),
                                        fontSize: 10,
                                    }}
                                >
                                    {!user.avatar_url && getInitials(user.name)}
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
                        title={<span style={cardTitleStyle}>Órdenes</span>}
                        extra={
                            <Space>
                                <Input.Search
                                    allowClear
                                    placeholder="Buscar en órdenes" 
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    onSearch={(v) => setSearch(v)}
                                    style={{ width: 320 }}
                                />
                                <Button type="primary" onClick={() => navigate("/orders/register")}>
                                    Registrar Orden
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
                            pagination={{ pageSize: 10 }}
                            locale={{
                                filterTitle: 'Filtrar',
                                filterConfirm: 'Aceptar',
                                filterReset: 'Limpiar',
                                filterEmptyText: 'Sin filtros',
                                filterCheckall: 'Seleccionar todo',
                                filterSearchPlaceholder: 'Buscar en filtros',
                                emptyText: 'Sin casos',
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
