import { useEffect, useMemo, useState } from "react";
import { Layout, Card, Space, Button as AntButton, Avatar, Input, Tag, Tooltip } from "antd";
import { PhoneOutlined, MailOutlined, CalendarOutlined, ManOutlined, WomanOutlined, CheckCircleOutlined, ClockCircleOutlined } from "@ant-design/icons";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import type { ColumnsType } from "antd/es/table";
import SidebarCeluma from "../components/ui/sidebar_menu";
import type { CelumaKey } from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import ErrorText from "../components/ui/error_text";
import { tokens, cardTitleStyle, cardStyle } from "../components/design/tokens";
import { CelumaTable } from "../components/ui/celuma_table";
import { renderStatusChip, renderLabels, stringSorter, getInitials, getAvatarColor } from "../components/ui/table_helpers";

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
        labels?: Array<{ id: string; name: string; color: string }> | null;
        assignees?: Array<{ id: string; name: string; email: string; avatar_url?: string | null }> | null;
    }>;
};

type PatientDetail = {
    id: string;
    patient_code: string;
    first_name?: string;
    last_name?: string;
    dob?: string | null;
    sex?: string | null;
    phone?: string | null;
    email?: string | null;
    avatar_url?: string | null;
};

export default function PatientDetailPage() {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const { patientId } = useParams();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [ordersResp, setOrdersResp] = useState<OrdersListResponse | null>(null);
    const [patient, setPatient] = useState<PatientDetail | null>(null);
    const [search, setSearch] = useState("");

    useEffect(() => {
        if (!patientId) return;
        (async () => {
            setLoading(true);
            setError(null);
            try {
                const [orders, detail] = await Promise.all([
                    getJSON<OrdersListResponse>(`/v1/laboratory/patients/${patientId}/orders`),
                    getJSON<PatientDetail>(`/v1/patients/${patientId}`),
                ]);
                orders.orders.sort((a, b) => {
                    const ad = a.created_at ? Date.parse(a.created_at) : 0;
                    const bd = b.created_at ? Date.parse(b.created_at) : 0;
                    if (ad !== bd) return bd - ad;
                    return b.order_code.localeCompare(a.order_code);
                });
                setOrdersResp(orders);
                setPatient(detail);
            } catch (err) {
                setError(err instanceof Error ? err.message : "Ocurrió un error inesperado.");
            } finally {
                setLoading(false);
            }
        })();
    }, [patientId]);

    const fullName = useMemo(() => `${patient?.first_name ?? ""} ${patient?.last_name ?? ""}`.trim(), [patient]);
    const initials = useMemo(() => getInitials(patient?.first_name, patient?.last_name), [patient]);
    const avatarColor = useMemo(() => getAvatarColor(fullName || "Patient"), [fullName]);

    const age = useMemo(() => {
        if (!patient?.dob) return null;
        const birthDate = new Date(patient.dob);
        const today = new Date();
        let years = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) years--;
        return years;
    }, [patient?.dob]);

    const totalOrders = ordersResp?.orders?.length ?? 0;
    const totalReports = ordersResp?.orders?.filter(o => o.has_report).length ?? 0;
    const totalSamples = ordersResp?.orders?.reduce((acc, o) => acc + o.sample_count, 0) ?? 0;

    // Get rows for filters and search
    const rows = useMemo(() => ordersResp?.orders ?? [], [ordersResp?.orders]);

    // Filter orders based on search
    const filteredOrders = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return rows;
        return rows.filter((r) => {
            // Search in basic fields
            const basicFields = [r.order_code, r.status, r.requested_by, r.notes]
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

    const columns: ColumnsType<OrdersListResponse["orders"][number]> = [
        { 
            title: "Código", 
            dataIndex: "order_code", 
            key: "order_code", 
            width: 140,
            sorter: stringSorter("order_code"),
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
            onFilter: (value: string | number | boolean, record: OrdersListResponse["orders"][number]) => {
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
            onFilter: (value: string | number | boolean, record: OrdersListResponse["orders"][number]) => {
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
            <SidebarCeluma selectedKey={(pathname as CelumaKey) ?? "/home"} onNavigate={(k) => navigate(k)} logoSrc={logo} />
            <Layout.Content style={{ padding: tokens.contentPadding, background: tokens.bg, fontFamily: tokens.textFont }}>
                <style>{`
                    .patient-header { display: flex; align-items: flex-start; gap: 32px; }
                    .patient-avatar-section { display: flex; flex-direction: column; align-items: center; flex-shrink: 0; }
                    .patient-info-section { flex: 1; display: flex; flex-direction: column; justify-content: center; min-width: 0; }
                    .patient-stats { display: flex; gap: 40px; margin-top: 20px; }
                    .patient-stat { text-align: center; }
                    .patient-details { display: flex; flex-wrap: wrap; gap: 24px; margin-top: 16px; }
                    @media (max-width: 640px) {
                        .patient-header { flex-direction: column; align-items: center; text-align: center; }
                        .patient-info-section { align-items: center; }
                        .patient-stats { justify-content: center; gap: 24px; }
                        .patient-details { justify-content: center; }
                    }
                `}</style>

                <div style={{ maxWidth: tokens.maxWidth, margin: "0 auto", display: "grid", gap: tokens.gap }}>
                    {/* Patient Profile Card */}
                    <Card style={cardStyle} loading={loading}>
                        {!loading && patient && (
                            <div className="patient-header">
                                {/* Avatar Section */}
                                <div className="patient-avatar-section">
                                    <Avatar
                                        size={140}
                                        src={patient.avatar_url}
                                        style={{
                                            backgroundColor: patient.avatar_url ? "transparent" : avatarColor,
                                            fontSize: 52,
                                            fontWeight: 700,
                                            border: "3px solid #e5e7eb",
                                        }}
                                    >
                                        {initials}
                                    </Avatar>

                                    {/* Name under avatar */}
                                    <h1 style={{ margin: "16px 0 0 0", fontFamily: tokens.titleFont, fontSize: 24, fontWeight: 800, color: tokens.textPrimary }}>
                                        {fullName || "Sin nombre"}
                                    </h1>
                                    <Tag color={tokens.primary} style={{ marginTop: 8, fontSize: 13, padding: "2px 12px", borderRadius: 12 }}>
                                        {patient.patient_code}
                                    </Tag>
                                </div>

                                {/* Info Section */}
                                <div className="patient-info-section">
                                    {/* Details Row */}
                                    <div className="patient-details">
                                        {patient.sex && (
                                            <div style={{ display: "flex", alignItems: "center", gap: 8, color: tokens.textSecondary }}>
                                                {patient.sex === "M" ? (
                                                    <ManOutlined style={{ fontSize: 18, color: "#3b82f6" }} />
                                                ) : (
                                                    <WomanOutlined style={{ fontSize: 18, color: "#ec4899" }} />
                                                )}
                                                <span>{patient.sex === "M" ? "Masculino" : "Femenino"}</span>
                                            </div>
                                        )}
                                        {patient.dob && (
                                            <div style={{ display: "flex", alignItems: "center", gap: 8, color: tokens.textSecondary }}>
                                                <CalendarOutlined style={{ fontSize: 16, color: tokens.primary }} />
                                                <span>{age !== null ? `${age} años` : ""} · {new Date(patient.dob).toLocaleDateString("es-MX")}</span>
                                            </div>
                                        )}
                                        {patient.phone && (
                                            <div style={{ display: "flex", alignItems: "center", gap: 8, color: tokens.textSecondary }}>
                                                <PhoneOutlined style={{ fontSize: 16, color: tokens.primary }} />
                                                <span>{patient.phone}</span>
                                            </div>
                                        )}
                                        {patient.email && (
                                            <div style={{ display: "flex", alignItems: "center", gap: 8, color: tokens.textSecondary }}>
                                                <MailOutlined style={{ fontSize: 16, color: tokens.primary }} />
                                                <span>{patient.email}</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Stats */}
                                    <div className="patient-stats">
                                        <div className="patient-stat">
                                            <div style={{ fontSize: 26, fontWeight: 700, color: tokens.primary, fontFamily: tokens.titleFont }}>{totalOrders}</div>
                                            <div style={{ fontSize: 13, color: tokens.textSecondary }}>Órdenes</div>
                                        </div>
                                        <div className="patient-stat">
                                            <div style={{ fontSize: 26, fontWeight: 700, color: "#22c55e", fontFamily: tokens.titleFont }}>{totalReports}</div>
                                            <div style={{ fontSize: 13, color: tokens.textSecondary }}>Reportes</div>
                                        </div>
                                        <div className="patient-stat">
                                            <div style={{ fontSize: 26, fontWeight: 700, color: "#f59e0b", fontFamily: tokens.titleFont }}>{totalSamples}</div>
                                            <div style={{ fontSize: 13, color: tokens.textSecondary }}>Muestras</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </Card>

                    {/* Orders Table Card */}
                    <Card
                        title={<span style={cardTitleStyle}>Historial de Órdenes</span>}
                        loading={loading}
                        style={cardStyle}
                        extra={!loading && patient ? (
                            <Space>
                                <Input.Search
                                    allowClear
                                    placeholder="Buscar por código, estado o notas"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    onSearch={(v) => setSearch(v)}
                                    style={{ width: 300 }}
                                />
                                <AntButton type="primary" onClick={() => navigate(`/orders/register?patientId=${patient.id}`)}>
                                    Registrar Orden
                            </AntButton>
                            </Space>
                        ) : null}
                    >
                        {!loading && (
                            <CelumaTable
                                dataSource={filteredOrders}
                                columns={columns}
                                rowKey={(r) => r.id}
                                loading={loading}
                                onRowClick={(record) => navigate(`/orders/${record.id}`)}
                                emptyText="Sin órdenes"
                                pagination={{ pageSize: 10 }}
                                locale={{
                                    filterTitle: 'Filtrar',
                                    filterConfirm: 'Aceptar',
                                    filterReset: 'Limpiar',
                                    filterEmptyText: 'Sin filtros',
                                    filterCheckall: 'Seleccionar todo',
                                    filterSearchPlaceholder: 'Buscar en filtros',
                                    emptyText: 'Sin órdenes',
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
                        )}
                        {error && <ErrorText>{error}</ErrorText>}
                    </Card>
                </div>
            </Layout.Content>
        </Layout>
    );
}
