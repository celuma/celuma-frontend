import { Layout, Card, Row, Col } from "antd";
import { useLocation, useNavigate } from "react-router-dom";
import { UserOutlined, FileTextOutlined, ExperimentOutlined, BarChartOutlined, PlusOutlined, UnorderedListOutlined } from "@ant-design/icons";
import SidebarCeluma from "../components/ui/sidebar_menu";
import type { CelumaKey } from "../components/ui/sidebar_menu";
import StatsCard from "../components/ui/stats_card";
import RecentActivity from "../components/ui/recent_activity";
import DashboardSummary from "../components/ui/dashboard_summary";
import PageHeader from "../components/ui/page_header";
import ErrorText from "../components/ui/error_text";
import { useDashboardData } from "../hooks/use_dashboard_data";
import { usePageTitle } from "../hooks/use_page_title";
import { useUserProfile } from "../hooks/use_user_profile";
import { PERMS } from "../lib/rbac";
import logo from "../images/celuma-isotipo.png";
import { tokens, cardStyle } from "../components/design/tokens";

const Home: React.FC = () => {
    usePageTitle();
    const nav = useNavigate();
    const { pathname } = useLocation();
    const { data, loading, error } = useDashboardData();
    const { hasPermission, profile } = useUserProfile();

    const firstName = profile?.full_name?.trim().split(/\s+/)[0] ?? "";
    const greeting = (() => {
        const h = new Date().getHours();
        if (h < 12) return "Buenos días";
        if (h < 19) return "Buenas tardes";
        return "Buenas noches";
    })();
    const today = (() => {
        const d = new Date().toLocaleDateString("es-MX", {
            weekday: "long", day: "numeric", month: "long", year: "numeric",
        });
        return d.charAt(0).toUpperCase() + d.slice(1);
    })();

    const handleActivityClick = (item: { id: string; type: string }) => {
        switch (item.type) {
            case "order":
                nav(`/orders/${item.id}`);
                break;
            case "report":
                nav(`/reports/${item.id}`);
                break;
            case "sample":
                nav(`/samples/${item.id}`);
                break;
            case "patient":
                nav(`/patients/${item.id}`);
                break;
        }
    };

    return (
        <Layout style={{ minHeight: "100vh", padding: 0, margin: 0 }}>
            <SidebarCeluma
                selectedKey = {(pathname as CelumaKey) ?? "/home"}
                onNavigate = {(k) => nav(k)}
                logoSrc = {logo}
            />

            <Layout.Content style={{ padding: tokens.contentPadding, background: tokens.bg, fontFamily: tokens.textFont }}>
                <div style={{ maxWidth: tokens.maxWidth, margin: "0 auto", display: "grid", gap: tokens.gap }}>
                    {/* Header */}
                    <PageHeader
                        title={`${greeting}${firstName ? `, ${firstName}` : ""} 👋`}
                        subtitle="Resumen de información importante del laboratorio"
                        extra={
                            <span style={{
                                fontSize: 13,
                                fontWeight: 600,
                                color: tokens.primary,
                                background: "#eaf7f5",
                                borderRadius: 100,
                                padding: "6px 14px",
                                whiteSpace: "nowrap",
                            }}>
                                {today}
                            </span>
                        }
                    />

                    {/* Stats Cards */}
                    <Row gutter={[16, 16]}>
                        <Col xs={24} sm={12} lg={6}>
                            <StatsCard
                                title="Total Pacientes"
                                value={data?.stats.total_patients || 0}
                                icon={<UserOutlined />}
                                color="#8b5cf6"
                                loading={loading}
                                onClick={() => nav("/patients")}
                            />
                        </Col>
                        <Col xs={24} sm={12} lg={6}>
                            <StatsCard
                                title="Órdenes de Laboratorio"
                                value={data?.stats.total_orders || 0}
                                icon={<FileTextOutlined />}
                                color="#3b82f6"
                                loading={loading}
                                onClick={() => nav("/orders")}
                            />
                        </Col>
                        <Col xs={24} sm={12} lg={6}>
                            <StatsCard
                                title="Muestras Procesadas"
                                value={data?.stats.total_samples || 0}
                                icon={<ExperimentOutlined />}
                                color="#f59e0b"
                                loading={loading}
                                onClick={() => nav("/samples")}
                            />
                        </Col>
                        <Col xs={24} sm={12} lg={6}>
                            <StatsCard
                                title="Reportes Generados"
                                value={data?.stats.total_reports || 0}
                                icon={<BarChartOutlined />}
                                color="#10b981"
                                loading={loading}
                                onClick={() => nav("/reports")}
                            />
                        </Col>
                    </Row>

                    {/* Secondary Stats */}
                    <Row gutter={[16, 16]}>
                        <Col xs={24} sm={8}>
                            <StatsCard
                                title="Órdenes Pendientes"
                                value={data?.stats.pending_orders || 0}
                                color="#f59e0b"
                                loading={loading}
                                onClick={() => nav("/orders?status=RECEIVED,PROCESSING")}
                            />
                        </Col>
                        <Col xs={24} sm={8}>
                            <StatsCard
                                title="Reportes en Borrador"
                                value={data?.stats.draft_reports || 0}
                                color="#f59e0b"
                                loading={loading}
                                onClick={() => nav("/reports?status=DRAFT")}
                            />
                        </Col>
                        <Col xs={24} sm={8}>
                            <StatsCard
                                title="Reportes Publicados"
                                value={data?.stats.published_reports || 0}
                                color="#22c55e"
                                loading={loading}
                                onClick={() => nav("/reports?status=PUBLISHED")}
                            />
                        </Col>
                    </Row>

                    {/* Recent Activity + side panels */}
                    <Row gutter={[16, 16]}>
                        <Col xs={24} lg={16}>
                            <RecentActivity
                                title="Actividad Reciente"
                                items={data?.recent_activity || []}
                                loading={loading}
                                onItemClick={handleActivityClick}
                            />
                        </Col>
                        <Col xs={24} lg={8}>
                            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                                <Card
                                    style={cardStyle}
                                    styles={{ body: { padding: tokens.cardPadding } }}
                                >
                                    <h3 style={{
                                        fontFamily: tokens.titleFont,
                                        fontSize: 18,
                                        fontWeight: 800,
                                        color: tokens.textPrimary,
                                        margin: "0 0 16px 0"
                                    }}>
                                        Acciones Rápidas
                                    </h3>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                        {([
                                            { perm: PERMS.CREATE_PATIENT, route: "/patients/register", label: "Registrar Nuevo Paciente", icon: <UserOutlined /> },
                                            { perm: PERMS.CREATE_ORDER,   route: "/orders/register",   label: "Crear Nueva Orden",        icon: <PlusOutlined /> },
                                            { perm: PERMS.REPORTS_READ,   route: "/reports",            label: "Ver Todos los Reportes",   icon: <UnorderedListOutlined /> },
                                        ] as const).filter(({ perm }) => hasPermission(perm)).map(({ route, label, icon }) => (
                                            <button
                                                key={route}
                                                onClick={() => nav(route)}
                                                style={{
                                                    padding: "12px 16px",
                                                    border: "1px solid #e5e7eb",
                                                    borderRadius: 8,
                                                    background: "#fff",
                                                    cursor: "pointer",
                                                    textAlign: "left",
                                                    fontSize: 14,
                                                    fontWeight: 500,
                                                    color: "#374151",
                                                    transition: "all 0.2s",
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.background = "#f9fafb";
                                                    e.currentTarget.style.borderColor = "#0f8b8d";
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.background = "#fff";
                                                    e.currentTarget.style.borderColor = "#e5e7eb";
                                                }}
                                            >
                                                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                    <span style={{ color: "#0f8b8d" }}>{icon}</span>
                                                    {label}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </Card>

                                <DashboardSummary stats={data?.stats} loading={loading} />
                            </div>
                        </Col>
                    </Row>

                    {/* Error Display */}
                    {error && <ErrorText>{error}</ErrorText>}
                </div>
            </Layout.Content>
        </Layout>
    );
};

export default Home;
