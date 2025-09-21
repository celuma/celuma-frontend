import { Layout, Card } from "antd";
import { useLocation, useNavigate } from "react-router-dom";
import SidebarCeluma from "../components/ui/sidebar_menu";
import type { CelumaKey } from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import { tokens } from "../components/design/tokens";

const Home: React.FC = () => {
    const nav = useNavigate();
    const { pathname } = useLocation();

    return (
        <Layout style={{ minHeight: "100vh", padding: 0, margin: 0 }}>
            <SidebarCeluma
                selectedKey = {(pathname as CelumaKey) ?? "/home"}
                onNavigate = {(k) => nav(k)}
                logoSrc = {logo}
            />

            <Layout.Content style={{ padding: 24, background: tokens.bg, fontFamily: tokens.textFont }}>
                <div style={{ maxWidth: 1000, margin: "0 auto", display: "grid", gap: tokens.gap }}>
                    <Card
                        title={<span style={{ fontFamily: tokens.titleFont, fontSize: 20, fontWeight: 800, color: "#0d1b2a" }}>Página de inicio</span>}
                        style={{ borderRadius: tokens.radius, boxShadow: tokens.shadow, background: tokens.cardBg }}
                    >
                        <p style={{ margin: 0, color: "#374151" }}>Bienvenido a la app ✨</p>
                    </Card>
                </div>
            </Layout.Content>
        </Layout>
    );
};

export default Home;
