import { Layout } from "antd";
import { useLocation, useNavigate } from "react-router-dom";
import SidebarCeluma from "../components/ui/sidebar_menu";
import type { CelumaKey } from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import { tokens } from "../components/design/tokens";
import ReportEditor from "../components/report/report_editor";

function Reports() {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    return (
        <Layout style={{ minHeight: "100vh", padding: 0, margin: 0 }}>
            <SidebarCeluma
                selectedKey={(pathname as CelumaKey) ?? "/report"}
                onNavigate={(k) => navigate(k)}
                logoSrc={logo}
            />
            <Layout.Content style={{ padding: 24, background: tokens.bg, fontFamily: tokens.textFont }}>
                <div style={{ maxWidth: 1400, margin: "0 auto" }}>
                    <ReportEditor />
                </div>
            </Layout.Content>
        </Layout>
    );
}

export default Reports;