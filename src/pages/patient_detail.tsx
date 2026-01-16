import { useEffect, useMemo, useState } from "react";
import { Layout, Card, Table, Tag, Empty, Button as AntButton, Avatar } from "antd";
import { PhoneOutlined, MailOutlined, CalendarOutlined, ManOutlined, WomanOutlined } from "@ant-design/icons";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import SidebarCeluma from "../components/ui/sidebar_menu";
import type { CelumaKey } from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import ErrorText from "../components/ui/error_text";
import { tokens, cardTitleStyle, cardStyle } from "../components/design/tokens";

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

const getInitials = (firstName?: string, lastName?: string): string => {
    const first = firstName?.trim()?.[0]?.toUpperCase() || "";
    const last = lastName?.trim()?.[0]?.toUpperCase() || "";
    return first + last || "P";
};

const getAvatarColor = (name: string): string => {
    const colors = ["#0f8b8d", "#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#ef4444", "#6366f1"];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
};

type PatientOrdersResponse = {
    patient_id: string;
    orders: Array<{
        id: string;
        order_code: string;
        status: string;
        tenant_id: string;
        branch_id: string;
        patient_id: string;
        requested_by?: string | null;
        notes?: string | null;
        created_at?: string | null;
        sample_count: number;
        has_report: boolean;
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
    const [ordersResp, setOrdersResp] = useState<PatientOrdersResponse | null>(null);
    const [patient, setPatient] = useState<PatientDetail | null>(null);

    useEffect(() => {
        if (!patientId) return;
        (async () => {
            setLoading(true);
            setError(null);
            try {
                const [orders, detail] = await Promise.all([
                    getJSON<PatientOrdersResponse>(`/v1/laboratory/patients/${patientId}/orders`),
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
                            <AntButton type="primary" onClick={() => navigate(`/cases/register?patientId=${patient.id}`)}>
                                Registrar Caso
                            </AntButton>
                        ) : null}
                    >
                        {!loading && (
                            <Table
                                dataSource={ordersResp?.orders ?? []}
                                rowKey={(r) => r.id}
                                pagination={{ pageSize: 10, showSizeChanger: false }}
                                locale={{ emptyText: <Empty description="Sin órdenes" /> }}
                                columns={[
                                    { 
                                        title: "Fecha", 
                                        dataIndex: "created_at", 
                                        key: "created_at", 
                                        width: 140, 
                                        render: (v: string | null) => v ? new Date(v).toLocaleDateString("es-MX", { year: "numeric", month: "short", day: "numeric" }) : "—" 
                                    },
                                    { title: "Folio", dataIndex: "order_code", key: "order_code", width: 120 },
                                    { title: "Estado", dataIndex: "status", key: "status", width: 120, render: (v: string) => <Tag color={tokens.primary}>{v}</Tag> },
                                    { title: "Muestras", dataIndex: "sample_count", key: "sample_count", width: 90, align: "center" as const },
                                    { title: "Reporte", dataIndex: "has_report", key: "has_report", width: 90, align: "center" as const, render: (v: boolean) => v ? <Tag color="#22c55e">Sí</Tag> : <Tag color="#94a3b8">No</Tag> },
                                    { title: "Notas", dataIndex: "notes", key: "notes", ellipsis: true },
                                ]}
                                onRow={(record) => ({ onClick: () => navigate(`/orders/${record.id}`), style: { cursor: "pointer" } })}
                            />
                        )}
                        <ErrorText>{error}</ErrorText>
                    </Card>
                </div>
            </Layout.Content>
        </Layout>
    );
}
