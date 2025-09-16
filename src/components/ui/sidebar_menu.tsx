import { useState } from "react";
import type { MenuProps } from "antd";
import { Layout, Menu, Button } from "antd";
import { HomeOutlined, FileTextOutlined, LogoutOutlined, UserAddOutlined, UserOutlined, MenuFoldOutlined, MenuUnfoldOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";

const { Sider } = Layout;

export type CelumaKey = "/home" | "/report" | "/patients/register" | "/profile" | "/logout";

const itemsTop: Required<MenuProps>["items"] = [
    { key: "/home", icon: <HomeOutlined />, label: "Inicio", title: "Inicio" },
    { key: "/report", icon: <FileTextOutlined />, label: "Reportes", title: "Reportes" },
    { key: "/patients/register", icon: <UserAddOutlined />, label: "Registrar Paciente", title: "Registrar Paciente" },
];

const itemsBottom: Required<MenuProps>["items"] = [
    {
        key: "/profile",
        icon: <UserOutlined />,
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
                body, html { margin: 0; padding: 0; }
                .ant-layout { margin: 0; padding: 0; }
                .ant-layout-sider { margin: 0; padding: 0; }
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
                    items = {itemsTop}
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
    },
    inner: {
        height: "100%",
        display: "flex",
        flexDirection: "column",
        fontFamily: "Nanito, sans-serif",
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
