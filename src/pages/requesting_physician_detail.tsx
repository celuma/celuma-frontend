import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Layout, Card, Avatar, Space } from "antd";
import { MailOutlined, PhoneOutlined, IdcardOutlined, BankOutlined, MedicineBoxOutlined, EnvironmentOutlined, EditOutlined, PoweroffOutlined, CheckCircleOutlined, ClockCircleOutlined } from "@ant-design/icons";
import { useNavigate, useParams } from "react-router-dom";
import type { ColumnsType } from "antd/es/table";
import SidebarCeluma from "../components/ui/sidebar_menu";
import CelumaButton from "../components/ui/button";
import SearchField from "../components/ui/search_field";
import ConfirmDialog from "../components/ui/confirm_dialog";
import Tooltip from "../components/ui/tooltip";
import ActionButtonPanel from "../components/ui/action_button_panel";
import logo from "../images/celuma-isotipo.png";
import ErrorText from "../components/ui/error_text";
import { tokens, cardStyle, cardTitleStyle } from "../components/design/tokens";

const codeChipStyle: CSSProperties = {
    background: tokens.secondary,
    color: "#fff",
    fontSize: 13,
    fontWeight: 600,
    padding: "3px 12px",
    borderRadius: 999,
    lineHeight: 1.5,
};

const statusChipStyle = (active: boolean): CSSProperties => ({
    background: active ? "#e9f9f1" : "#f1f5f9",
    color: active ? "#0f9d6e" : "#64748b",
    fontSize: 13,
    fontWeight: 600,
    padding: "3px 12px",
    borderRadius: 999,
    lineHeight: 1.5,
});

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
import { CelumaTable } from "../components/ui/table";
import { matchesQuery } from "../lib/search";
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

async function putJSON<TReq extends object, TRes>(path: string, body: TReq): Promise<TRes> {
    const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
    const headers: Record<string, string> = { "Content-Type": "application/json", accept: "application/json" };
    if (token) headers["Authorization"] = token;
    const res = await fetch(`${getApiBase()}${path}`, { method: "PUT", headers, body: JSON.stringify(body), credentials: "include" });
    const text = await res.text();
    let parsed: unknown = undefined;
    try { parsed = text ? JSON.parse(text) : undefined; } catch { /* ignore */ }
    if (!res.ok) {
        const message = (parsed as { message?: string } | undefined)?.message ?? `${res.status} ${res.statusText}`;
        throw new Error(message);
    }
    return parsed as TRes;
}

type RequestingPhysicianDetail = {
    id: string;
    physician_code: string;
    first_name: string;
    last_name: string;
    full_name: string;
    specialty?: string | null;
    professional_license?: string | null;
    institution?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    is_active: boolean;
};

type OrdersListResponse = {
    orders: Array<{
        id: string;
        order_code: string;
        status: string;
        tenant_id: string;
        branch: { id: string; name?: string; code?: string | null };
        patient?: { id: string; full_name: string; patient_code: string } | null;
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

export default function RequestingPhysicianDetailPage() {
    usePageTitle();
    const navigate = useNavigate();
    const { physicianId } = useParams();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [physician, setPhysician] = useState<RequestingPhysicianDetail | null>(null);
    const [ordersResp, setOrdersResp] = useState<OrdersListResponse | null>(null);
    const [search, setSearch] = useState("");
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [toggling, setToggling] = useState(false);

    useEffect(() => {
        if (!physicianId) return;
        (async () => {
            setLoading(true);
            setError(null);
            try {
                const [detail, orders] = await Promise.all([
                    getJSON<RequestingPhysicianDetail>(`/v1/requesting-physicians/${physicianId}`),
                    getJSON<OrdersListResponse>(`/v1/requesting-physicians/${physicianId}/orders`),
                ]);
                orders.orders.sort((a, b) => {
                    const ad = a.created_at ? Date.parse(a.created_at) : 0;
                    const bd = b.created_at ? Date.parse(b.created_at) : 0;
                    if (ad !== bd) return bd - ad;
                    return b.order_code.localeCompare(a.order_code);
                });
                setPhysician(detail);
                setOrdersResp(orders);
            } catch (err) {
                setError(err instanceof Error ? err.message : "Ocurrió un error inesperado.");
            } finally {
                setLoading(false);
            }
        })();
    }, [physicianId]);

    const avatarSeed = physician?.full_name || physician?.physician_code || "MS";
    const initials = useMemo(() => getInitials(avatarSeed), [avatarSeed]);
    const avatarColor = useMemo(() => getAvatarColor(avatarSeed), [avatarSeed]);
    const rows = useMemo(() => ordersResp?.orders ?? [], [ordersResp?.orders]);
    const totalOrders = rows.length;
    const totalReports = rows.filter((order) => order.has_report).length;
    const totalSamples = rows.reduce((acc, order) => acc + order.sample_count, 0);
    const isActive = !!physician?.is_active;

    const filteredOrders = useMemo(() => {
        if (!search.trim()) return rows;
        return rows.filter((row) => matchesQuery([
            row.order_code,
            row.status,
            row.patient?.full_name,
            row.patient?.patient_code,
            row.notes,
            row.labels?.map((label) => label.name),
            row.assignees?.map((user) => [user.name, user.email]),
        ], search));
    }, [rows, search]);

    const statusFilters = useMemo(() => {
        const statuses = new Set(rows.map((row) => row.status));
        return Array.from(statuses).map((status) => ({
            text: renderStatusChip(status, "order").props.children,
            value: status,
        }));
    }, [rows]);

    const labelFilters = useMemo(() => {
        const labelsMap = new Map<string, { name: string; color: string }>();
        rows.forEach((row) => {
            row.labels?.forEach((label) => {
                if (!labelsMap.has(label.id)) labelsMap.set(label.id, { name: label.name, color: label.color });
            });
        });
        return Array.from(labelsMap.entries())
            .sort((a, b) => a[1].name.localeCompare(b[1].name))
            .map(([id, label]) => ({ text: label.name, value: id }));
    }, [rows]);

    const assigneeFilters = useMemo(() => {
        const assigneesMap = new Map<string, string>();
        rows.forEach((row) => {
            row.assignees?.forEach((user) => {
                if (!assigneesMap.has(user.id)) assigneesMap.set(user.id, user.name);
            });
        });
        return Array.from(assigneesMap.entries())
            .sort((a, b) => a[1].localeCompare(b[1]))
            .map(([id, name]) => ({ text: name, value: id }));
    }, [rows]);

    const columns: ColumnsType<OrdersListResponse["orders"][number]> = [
        {
            title: "Código",
            dataIndex: "order_code",
            key: "order_code",
            width: 120,
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
            render: (_, row) => {
                if (!row.patient?.full_name || !row.patient?.id) return <span style={{ color: "#888" }}>—</span>;
                return (
                    <PatientCell
                        patientId={row.patient.id}
                        patientName={row.patient.full_name}
                        patientCode={row.patient.patient_code}
                    />
                );
            },
        },
        {
            title: "Reporte",
            dataIndex: "has_report",
            key: "has_report",
            width: 80,
            align: "center" as const,
            render: (hasReport: boolean) => hasReport ? (
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
        ...(rows.some((row) => row.labels && row.labels.length > 0) ? [{
            title: "Etiquetas",
            key: "labels",
            width: 200,
            filters: labelFilters,
            onFilter: (value: boolean | React.Key, record: OrdersListResponse["orders"][number]) => record.labels?.some((label) => label.id === value) || false,
            render: (_: unknown, row: OrdersListResponse["orders"][number]) =>
                row.labels && row.labels.length > 0 ? renderLabels(row.labels) : <span style={{ color: "#888", fontSize: 12 }}>—</span>,
        }] : []),
        ...(rows.some((row) => row.assignees && row.assignees.length > 0) ? [{
            title: "Asignados",
            key: "assignees",
            width: 140,
            filters: assigneeFilters,
            onFilter: (value: boolean | React.Key, record: OrdersListResponse["orders"][number]) => record.assignees?.some((user) => user.id === value) || false,
            render: (_: unknown, row: OrdersListResponse["orders"][number]) => {
                if (!row.assignees || row.assignees.length === 0) return <span style={{ color: "#888" }}>—</span>;
                return (
                    <Avatar.Group maxCount={3} size="small">
                        {row.assignees.map((user) => (
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

    const handleToggleActive = async () => {
        if (!physician) return;
        const next = !physician.is_active;
        setError(null);
        setToggling(true);
        try {
            await putJSON(`/v1/requesting-physicians/${physician.id}`, { is_active: next });
            setPhysician({ ...physician, is_active: next });
            setConfirmOpen(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : "No se pudo actualizar el estado del médico solicitante.");
        } finally {
            setToggling(false);
        }
    };

    return (
        <Layout style={{ minHeight: "100vh", padding: 0, margin: 0 }}>
            <SidebarCeluma selectedKey="/requesting-physicians" onNavigate={(key) => navigate(key)} logoSrc={logo} />
            <Layout.Content style={{ padding: tokens.contentPadding, background: tokens.bg, fontFamily: tokens.textFont }}>
                <style>{`
                    .rp-badge { display: flex; gap: 24px; align-items: flex-start; }
                    .rp-badge-info { flex: 1; min-width: 0; }
                    .rp-meta { display: flex; flex-wrap: wrap; gap: 8px 22px; margin-top: 12px; }
                    .rp-footer { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; margin-top: 18px; }
                    .rp-stats { display: flex; align-items: stretch; margin-left: -18px; }
                    .rp-stat-divider { width: 1px; background: #eef1f0; }
                    @media (max-width: 640px) {
                        .rp-badge { flex-direction: column; align-items: center; text-align: center; }
                        .rp-meta { justify-content: center; }
                        .rp-name-row { justify-content: center; }
                        .rp-footer { justify-content: center; }
                        .rp-stats { margin-left: 0; }
                    }
                `}</style>

                <div style={{ maxWidth: tokens.maxWidth, margin: "0 auto", display: "grid", gap: tokens.gap }}>
                    <Card
                        style={{ ...cardStyle, borderLeft: `5px solid ${tokens.secondary}`, position: "relative" }}
                        loading={loading}
                    >
                        {!loading && physician && (
                            <>
                                <div style={{ position: "absolute", top: 16, right: 20, display: "flex", gap: 6, alignItems: "center" }}>
                                    <span style={codeChipStyle}>{physician.physician_code}</span>
                                    <span style={statusChipStyle(physician.is_active)}>{physician.is_active ? "Activo" : "Inactivo"}</span>
                                </div>
                            <div className="rp-badge">
                                <Avatar
                                    size={104}
                                    style={{
                                        backgroundColor: avatarColor,
                                        fontSize: 38,
                                        fontWeight: 700,
                                        border: "2px solid #d1d5db",
                                        flexShrink: 0,
                                    }}
                                >
                                    {initials}
                                </Avatar>
                                <div className="rp-badge-info">
                                    <div className="rp-name-row" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                                        <h1 style={{ margin: 0, fontFamily: tokens.titleFont, fontSize: 26, fontWeight: 800, color: tokens.textPrimary, lineHeight: 1.1 }}>
                                            {physician.full_name}
                                        </h1>
                                    </div>
                                    <div className="rp-meta">
                                        {physician.specialty && <MetaItem icon={<MedicineBoxOutlined />}>{physician.specialty}</MetaItem>}
                                        {physician.professional_license && <MetaItem icon={<IdcardOutlined />}>Cédula: {physician.professional_license}</MetaItem>}
                                        {physician.institution && <MetaItem icon={<BankOutlined />}>{physician.institution}</MetaItem>}
                                        {physician.phone && <MetaItem icon={<PhoneOutlined />}>{physician.phone}</MetaItem>}
                                        {physician.email && <MetaItem icon={<MailOutlined />}>{physician.email}</MetaItem>}
                                        {physician.address && <MetaItem icon={<EnvironmentOutlined />}>{physician.address}</MetaItem>}
                                    </div>
                                    <div className="rp-footer">
                                        <div className="rp-stats">
                                            <Stat value={totalOrders} label="Órdenes" color={tokens.primary} />
                                            <div className="rp-stat-divider" />
                                            <Stat value={totalReports} label="Reportes" color="#22c55e" />
                                            <div className="rp-stat-divider" />
                                            <Stat value={totalSamples} label="Muestras" color="#f59e0b" />
                                        </div>
                                        <ActionButtonPanel
                                            actions={[
                                                {
                                                    icon: <EditOutlined />,
                                                    tooltip: "Editar médico",
                                                    ariaLabel: "Editar",
                                                    onClick: () => navigate(`/requesting-physicians/${physician.id}/edit`),
                                                },
                                                {
                                                    icon: <PoweroffOutlined />,
                                                    tooltip: isActive ? "Desactivar médico" : "Activar médico",
                                                    ariaLabel: isActive ? "Desactivar" : "Activar",
                                                    danger: isActive,
                                                    onClick: () => setConfirmOpen(true),
                                                },
                                            ]}
                                        />
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
                        extra={!loading && physician ? (
                            <Space size={10}>
                                <SearchField
                                    small
                                    value={search}
                                    onChange={setSearch}
                                    placeholder="Buscar en órdenes"
                                    style={{ width: 240 }}
                                />
                                <CelumaButton size="small" type="primary" onClick={() => navigate(`/orders/register?requestingPhysicianId=${physician.id}`)}>
                                    Registrar Orden
                                </CelumaButton>
                            </Space>
                        ) : null}
                    >
                        {!loading && (
                            <CelumaTable
                                dataSource={filteredOrders}
                                columns={columns}
                                rowKey={(row) => row.id}
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

                <ConfirmDialog
                    open={confirmOpen}
                    danger={isActive}
                    title={isActive ? "Desactivar médico solicitante" : "Activar médico solicitante"}
                    description={isActive
                        ? "El médico quedará inactivo y no aparecerá como opción activa para nuevas órdenes."
                        : "El médico volverá a estar disponible como opción activa para nuevas órdenes."}
                    confirmText={isActive ? "Desactivar" : "Activar"}
                    cancelText="Cancelar"
                    loading={toggling}
                    onConfirm={handleToggleActive}
                    onCancel={() => setConfirmOpen(false)}
                />
            </Layout.Content>
        </Layout>
    );
}
