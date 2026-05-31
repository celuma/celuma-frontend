import React from "react";
import { Menu } from "antd";
import type { MenuProps } from "antd";
import {
    UserOutlined,
    FileTextOutlined,
    ExperimentOutlined,
    DollarOutlined,
    TeamOutlined,
    SafetyCertificateOutlined,
    InfoCircleOutlined,
    ShopOutlined,
    BankOutlined,
} from "@ant-design/icons";
import { useLocation, useNavigate } from "react-router-dom";
import { useUserProfile } from "../../hooks/use_user_profile";

// Items visible to every authenticated user inside /config
const baseMenuItems: Required<MenuProps>["items"] = [
    { key: "/config/profile", icon: <UserOutlined />, label: "Mi Perfil" },
];

// Items that require admin:manage_catalog
const catalogMenuItems: Required<MenuProps>["items"] = [
    { key: "/config/report-templates", icon: <FileTextOutlined />, label: "Plantillas de Reporte" },
    { key: "/config/study-types", icon: <ExperimentOutlined />, label: "Tipos de Estudio" },
    { key: "/config/catalog", icon: <DollarOutlined />, label: "Catálogo de Precios" },
];

const adminMenuItem: Required<MenuProps>["items"][number] = {
    key: "/config/users",
    icon: <TeamOutlined />,
    label: "Gestión de Usuarios",
};

const reviewersMenuItem: Required<MenuProps>["items"][number] = {
    key: "/config/reviewers",
    icon: <SafetyCertificateOutlined />,
    label: "Revisores",
};

const branchesMenuItem: Required<MenuProps>["items"][number] = {
    key: "/config/branches",
    icon: <ShopOutlined />,
    label: "Sucursales",
};

const tenantMenuItem: Required<MenuProps>["items"][number] = {
    key: "/config/tenant",
    icon: <BankOutlined />,
    label: "Empresa",
};

const aboutMenuItem: Required<MenuProps>["items"][number] = {
    key: "/config/about",
    icon: <InfoCircleOutlined />,
    label: "Acerca de",
};

const SidebarConfig: React.FC = () => {
    const { pathname } = useLocation();
    const navigate = useNavigate();
    const { canManageUsers, canManageCatalog, canManageBranches, canManageTenant } = useUserProfile();

    const menuItems: Required<MenuProps>["items"] = [
        ...baseMenuItems,
        ...(canManageCatalog ? catalogMenuItems : []),
        ...(canManageUsers ? [adminMenuItem, reviewersMenuItem] : []),
        ...(canManageBranches ? [branchesMenuItem] : []),
        ...(canManageTenant ? [tenantMenuItem] : []),
        aboutMenuItem,
    ];

    const selectedKey =
        menuItems
            .map((item) => item!.key as string)
            .find((key) => pathname.startsWith(key)) ?? "/config/profile";

    return (
        <aside className="celuma-config-menu" style={styles.container}>
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
        width: 220,
        minWidth: 220,
        background: "#fff",
        borderRadius: 12,
        border: "1px solid #e5e7eb",
        overflow: "hidden",
        flexShrink: 0,
    },
    header: {
        padding: "16px 20px 12px",
        borderBottom: "1px solid #e5e7eb",
    },
    headerText: {
        fontWeight: 700,
        fontSize: 14,
        color: "#0d1b2a",
        letterSpacing: "-0.01em",
    },
    menu: {
        border: "none",
        padding: "8px 0",
    },
};
