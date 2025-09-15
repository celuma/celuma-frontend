import { Layout } from "antd";
import { useLocation, useNavigate } from "react-router-dom";
import SidebarCeluma from "../components/ui/sidebar_menu";
import type { CelumaKey } from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";

const Home: React.FC = () => {
    const nav = useNavigate();
    const { pathname } = useLocation();

    return (
        <Layout style={{ minHeight: "100vh" }}>
            <SidebarCeluma
                selectedKey = {(pathname as CelumaKey) ?? "/home"}
                onNavigate = {(k) => nav(k)}
                logoSrc = {logo}
            />

            <Layout.Content style = {{ padding: 24, background: "#f6f8fa" }}>
                <h1> Página de inicio </h1>
                <p> Bienvenido a la app ✨</p>
            </Layout.Content>
        </Layout>
    );
};

export default Home;
