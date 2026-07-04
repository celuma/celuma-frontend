import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Layout, Card, Avatar, Space } from "antd";
import { PhoneOutlined, MailOutlined, CalendarOutlined, ManOutlined, WomanOutlined, CheckCircleOutlined, ClockCircleOutlined, EditOutlined } from "@ant-design/icons";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import type { ColumnsType } from "antd/es/table";
import SidebarCeluma from "../components/ui/sidebar_menu";
import type { CelumaKey } from "../components/ui/sidebar_menu";
import CelumaButton from "../components/ui/button";
import SearchField from "../components/ui/search_field";
import Tooltip from "../components/ui/tooltip";
import ActionButtonPanel from "../components/ui/action_button_panel";
import logo from "../images/celuma-isotipo.png";
import ErrorText from "../components/ui/error_text";
import { tokens, cardStyle, cardTitleStyle } from "../components/design/tokens";
import { CelumaTable } from "../components/ui/table";
import { renderStatusChip, renderLabels, stringSorter, getInitials, getAvatarColor } from "../components/ui/table_helpers";
import { usePageTitle } from "../hooks/use_page_title";
import { useUserProfile } from "../hooks/use_user_profile";

const codeChipStyle: CSSProperties = {
    background: tokens.secondary,
    color: "#fff",
    fontSize: 13,
    fontWeight: 600,
    padding: "3px 12px",
    borderRadius: 999,
    lineHeight: 1.5,
};

const MetaItem = ({ icon, children }: { icon: ReactNode; children: ReactNode }) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, color: tokens.textSecondary, fontSize: 14 }}>
        <span style={{ color: tokens.primary, fontSize: 16, display: "inline-flex" }}>{icon}</span>
        {children}
    </span>
);

const Stat = ({ value, label, color }: { value: number; label: string; color: string }) => (
    <div style={{ textAlign: "center", padding: "0 18px" }}>
        <div style={{ fontSize: 24, fontWeight: 800, color, fontFamily: tokens.titleFont, lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 12, color: tokens.textSecondary, marginTop: 2 }}>{label}</div>
    </div>
);

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
        requesting_physician?: { id: string; full_name: string; physician_code: string } | null;
        requested_by?: string | null;
        notes?: string | null;
        created_at?: string | null;
        report_id?: string | null;
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
    usePageTitle();
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const { patientId } = useParams();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [ordersResp, setOrdersResp] = useState<OrdersListResponse | null>(null);
    const [patient, setPatient] = useState<PatientDetail | null>(null);
    const [search, setSearch] = useState("");
    const { hasPermission } = useUserProfile();
    const canEdit = hasPermission("lab:create_patient");

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
    const avatarSeed = fullName || patient?.patient_code || "Patient";
    const initials = useMemo(() => getInitials(avatarSeed), [avatarSeed]);
    const avatarColor = useMemo(() => getAvatarColor(avatarSeed), [avatarSeed]);

    const age = useMemo(() => {
        if (!patient?.dob) return null;
        const birthDate = new Date(patient.dob);
        const today = new Date();
        let years = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) years--;
        return years;
    }, [patient?.dob]);

    const rows = useMemo(() => ordersResp?.orders ?? [], [ordersResp?.orders]);
    const totalOrders = rows.length;
    const totalReports = rows.filter((o) => o.has_report).length;
    const totalSamples = rows.reduce((acc, o) => acc + o.sample_count, 0);

    const filteredOrders = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return rows;
        return rows.filter((row) => {
            const basicFields = [row.order_code, row.status, row.requesting_physician?.full_name, row.requesting_physician?.physician_code, row.requested_by, row.notes]
                .filter(Boolean)
                .some((value) => String(value).toLowerCase().includes(q));
            const labelMatch = row.labels?.some((label) => label.name.toLowerCase().includes(q)) || false;
            const assigneeMatch = row.assignees?.some((user) => user.name.toLowerCase().includes(q) || user.email.toLowerCase().includes(q)) || false;
            return basicFields || labelMatch || assigneeMatch;
        });
    }, [rows, search]);

    const statusFilters = useMemo(() => {
        const statuses = new Set(rows.map((r) => r.status));
        return Array.from(statuses).map((status) => ({
            text: renderStatusChip(status, "order").props.children,
            value: status,
        }));
    }, [rows]);

    const labelFilters = useMemo(() => {
        const labelsMap = new Map<string, { name: string; color: string }>();
        rows.forEach((r) => {
            r.labels?.forEach((label) => {
                if (!labelsMap.has(label.id)) labelsMap.set(label.id, { name: label.name, color: label.color });
            });
        });
        return Array.from(labelsMap.entries())
            .sort((a, b) => a[1].name.localeCompare(b[1].name))
            .map(([id, label]) => ({ text: label.name, value: id }));
    }, [rows]);

    const assigneeFilters = useMemo(() => {
        const assigneesMap = new Map<string, string>();
        rows.forEach((r) => {
            r.assignees?.forEach((user) => {
                if (!assigneesMap.has(user.id)) assigneesMap.set(user.id, user.name);
            });
        });
        return Array.from(assigneesMap.entries())
            .sort((a, b) => a[1].localeCompare(b[1]))
            .map(([id, name]) => ({ text: name, value: id }));
    }, [rows]);

    const requestingPhysicianFilters = useMemo(() => {
        const physicians = new Map<string, string>();
        rows.forEach((r) => {
            if (r.requesting_physician?.id && r.requesting_physician?.full_name) {
                physicians.set(r.requesting_physician.id, r.requesting_physician.full_name);
            }
        });
        return Array.from(physicians.entries())
            .sort((a, b) => a[1].localeCompare(b[1]))
            .map(([id, name]) => ({ text: name, value: id }));
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
        ...(rows.some((r) => r.requesting_physician || r.requested_by) ? [{
            title: "Solicitante",
            key: "requesting_physician",
            width: 220,
            filters: requestingPhysicianFilters.length > 0 ? requestingPhysicianFilters : undefined,
            onFilter: (value: boolean | React.Key, record: OrdersListResponse["orders"][number]) => record.requesting_physician?.id === value,
            sorter: (a: OrdersListResponse["orders"][number], b: OrdersListResponse["orders"][number]) => {
                const nameA = a.requesting_physician?.full_name || a.requested_by || "";
                const nameB = b.requesting_physician?.full_name || b.requested_by || "";
                return nameA.localeCompare(nameB);
            },
            render: (_: unknown, r: OrdersListResponse["orders"][number]) => {
                if (r.requesting_physician) {
                    return (
                        <div>
                            <a
                                href={`/requesting-physicians/${r.requesting_physician.id}`}
                                onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    navigate(`/requesting-physicians/${r.requesting_physician?.id}`);
                                }}
                                style={{ fontWeight: 600, color: "#49b6ad", borderBottom: "1px dashed #49b6ad", display: "inline-block", textDecoration: "none", cursor: "pointer" }}
                            >
                                {r.requesting_physician.full_name}
                            </a>
                            <div style={{ fontSize: 11, color: "#888" }}>{r.requesting_physician.physician_code}</div>
                        </div>
                    );
                }
                return r.requested_by ? <span>{r.requested_by}</span> : <span style={{ color: "#888" }}>—</span>;
            },
        }] : []),
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
        ...(rows.some((r) => r.labels && r.labels.length > 0) ? [{
            title: "Etiquetas",
            key: "labels",
            width: 200,
            filters: labelFilters,
            onFilter: (value: boolean | React.Key, record: OrdersListResponse["orders"][number]) =>
                record.labels?.some((label) => label.id === value) || false,
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
        ...(rows.some((r) => r.assignees && r.assignees.length > 0) ? [{
            title: "Asignados",
            key: "assignees",
            width: 140,
            filters: assigneeFilters,
            onFilter: (value: boolean | React.Key, record: OrdersListResponse["orders"][number]) =>
                record.assignees?.some((user) => user.id === value) || false,
            render: (_: unknown, r: OrdersListResponse["orders"][number]) => {
                if (!r.assignees || r.assignees.length === 0) return <span style={{ color: "#888" }}>—</span>;
                return (
                    <Avatar.Group maxCount={3} size="small">
                        {r.assignees.map((user) => (
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
                    .pd-badge { display: flex; gap: 24px; align-items: flex-start; }
                    .pd-badge-info { flex: 1; min-width: 0; }
                    .pd-meta { display: flex; flex-wrap: wrap; gap: 8px 22px; margin-top: 12px; }
                    .pd-footer { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; margin-top: 18px; }
                    .pd-stats { display: flex; align-items: stretch; margin-left: -18px; }
                    .pd-stat-divider { width: 1px; background: #eef1f0; }
                    @media (max-width: 640px) {
                        .pd-badge { flex-direction: column; align-items: center; text-align: center; }
                        .pd-meta { justify-content: center; }
                        .pd-name-row { justify-content: center; }
                        .pd-footer { justify-content: center; }
                        .pd-stats { margin-left: 0; }
                    }
                `}</style>

                <div style={{ maxWidth: tokens.maxWidth, margin: "0 auto", display: "grid", gap: tokens.gap }}>
                    <Card
                        style={{ ...cardStyle, borderLeft: `5px solid ${tokens.secondary}`, position: "relative" }}
                        loading={loading}
                    >
                        {!loading && patient && (
                            <>
                                <div style={{ position: "absolute", top: 16, right: 20, display: "flex", gap: 6, alignItems: "center" }}>
                                    <span style={codeChipStyle}>{patient.patient_code}</span>
                                </div>
                                <div className="pd-badge">
                                    <Avatar
                                        size={104}
                                        src={patient.avatar_url}
                                        style={{
                                            backgroundColor: patient.avatar_url ? undefined : avatarColor,
                                            fontSize: 38,
                                            fontWeight: 700,
                                            border: "2px solid #d1d5db",
                                            flexShrink: 0,
                                        }}
                                    >
                                        {initials}
                                    </Avatar>
                                    <div className="pd-badge-info">
                                        <div className="pd-name-row" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                                            <h1 style={{ margin: 0, fontFamily: tokens.titleFont, fontSize: 26, fontWeight: 800, color: tokens.textPrimary, lineHeight: 1.1 }}>
                                                {fullName || "Sin nombre"}
                                            </h1>
                                        </div>
                                        <div className="pd-meta">
                                            {patient.sex && (
                                                <MetaItem icon={patient.sex === "M" ? <ManOutlined /> : <WomanOutlined />}>
                                                    {patient.sex === "M" ? "Masculino" : "Femenino"}
                                                </MetaItem>
                                            )}
                                            {patient.dob && (
                                                <MetaItem icon={<CalendarOutlined />}>
                                                    {age !== null ? `${age} años · ` : ""}{new Date(patient.dob).toLocaleDateString("es-MX")}
                                                </MetaItem>
                                            )}
                                            {patient.phone && <MetaItem icon={<PhoneOutlined />}>{patient.phone}</MetaItem>}
                                            {patient.email && <MetaItem icon={<MailOutlined />}>{patient.email}</MetaItem>}
                                        </div>
                                        <div className="pd-footer">
                                            <div className="pd-stats">
                                                <Stat value={totalOrders} label="Órdenes" color={tokens.primary} />
                                                <div className="pd-stat-divider" />
                                                <Stat value={totalReports} label="Reportes" color="#22c55e" />
                                                <div className="pd-stat-divider" />
                                                <Stat value={totalSamples} label="Muestras" color="#f59e0b" />
                                            </div>
                                            {canEdit && (
                                                <ActionButtonPanel
                                                    actions={[
                                                        {
                                                            icon: <EditOutlined />,
                                                            tooltip: "Editar paciente",
                                                            ariaLabel: "Editar",
                                                            onClick: () => navigate(`/patients/${patient.id}/edit`),
                                                        },
                                                    ]}
                                                />
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                        {error && <ErrorText>{error}</ErrorText>}
                    </Card>

                    <Card
                        title={<span style={cardTitleStyle}>Historial de Órdenes</span>}
                        loading={loading}
                        style={cardStyle}
                        extra={!loading && patient ? (
                            <Space size={10}>
                                <SearchField
                                    small
                                    value={search}
                                    onChange={setSearch}
                                    placeholder="Buscar en órdenes"
                                    style={{ width: 240 }}
                                />
                                <CelumaButton size="small" type="primary" onClick={() => navigate(`/orders/register?patientId=${patient.id}`)}>
                                    Registrar Orden
                                </CelumaButton>
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
                                    filterCheckAll: 'Seleccionar todo',
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
