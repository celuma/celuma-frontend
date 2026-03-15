import { Layout } from "antd";
import { useNavigate } from "react-router-dom";
import { Outlet } from "react-router-dom";
import SidebarCeluma from "../components/ui/sidebar_menu";
import SidebarConfig from "../components/ui/sidebar_config";
import logo from "../images/celuma-isotipo.png";
import { tokens } from "../components/design/tokens";
import { usePageTitle } from "../hooks/use_page_title";

const Config: React.FC = () => {
    usePageTitle();
    const nav = useNavigate();

    return (
        <Layout style={{ minHeight: "100vh", padding: 0, margin: 0 }}>
            <SidebarCeluma
                selectedKey="/config"
                onNavigate={(k) => nav(k)}
                logoSrc={logo}
            />

            <Layout.Content
                style={{
                    padding: tokens.contentPadding,
                    background: tokens.bg,
                    fontFamily: tokens.textFont,
                }}
            >
                <div
                    style={{
                        maxWidth: tokens.maxWidth,
                        margin: "0 auto",
                        display: "flex",
                        gap: tokens.gap * 2,
                        alignItems: "flex-start",
                    }}
                >
                    <SidebarConfig />
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <Outlet />
                    </div>
                </div>
            </Layout.Content>
        </Layout>
    );
};

export default Config;
