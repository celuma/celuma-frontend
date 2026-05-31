import { useState, useEffect } from "react";
import type { MenuProps } from "antd";
import { Layout, Menu, Button, Drawer } from "antd";
import {
    HomeOutlined,
    FileTextOutlined,
    LogoutOutlined,
    UserOutlined,
    MenuFoldOutlined,
    MenuUnfoldOutlined,
    ExperimentOutlined,
    CheckSquareOutlined,
    ContainerOutlined,
    CreditCardOutlined,
    SettingOutlined,
    MedicineBoxOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { useUserProfile } from "../../hooks/use_user_profile";
import { PERMS } from "../../lib/rbac";

const { Sider } = Layout;

export type CelumaKey =
    | "/home"
    | "/reports"
    | "/worklist"
    | "/patients"
    | "/requesting-physicians"
    | "/orders"
    | "/samples"
    | "/orders/register"
    | "/samples/register"
    | "/logout"
    | "/billing"
    | "/config";

// route → minimum permission required to show the item
const NAV_ITEMS: { key: CelumaKey; icon: React.ReactNode; label: string; permission: string }[] = [
    { key: "/home",      icon: <HomeOutlined />,         label: "Inicio",             permission: PERMS.LAB_READ },
    { key: "/worklist",  icon: <CheckSquareOutlined />,  label: "Lista de Trabajo",   permission: PERMS.LAB_READ },
    { key: "/reports",   icon: <FileTextOutlined />,     label: "Reportes",           permission: PERMS.REPORTS_READ },
    { key: "/patients",  icon: <UserOutlined />,         label: "Pacientes",          permission: PERMS.LAB_READ },
    { key: "/requesting-physicians", icon: <MedicineBoxOutlined />, label: "Médicos Solicitantes", permission: PERMS.LAB_READ },
    { key: "/orders",    icon: <ContainerOutlined />,    label: "Órdenes",            permission: PERMS.LAB_READ },
    { key: "/samples",   icon: <ExperimentOutlined />,   label: "Muestras",           permission: PERMS.LAB_READ },
    { key: "/billing",   icon: <CreditCardOutlined />,   label: "Facturación",        permission: PERMS.BILLING_READ },
];

const itemsBottom: Required<MenuProps>["items"] = [
    { key: "/config",  icon: <SettingOutlined />,  label: "Configuración", style: { margin: "0 0 4px 0" }, title: "Configuración" },
    { key: "/logout",  icon: <LogoutOutlined />,   label: "Cerrar Sesión", style: { margin: 0 },           title: "Cerrar Sesión" },
];

export interface SidebarCelumaProps {
    selectedKey?: CelumaKey;
    onNavigate?: (key: CelumaKey) => void;
    logoSrc?: string;
    title?: string;
}

const SidebarCeluma: React.FC<SidebarCelumaProps> = ({
    selectedKey = "/home",
    onNavigate,
    logoSrc,
    title = "Céluma",
}) => {
    const [collapsed, setCollapsed] = useState(() => {
        if (typeof window === "undefined") return false;
        // On narrow screens always start collapsed
        if (window.matchMedia("(max-width: 1100px)").matches) return true;
        // On wide screens respect user's saved preference
        const saved = localStorage.getItem("sidebar_collapsed_wide");
        return saved ? JSON.parse(saved) : false;
    });

    useEffect(() => {
        const mq = window.matchMedia("(max-width: 1100px)");
        const handler = (e: MediaQueryListEvent) => {
            if (e.matches) {
                setCollapsed(true);
            } else {
                // Restore wide-screen preference when expanding viewport
                const saved = localStorage.getItem("sidebar_collapsed_wide");
                setCollapsed(saved ? JSON.parse(saved) : false);
            }
        };
        mq.addEventListener("change", handler);
        return () => mq.removeEventListener("change", handler);
    }, []);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const navigate = useNavigate();
    const { hasPermission } = useUserProfile();

    // Build top menu filtered by permissions
    const menuItems: Required<MenuProps>["items"] = NAV_ITEMS
        .filter((item) => hasPermission(item.permission))
        .map((item) => ({
            key: item.key,
            icon: item.icon,
            label: item.label,
            title: item.label,
        }));

    const selectedTop =
        selectedKey !== "/logout" && selectedKey !== "/config"
            ? ([selectedKey] as string[])
            : [];
    const selectedBottom =
        selectedKey === "/logout" || selectedKey === "/config"
            ? ([selectedKey] as string[])
            : [];

    const handleNavigate = (key: CelumaKey) => {
        setDrawerOpen(false);
        if (key === "/logout") {
            localStorage.removeItem("auth_token");
            sessionStorage.removeItem("auth_token");
            navigate("/login", { replace: true });
        } else {
            onNavigate?.(key);
        }
    };

    const toggleCollapsed = () => {
        const newCollapsed = !collapsed;
        setCollapsed(newCollapsed);
        // Only persist manual toggle on wide screens; narrow-screen collapses are always auto
        if (!window.matchMedia("(max-width: 1100px)").matches) {
            localStorage.setItem("sidebar_collapsed_wide", JSON.stringify(newCollapsed));
        }
    };

    const menuContent = (inDrawer = false) => (
        <div style={{ ...styles.inner, height: inDrawer ? "100%" : "100vh" }}>
            <div style={!inDrawer && collapsed ? styles.headerContainerCollapsed : styles.headerContainer}>
                <div
                    style={!inDrawer && collapsed ? styles.headerCollapsed : styles.header}
                    onClick={() => handleNavigate("/home")}
                >
                    {logoSrc && (
                        <img src={logoSrc} alt="logo" style={!inDrawer && collapsed ? styles.logoCollapsed : styles.logo} />
                    )}
                    {(inDrawer || !collapsed) && <span style={styles.brand}>{title}</span>}
                </div>
                {!inDrawer && (
                    <Button
                        type="text"
                        icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                        onClick={toggleCollapsed}
                        style={{
                            ...styles.collapseButton,
                            ...(collapsed ? styles.collapseButtonCollapsed : styles.collapseButtonExpanded),
                        }}
                    />
                )}
            </div>

            <Menu
                items={menuItems}
                selectedKeys={selectedTop}
                mode="inline"
                theme="dark"
                inlineCollapsed={!inDrawer && collapsed}
                style={!inDrawer && collapsed ? styles.menuCollapsed : styles.menu}
                onClick={(e) => handleNavigate(e.key as CelumaKey)}
                inlineIndent={20}
            />

            <div style={!inDrawer && collapsed ? styles.bottomWrapperCollapsed : styles.bottomWrapper}>
                <Menu
                    items={itemsBottom}
                    selectedKeys={selectedBottom}
                    mode="inline"
                    theme="dark"
                    inlineCollapsed={!inDrawer && collapsed}
                    style={!inDrawer && collapsed ? styles.menuBottomCollapsed : styles.menuBottom}
                    onClick={(e) => handleNavigate(e.key as CelumaKey)}
                    inlineIndent={20}
                />
            </div>
        </div>
    );

    return (
        <>
            <style>{`
                body, html { margin: 0; padding: 0; height: 100%; min-height: 100vh; }
                .ant-layout { margin: 0; padding: 0; min-height: 100vh; }
                .ant-layout-sider { margin: 0; padding: 0; min-height: 100vh; }
                #root { min-height: 100vh; }
                .ant-layout-sider .ant-menu-dark .ant-menu-item:hover,
                .ant-layout-sider .ant-menu-dark .ant-menu-submenu-title:hover {
                    background: rgba(255, 255, 255, 0.14) !important;
                    border-radius: 8px !important;
                }
                .ant-layout-sider .ant-menu-dark .ant-menu-item-selected {
                    background: rgba(255, 255, 255, 0.22) !important;
                    border-radius: 8px !important;
                }
                .ant-layout-sider .ant-menu-dark .ant-menu-item {
                    border-radius: 8px !important;
                    margin-inline: 4px !important;
                    margin-block: 4px !important;
                    width: calc(100% - 8px) !important;
                }
                .celuma-drawer .ant-menu-dark .ant-menu-item:hover { background: rgba(255,255,255,0.14) !important; border-radius: 8px !important; }
                .celuma-drawer .ant-menu-dark .ant-menu-item-selected { background: rgba(255,255,255,0.22) !important; border-radius: 8px !important; }
                .celuma-drawer .ant-menu-dark .ant-menu-item { border-radius: 8px !important; }
                .celuma-drawer .ant-drawer-body { padding: 0 !important; background: #49b6ad !important; }
                .celuma-drawer .ant-drawer-header { display: none !important; }
                /* Mobile: hide the sider, show hamburger */
                @media (max-width: 767px) {
                    .ant-layout-sider { display: none !important; }
                    .celuma-mobile-hamburger { display: flex !important; }
                }
                /* Desktop: hide the mobile hamburger */
                @media (min-width: 768px) {
                    .celuma-mobile-hamburger { display: none !important; }
                }
            `}</style>

            {/* Mobile hamburger — shown via CSS on small screens */}
            <button
                className="celuma-mobile-hamburger"
                onClick={() => setDrawerOpen(true)}
                style={styles.mobileHamburger}
                aria-label="Abrir menú"
            >
                <MenuUnfoldOutlined style={{ fontSize: 20, color: "#fff" }} />
            </button>

            {/* Mobile drawer */}
            <Drawer
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                placement="left"
                width={260}
                className="celuma-drawer"
                styles={{ body: { padding: 0, background: "#49b6ad" } }}
            >
                {menuContent(true)}
            </Drawer>

            {/* Desktop sider — hidden via CSS on small screens */}
            <Sider
                width={260}
                collapsible
                collapsed={collapsed}
                trigger={null}
                style={styles.sider}
            >
                {menuContent(false)}
            </Sider>
        </>
    );
};

export default SidebarCeluma;

const styles: Record<string, React.CSSProperties> = {
    sider: {
        background: "#49b6ad",
        color: "#fff",
        paddingBottom: 0,
        paddingLeft: 0,
        paddingRight: 0,
        paddingTop: 0,
        minHeight: "100vh",
        height: "100vh",
        position: "sticky",
        top: 0,
        overflow: "hidden",
    },
    inner: {
        height: "100vh",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Baloo 2', system-ui, sans-serif",
        overflow: "hidden",
    },
    headerContainer: {
        display: "flex",
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        padding: "20px 16px 8px 16px",
    },
    headerContainerCollapsed: {
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "20px 16px 8px 16px",
    },
    header: {
        display: "flex",
        alignItems: "center",
        gap: 12,
        cursor: "pointer",
    },
    headerCollapsed: {
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        cursor: "pointer",
    },
    collapseButton: {
        color: "#fff",
        border: "1px solid rgba(255, 255, 255, 0.2)",
        borderRadius: 6,
        height: 32,
    },
    collapseButtonExpanded: {
        width: 32,
        minWidth: 32,
    },
    collapseButtonCollapsed: {
        width: "100%",
        alignSelf: "center",
    },
    logo: { height: 44 },
    logoCollapsed: { height: 32 },
    logoDot: {
        width: 12,
        height: 12,
        borderRadius: "50%",
        background: "#ffd166",
        boxShadow: "12px 0 0 #ef476f, 24px 0 0 #06d6a0",
    },
    brand: {
        color: "#ffffff",
        fontWeight: 800,
        fontSize: 26,
        letterSpacing: -0.02,
        fontFamily: "'Baloo 2', system-ui, sans-serif",
        lineHeight: 1.1,
    },
    menu: {
        background: "transparent",
        borderInlineEnd: "none",
        flex: 1,
        padding: "8px 10px 0 10px",
        margin: 0,
        color: "#fff",
        overflowY: "auto",
        minHeight: 0,
    },
    menuCollapsed: {
        background: "transparent",
        borderInlineEnd: "none",
        flex: 1,
        padding: "8px 0 0 0",
        margin: 0,
        color: "#fff",
        overflowY: "auto",
        minHeight: 0,
    },
    bottomWrapper: {
        marginTop: "auto",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        padding: "12px 0 20px 0",
        borderTop: "1px solid rgba(255, 255, 255, 0.1)",
    },
    bottomWrapperCollapsed: {
        marginTop: "auto",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        padding: "12px 0 20px 0",
        borderTop: "1px solid rgba(255, 255, 255, 0.1)",
    },
    menuBottom: {
        background: "transparent",
        borderInlineEnd: "none",
        padding: "0 10px",
        margin: 0,
        color: "#fff",
    },
    menuBottomCollapsed: {
        background: "transparent",
        borderInlineEnd: "none",
        padding: "0",
        margin: 0,
        color: "#fff",
    },
    mobileHamburger: {
        position: "fixed",
        top: 12,
        left: 12,
        zIndex: 1000,
        width: 40,
        height: 40,
        borderRadius: 10,
        background: "#49b6ad",
        border: "none",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
    },
};
