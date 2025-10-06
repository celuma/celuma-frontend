import { Layout, Card, Row, Col, Typography } from "antd";
import { useLocation, useNavigate } from "react-router-dom";
import { UserOutlined, FileTextOutlined, ExperimentOutlined, BarChartOutlined } from "@ant-design/icons";
import SidebarCeluma from "../components/ui/sidebar_menu";
import type { CelumaKey } from "../components/ui/sidebar_menu";
import StatsCard from "../components/ui/stats_card";
import RecentActivity from "../components/ui/recent_activity";
import ErrorText from "../components/ui/error_text";
import { useDashboardData } from "../hooks/use_dashboard_data";
import logo from "../images/celuma-isotipo.png";
import { tokens } from "../components/design/tokens";

const { Title } = Typography;

const Home: React.FC = () => {
    const nav = useNavigate();
    const { pathname } = useLocation();
    const { data, loading, error } = useDashboardData();

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

            <Layout.Content style={{ padding: 24, background: tokens.bg, fontFamily: tokens.textFont }}>
                <div style={{ maxWidth: 1400, margin: "0 auto", display: "grid", gap: tokens.gap }}>
                    {/* Header */}
                    <Card
                        style={{ borderRadius: tokens.radius, boxShadow: tokens.shadow, background: tokens.cardBg }}
                        bodyStyle={{ padding: 24 }}
                    >
                        <Title 
                            level={2} 
                            style={{ 
                                margin: 0, 
                                fontFamily: tokens.titleFont, 
                                fontSize: 28, 
                                fontWeight: 800, 
                                color: "#0d1b2a" 
                            }}
                        >
                            Inicio
                        </Title>
                        <p style={{ margin: "8px 0 0 0", color: "#6b7280", fontSize: 16 }}>
                            Resumen de información importante del laboratorio
                        </p>
                    </Card>

                    {/* Stats Cards */}
                    <Row gutter={[16, 16]}>
                        <Col xs={24} sm={12} lg={6}>
                            <StatsCard
                                title="Total Pacientes"
                                value={data?.stats.total_patients || 0}
                                icon={<UserOutlined />}
                                color="#8b5cf6"
                                loading={loading}
                            />
                        </Col>
                        <Col xs={24} sm={12} lg={6}>
                            <StatsCard
                                title="Órdenes de Laboratorio"
                                value={data?.stats.total_orders || 0}
                                icon={<FileTextOutlined />}
                                color="#3b82f6"
                                loading={loading}
                            />
                        </Col>
                        <Col xs={24} sm={12} lg={6}>
                            <StatsCard
                                title="Muestras Procesadas"
                                value={data?.stats.total_samples || 0}
                                icon={<ExperimentOutlined />}
                                color="#f59e0b"
                                loading={loading}
                            />
                        </Col>
                        <Col xs={24} sm={12} lg={6}>
                            <StatsCard
                                title="Reportes Generados"
                                value={data?.stats.total_reports || 0}
                                icon={<BarChartOutlined />}
                                color="#10b981"
                                loading={loading}
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
                            />
                        </Col>
                        <Col xs={24} sm={8}>
                            <StatsCard
                                title="Reportes en Borrador"
                                value={data?.stats.draft_reports || 0}
                                color="#6b7280"
                                loading={loading}
                            />
                        </Col>
                        <Col xs={24} sm={8}>
                            <StatsCard
                                title="Reportes Publicados"
                                value={data?.stats.published_reports || 0}
                                color="#22c55e"
                                loading={loading}
                            />
                        </Col>
                    </Row>

                    {/* Recent Activity */}
                    <Row gutter={[16, 16]}>
                        <Col xs={24} lg={12}>
                            <RecentActivity
                                title="Actividad Reciente"
                                items={data?.recent_activity || []}
                                loading={loading}
                                onItemClick={handleActivityClick}
                            />
                        </Col>
                        <Col xs={24} lg={12}>
                            <Card
                                style={{ borderRadius: tokens.radius, boxShadow: tokens.shadow, background: tokens.cardBg }}
                                bodyStyle={{ padding: 20 }}
                            >
                                <h3 style={{ 
                                    fontFamily: tokens.titleFont, 
                                    fontSize: 18, 
                                    fontWeight: 800, 
                                    color: "#0d1b2a", 
                                    margin: "0 0 16px 0" 
                                }}>
                                    Acciones Rápidas
                                </h3>
                                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                    <button
                                        onClick={() => nav("/patients/register")}
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
                                        📝 Registrar Nuevo Paciente
                                    </button>
                                    <button
                                        onClick={() => nav("/orders/register")}
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
                                        🧪 Crear Nueva Orden
                                    </button>
                                    <button
                                        onClick={() => nav("/reports")}
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
                                        📊 Ver Todos los Reportes
                                    </button>
                                </div>
                            </Card>
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
