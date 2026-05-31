import { useEffect, useMemo, useState } from "react";
import { Layout, Card, Avatar, Tag, Space, Button as AntButton, Popconfirm, Input, Tooltip } from "antd";
import { MailOutlined, PhoneOutlined, IdcardOutlined, BankOutlined, MedicineBoxOutlined, EditOutlined, DeleteOutlined, CheckCircleOutlined, ClockCircleOutlined } from "@ant-design/icons";
import { useNavigate, useParams } from "react-router-dom";
import type { ColumnsType } from "antd/es/table";
import SidebarCeluma from "../components/ui/sidebar_menu";
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

async function deleteJSON(path: string): Promise<void> {
    const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
    const headers: Record<string, string> = { accept: "application/json" };
    if (token) headers["Authorization"] = token;
    const res = await fetch(`${getApiBase()}${path}`, { method: "DELETE", headers, credentials: "include" });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
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

    const filteredOrders = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return rows;
        return rows.filter((row) => {
            const basicFields = [row.order_code, row.status, row.patient?.full_name, row.patient?.patient_code, row.notes]
                .filter(Boolean)
                .some((value) => String(value).toLowerCase().includes(q));
            const labelMatch = row.labels?.some((label) => label.name.toLowerCase().includes(q)) || false;
            const assigneeMatch = row.assignees?.some((user) => user.name.toLowerCase().includes(q) || user.email.toLowerCase().includes(q)) || false;
            return basicFields || labelMatch || assigneeMatch;
        });
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
            width: 140,
            sorter: stringSorter("order_code"),
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
                if (!row.patient?.full_name || !row.patient?.id) return "—";
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
        {
            title: "Reporte",
            dataIndex: "has_report",
            key: "has_report",
            width: 110,
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

    const handleDelete = async () => {
        if (!physicianId) return;
        setError(null);
        try {
            await deleteJSON(`/v1/requesting-physicians/${physicianId}`);
            navigate("/requesting-physicians", { replace: true });
        } catch (err) {
            setError(err instanceof Error ? err.message : "No se pudo desactivar el médico solicitante.");
        }
    };

    return (
        <Layout style={{ minHeight: "100vh", padding: 0, margin: 0 }}>
            <SidebarCeluma selectedKey="/requesting-physicians" onNavigate={(key) => navigate(key)} logoSrc={logo} />
            <Layout.Content style={{ padding: tokens.contentPadding, background: tokens.bg, fontFamily: tokens.textFont }}>
                <style>{`
                    .rp-header { display: flex; align-items: flex-start; gap: 32px; }
                    .rp-avatar-section { display: flex; flex-direction: column; align-items: center; flex-shrink: 0; }
                    .rp-info-section { flex: 1; min-width: 0; }
                    .rp-stats { display: flex; gap: 40px; margin-top: 20px; }
                    .rp-stat { text-align: center; }
                    .rp-details { display: flex; flex-wrap: wrap; gap: 24px; margin-top: 16px; }
                    @media (max-width: 640px) {
                        .rp-header { flex-direction: column; align-items: center; text-align: center; }
                        .rp-details { justify-content: center; }
                        .rp-stats { justify-content: center; gap: 24px; }
                    }
                `}</style>

                <div style={{ maxWidth: tokens.maxWidth, margin: "0 auto", display: "grid", gap: tokens.gap }}>
                    <Card
                        style={cardStyle}
                        loading={loading}
                        extra={!loading && physician ? (
                            <Space>
                                <AntButton icon={<EditOutlined />} onClick={() => navigate(`/requesting-physicians/${physician.id}/edit`)}>
                                    Editar
                                </AntButton>
                                <Popconfirm
                                    title="Desactivar médico solicitante"
                                    description="El médico quedará inactivo y no aparecerá como opción activa."
                                    okText="Desactivar"
                                    cancelText="Cancelar"
                                    onConfirm={handleDelete}
                                >
                                    <AntButton danger icon={<DeleteOutlined />}>
                                        Desactivar
                                    </AntButton>
                                </Popconfirm>
                            </Space>
                        ) : null}
                    >
                        {!loading && physician && (
                            <div className="rp-header">
                                <div className="rp-avatar-section">
                                    <Avatar
                                        size={140}
                                        style={{
                                            backgroundColor: avatarColor,
                                            fontSize: 52,
                                            fontWeight: 700,
                                            border: "3px solid #e5e7eb",
                                        }}
                                    >
                                        {initials}
                                    </Avatar>
                                    <h1 style={{ margin: "16px 0 0 0", fontFamily: tokens.titleFont, fontSize: 24, fontWeight: 800, color: tokens.textPrimary }}>
                                        {physician.full_name}
                                    </h1>
                                    <Space style={{ marginTop: 8 }}>
                                        <Tag color={tokens.primary} style={{ fontSize: 13, padding: "2px 12px", borderRadius: 12 }}>
                                            {physician.physician_code}
                                        </Tag>
                                        <Tag color={physician.is_active ? "green" : "default"}>{physician.is_active ? "Activo" : "Inactivo"}</Tag>
                                    </Space>
                                </div>

                                <div className="rp-info-section">
                                    <div className="rp-details">
                                        {physician.specialty && (
                                            <div style={{ display: "flex", alignItems: "center", gap: 8, color: tokens.textSecondary }}>
                                                <MedicineBoxOutlined style={{ fontSize: 18, color: tokens.primary }} />
                                                <span>{physician.specialty}</span>
                                            </div>
                                        )}
                                        {physician.professional_license && (
                                            <div style={{ display: "flex", alignItems: "center", gap: 8, color: tokens.textSecondary }}>
                                                <IdcardOutlined style={{ fontSize: 18, color: tokens.primary }} />
                                                <span>Cédula: {physician.professional_license}</span>
                                            </div>
                                        )}
                                        {physician.institution && (
                                            <div style={{ display: "flex", alignItems: "center", gap: 8, color: tokens.textSecondary }}>
                                                <BankOutlined style={{ fontSize: 18, color: tokens.primary }} />
                                                <span>{physician.institution}</span>
                                            </div>
                                        )}
                                        {physician.phone && (
                                            <div style={{ display: "flex", alignItems: "center", gap: 8, color: tokens.textSecondary }}>
                                                <PhoneOutlined style={{ fontSize: 16, color: tokens.primary }} />
                                                <span>{physician.phone}</span>
                                            </div>
                                        )}
                                        {physician.email && (
                                            <div style={{ display: "flex", alignItems: "center", gap: 8, color: tokens.textSecondary }}>
                                                <MailOutlined style={{ fontSize: 16, color: tokens.primary }} />
                                                <span>{physician.email}</span>
                                            </div>
                                        )}
                                    </div>
                                    {physician.address && (
                                        <div style={{ color: tokens.textSecondary, marginTop: 24 }}>
                                            <div style={{ fontWeight: 700, color: tokens.textPrimary, marginBottom: 4 }}>Dirección</div>
                                            <div>{physician.address}</div>
                                        </div>
                                    )}

                                    <div className="rp-stats">
                                        <div className="rp-stat">
                                            <div style={{ fontSize: 26, fontWeight: 700, color: tokens.primary, fontFamily: tokens.titleFont }}>{totalOrders}</div>
                                            <div style={{ fontSize: 13, color: tokens.textSecondary }}>Órdenes</div>
                                        </div>
                                        <div className="rp-stat">
                                            <div style={{ fontSize: 26, fontWeight: 700, color: "#22c55e", fontFamily: tokens.titleFont }}>{totalReports}</div>
                                            <div style={{ fontSize: 13, color: tokens.textSecondary }}>Reportes</div>
                                        </div>
                                        <div className="rp-stat">
                                            <div style={{ fontSize: 26, fontWeight: 700, color: "#f59e0b", fontFamily: tokens.titleFont }}>{totalSamples}</div>
                                            <div style={{ fontSize: 13, color: tokens.textSecondary }}>Muestras</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                        {error && <ErrorText>{error}</ErrorText>}
                    </Card>

                    <Card
                        title={<span style={cardTitleStyle}>Historial de Órdenes</span>}
                        loading={loading}
                        style={cardStyle}
                        extra={!loading && physician ? (
                            <Space>
                                <Input.Search
                                    allowClear
                                    placeholder="Buscar en órdenes"
                                    value={search}
                                    onChange={(event) => setSearch(event.target.value)}
                                    onSearch={(value) => setSearch(value)}
                                    style={{ width: 300 }}
                                />
                                <AntButton type="primary" onClick={() => navigate(`/orders/register?requestingPhysicianId=${physician.id}`)}>
                                    Registrar Orden
                                </AntButton>
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
                            />
                        )}
                        {error && <ErrorText>{error}</ErrorText>}
                    </Card>
                </div>
            </Layout.Content>
        </Layout>
    );
}
