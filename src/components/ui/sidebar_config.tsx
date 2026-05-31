import React, { useEffect, useState } from "react";
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

const baseMenuItems: Required<MenuProps>["items"] = [
    { key: "/config/profile", icon: <UserOutlined />, label: "Mi Perfil" },
];

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

    const [isNarrow, setIsNarrow] = useState(
        () => typeof window !== "undefined" && window.matchMedia("(max-width: 1200px)").matches
    );

    useEffect(() => {
        const mq = window.matchMedia("(max-width: 1200px)");
        const handler = (e: MediaQueryListEvent) => setIsNarrow(e.matches);
        mq.addEventListener("change", handler);
        return () => mq.removeEventListener("change", handler);
    }, []);

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

    // Scroll active tab into view when route changes
    useEffect(() => {
        if (!isNarrow) return;
        const activeBtn = document.querySelector<HTMLElement>(".celuma-config-tab.active");
        activeBtn?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }, [selectedKey, isNarrow]);

    if (isNarrow) {
        return (
            <>
                <style>{`
                    .celuma-config-tabs-nav {
                        display: flex;
                        align-items: center;
                        gap: 4px;
                        overflow-x: auto;
                        padding: 4px 2px;
                        scrollbar-width: none;
                        -ms-overflow-style: none;
                    }
                    .celuma-config-tabs-nav::-webkit-scrollbar { display: none; }
                    .celuma-config-tab {
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        padding: 7px 14px;
                        border-radius: 20px;
                        font-size: 13px;
                        font-weight: 500;
                        white-space: nowrap;
                        cursor: pointer;
                        border: 1.5px solid transparent;
                        background: transparent;
                        color: #6b7280;
                        transition: all 0.15s ease;
                        flex-shrink: 0;
                    }
                    .celuma-config-tab:hover {
                        background: #f0fdfa;
                        color: #49b6ad;
                        border-color: #b2e8e4;
                    }
                    .celuma-config-tab.active {
                        background: #49b6ad;
                        color: #fff;
                        border-color: #49b6ad;
                    }
                    .celuma-config-tab .tab-icon {
                        font-size: 14px;
                        opacity: 0.85;
                    }
                `}</style>
                <nav
                    className="celuma-config-tabs-nav"
                    style={{
                        background: "#fff",
                        borderRadius: 12,
                        border: "1px solid #e5e7eb",
                        padding: "8px 12px",
                        boxShadow: "0 1px 4px rgba(0,0,0,.06)",
                    }}
                >
                    {menuItems.map((item) => {
                        if (!item) return null;
                        const key = item.key as string;
                        const isActive = selectedKey === key;
                        return (
                            <button
                                key={key}
                                className={`celuma-config-tab${isActive ? " active" : ""}`}
                                onClick={() => navigate(key)}
                            >
                                <span className="tab-icon">{(item as { icon?: React.ReactNode }).icon}</span>
                                {item.label as string}
                            </button>
                        );
                    })}
                </nav>
            </>
        );
    }

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
