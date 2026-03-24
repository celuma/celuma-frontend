import type { MenuProps } from "antd";
import { Menu } from "antd";
import {
    UserOutlined,
    DollarOutlined,
    FileTextOutlined,
    ExperimentOutlined,
    TeamOutlined,
    InfoCircleOutlined,
} from "@ant-design/icons";
import { useLocation, useNavigate } from "react-router-dom";
import { tokens } from "../design/tokens";
import { useUserProfile } from "../../hooks/use_user_profile";

export type ConfigKey =
    | "/config/profile"
    | "/config/catalog"
    | "/config/report-templates"
    | "/config/study-types"
    | "/config/users"
    | "/config/about";

const baseMenuItems: Required<MenuProps>["items"] = [
    { key: "/config/profile", icon: <UserOutlined />, label: "Mi Perfil" },
    { key: "/config/report-templates", icon: <FileTextOutlined />, label: "Plantillas de Reporte" },
    { key: "/config/study-types", icon: <ExperimentOutlined />, label: "Tipos de Estudio" },
    { key: "/config/catalog", icon: <DollarOutlined />, label: "Catálogo de Precios" },
];

const adminMenuItem: Required<MenuProps>["items"][number] = {
    key: "/config/users",
    icon: <TeamOutlined />,
    label: "Gestión de Usuarios",
};

const aboutMenuItem: Required<MenuProps>["items"][number] = {
    key: "/config/about",
    icon: <InfoCircleOutlined />,
    label: "Acerca de",
};

const SidebarConfig: React.FC = () => {
    const { pathname } = useLocation();
    const navigate = useNavigate();
    const { isAdmin } = useUserProfile();

    const menuItems = isAdmin
        ? [...baseMenuItems, adminMenuItem, aboutMenuItem]
        : [...baseMenuItems, aboutMenuItem];

    const selectedKey = menuItems
        .map((item) => item!.key as string)
        .find((key) => pathname.startsWith(key)) ?? "/config/profile";

    return (
        <aside style={styles.container}>
            <div style={styles.header}>
                <span style={styles.headerText}>Configuración</span>
            </div>
            <Menu
                items={menuItems}
                selectedKeys={[selectedKey]}
                mode="inline"
                style={styles.menu}
                onClick={({ key }) => navigate(key)}
                inlineIndent={16}
            />
        </aside>
    );
};

export default SidebarConfig;

const styles: Record<string, React.CSSProperties> = {
    container: {
        width: 240,
        minWidth: 240,
        background: "#fff",
        borderRadius: tokens.radius,
        boxShadow: tokens.shadow,
        display: "flex",
        flexDirection: "column",
        alignSelf: "flex-start",
        overflow: "hidden",
        position: "sticky",
        top: tokens.contentPadding,
    },
    header: {
        padding: "18px 20px 12px 20px",
        borderBottom: "1px solid #f0f0f0",
    },
    headerText: {
        fontFamily: tokens.titleFont,
        fontSize: 16,
        fontWeight: 700,
        color: tokens.textPrimary,
        letterSpacing: 0.2,
    },
    menu: {
        background: "transparent",
        borderInlineEnd: "none",
        padding: "8px 0",
        fontSize: 14,
        color: tokens.textPrimary,
    },
};
