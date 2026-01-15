import { useState } from "react";
import type { MenuProps } from "antd";
import { Layout, Menu, Button, Avatar } from "antd";
import { HomeOutlined, FileTextOutlined, LogoutOutlined, UserOutlined, MenuFoldOutlined, MenuUnfoldOutlined, ExperimentOutlined, CheckSquareOutlined, TeamOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { useUserProfile } from "../../hooks/use_user_profile";

const { Sider } = Layout;

export type CelumaKey = 
    | "/home" 
    | "/reports" 
    | "/worklist"
    | "/patients"
    | "/cases"
    | "/samples"
    | "/orders/register"
    | "/samples/register"
    | "/cases/register"
    | "/profile" 
    | "/logout"
    | "/users";

const itemsTop: Required<MenuProps>["items"] = [
    { key: "/home", icon: <HomeOutlined />, label: "Inicio", title: "Inicio" },
    { key: "/worklist", icon: <CheckSquareOutlined />, label: "Worklist", title: "Worklist" },
    { key: "/reports", icon: <FileTextOutlined />, label: "Reportes", title: "Reportes" },
    { key: "/patients", icon: <UserOutlined />, label: "Pacientes", title: "Pacientes" },
    { key: "/cases", icon: <FileTextOutlined />, label: "Casos", title: "Casos" },
    { key: "/samples", icon: <ExperimentOutlined />, label: "Muestras", title: "Muestras" },
];

// Generate initials from full name (first letter of first name + first letter of last name)
const getInitials = (fullName?: string): string => {
    if (!fullName) return "U";
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) {
        return parts[0][0]?.toUpperCase() || "U";
    }
    const firstInitial = parts[0][0]?.toUpperCase() || "";
    const lastInitial = parts[parts.length - 1][0]?.toUpperCase() || "";
    return firstInitial + lastInitial;
};

// User avatar component with monogram fallback
const UserAvatar: React.FC<{ avatarUrl?: string; fullName?: string; size?: number }> = ({ 
    avatarUrl, 
    fullName = "", 
    size = 20 
}) => {
    const initials = getInitials(fullName);
    return (
        <Avatar
            size={size}
            src={avatarUrl}
            style={{
                backgroundColor: avatarUrl ? "transparent" : "#0f8b8d",
                color: "#fff",
                fontSize: initials.length > 1 ? size * 0.4 : size * 0.5,
                fontWeight: 700,
            }}
        >
            {initials}
        </Avatar>
    );
};

const getBottomItems = (avatarUrl?: string, fullName?: string): Required<MenuProps>["items"] => [
    {
        key: "/profile",
        icon: <UserAvatar avatarUrl={avatarUrl} fullName={fullName} />,
        label: "Mi Perfil",
        style: { margin: 0 },
        title: "Mi Perfil", // Tooltip when collapsed
    },
    {
        key: "/logout",
        icon: <LogoutOutlined />,
        label: "Cerrar Sesión",
        style: { margin: 0 },
        title: "Cerrar Sesión", // Tooltip when collapsed
    },
];

export interface SidebarCelumaProps {
    selectedKey?: CelumaKey;
    onNavigate?: (key: CelumaKey) => void;
    logoSrc?: string;
    title?: string;
}

const SidebarCeluma: React.FC<SidebarCelumaProps> = ({selectedKey = "/home", onNavigate, logoSrc, title = "Céluma" }) => {
    const [collapsed, setCollapsed] = useState(() => {
        const saved = localStorage.getItem("sidebar_collapsed");
        return saved ? JSON.parse(saved) : false;
    });
    const navigate = useNavigate();
    const { profile, isAdmin } = useUserProfile();

    const menuItems = [...itemsTop];
    if (isAdmin) {
        menuItems.push({ key: "/users", icon: <TeamOutlined />, label: "Usuarios", title: "Gestión de Usuarios" });
    }

    const itemsBottom = getBottomItems(profile?.avatar_url, profile?.full_name);

    const selectedTop =
        selectedKey === "/logout" || selectedKey === "/profile" ? [] : ([selectedKey] as string[]);
    const selectedBottom =
        selectedKey === "/logout" || selectedKey === "/profile" ? ([selectedKey] as string[]) : [];

    const handleNavigate = (key: CelumaKey) => {
        if (key === "/logout") {
            localStorage.removeItem("auth_token");
            sessionStorage.removeItem("auth_token");
            navigate("/login", { replace: true });
        } else {
            onNavigate?.(key);
        }
    };

    const handleLogoClick = () => {
        handleNavigate("/home");
    };

    const toggleCollapsed = () => {
        const newCollapsed = !collapsed;
        setCollapsed(newCollapsed);
        localStorage.setItem("sidebar_collapsed", JSON.stringify(newCollapsed));
    };

    return (
        <>
            <style>{`
                body, html { 
                    margin: 0; 
                    padding: 0; 
                    height: 100%;
                    min-height: 100vh;
                }
                .ant-layout { 
                    margin: 0; 
                    padding: 0; 
                    min-height: 100vh;
                }
                .ant-layout-sider { 
                    margin: 0; 
                    padding: 0; 
                    min-height: 100vh;
                }
                #root {
                    min-height: 100vh;
                }
            `}</style>
            <Sider
                width = {260}
                collapsible
                collapsed = {collapsed}
                trigger = {null}
                style = {styles.sider}
                breakpoint = "lg"
            >
            <div style = {styles.inner}>
                <div style = {collapsed ? styles.headerContainerCollapsed : styles.headerContainer}>
                    <div
                        style = {collapsed ? styles.headerCollapsed : styles.header}
                        onClick = {handleLogoClick}
                    >
                        {logoSrc ? (
                            <img
                                src = {logoSrc}
                                alt = "logo"
                                style = {collapsed ? styles.logoCollapsed : styles.logo}
                            />
                        ) : (
                            <div style = {styles.logoDot} />
                        )}
                        {!collapsed && <span style = {styles.brand}>{title}</span>}
                    </div>
                    <Button
                        type="text"
                        icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                        onClick={toggleCollapsed}
                        style={{
                            ...styles.collapseButton,
                            ...(collapsed ? styles.collapseButtonCollapsed : styles.collapseButtonExpanded),
                        }}
                    />
                </div>

                <Menu
                    items = {menuItems}
                    selectedKeys = {selectedTop}
                    mode = "inline"
                    theme = "dark"
                    inlineCollapsed = {collapsed}
                    style = {styles.menu}
                    onClick = {(e) => handleNavigate(e.key as CelumaKey)}
                    inlineIndent = {collapsed ? 0 : 24}
                />

                <div style = {collapsed ? styles.bottomWrapperCollapsed : styles.bottomWrapper}>
                    <Menu
                        items = {itemsBottom}
                        selectedKeys = {selectedBottom}
                        mode = "inline"
                        theme = "dark"
                        inlineCollapsed = {collapsed}
                        style = {styles.menuBottom}
                        onClick = {(e) => handleNavigate(e.key as CelumaKey)}
                        inlineIndent = {collapsed ? 0 : 24}
                    />
                </div>
            </div>
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
        fontFamily: "Nanito, sans-serif",
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
        fontWeight: 900,
        fontSize: 26,
        letterSpacing: 0.3,
        fontFamily: "Nanito, sans-serif",
        lineHeight: 1.1,
    },
    menu: {
        background: "transparent",
        borderInlineEnd: "none",
        flex: 1,
        padding: "8px 16px 0 16px",
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
        padding: "16px 16px 20px 16px",
        borderTop: "1px solid rgba(255, 255, 255, 0.1)",
    },
    bottomWrapperCollapsed: {
        marginTop: "auto",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        alignItems: "center",
        padding: "16px 16px 20px 16px",
        borderTop: "1px solid rgba(255, 255, 255, 0.1)",
    },
    menuBottom: {
        background: "transparent",
        borderInlineEnd: "none",
        padding: 0,
        margin: 0,
        color: "#fff",
    },
};
