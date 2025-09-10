import { useState } from "react";
import type { MenuProps } from "antd";
import { Layout, Menu } from "antd";
import { HomeOutlined, FileTextOutlined, LogoutOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";

const { Sider } = Layout;

export type CelumaKey = "/start" | "/report" | "/logout";

const itemsTop: Required<MenuProps>["items"] = [
    { key: "/start", icon: <HomeOutlined />, label: "Inicio" },
    { key: "/report", icon: <FileTextOutlined />, label: "Reportes" },
];

const itemsBottom: Required<MenuProps>["items"] = [
    {
        key: "/logout",
        icon: <LogoutOutlined />,
        label: "Cerrar Sesión",
        style: { margin: 0 },
    },
];

export interface SidebarCelumaProps {
    selectedKey?: CelumaKey;
    onNavigate?: (key: CelumaKey) => void;
    logoSrc?: string;
    title?: string;
}

const SidebarCeluma: React.FC<SidebarCelumaProps> = ({selectedKey = "/start", onNavigate, logoSrc, title = "Céluma" }) => {
    const [collapsed, setCollapsed] = useState(false);
    const navigate = useNavigate();
    const selectedTop =
        selectedKey === "/logout" ? [] : ([selectedKey] as string[]);
    const selectedBottom =
        selectedKey === "/logout" ? ([selectedKey] as string[]) : [];

    const handleNavigate = (key: CelumaKey) => {
        if (key === "/logout") {
            localStorage.removeItem("auth_token");
            sessionStorage.removeItem("auth_token");
            navigate("/login", { replace: true });
        } else {
            onNavigate?.(key);
        }
    };

    return (
        <Sider
            width = {260}
            collapsible
            collapsed = {collapsed}
            trigger = {null}
            style = {styles.sider}
            breakpoint = "lg"
        >
            <div style = {styles.inner}>
                <div
                    style = {collapsed ? styles.headerCollapsed : styles.header}
                    onClick = {() => setCollapsed(!collapsed)}
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

                <Menu
                    items = {itemsTop}
                    selectedKeys = {selectedTop}
                    mode = "inline"
                    theme = "dark"
                    inlineCollapsed = {collapsed}
                    style = {styles.menu}
                    onClick = {(e) => handleNavigate(e.key as CelumaKey)}
                />

                <div style = {styles.bottomWrapper}>
                    <Menu
                        items = {itemsBottom}
                        selectedKeys = {selectedBottom}
                        mode = "inline"
                        theme = "dark"
                        inlineCollapsed = {collapsed}
                        style = {styles.menuBottom}
                        onClick = {(e) => handleNavigate(e.key as CelumaKey)}
                    />
                </div>
            </div>
        </Sider>
    );
};

export default SidebarCeluma;

const styles: Record<string, React.CSSProperties> = {
    sider: {
        background: "#49b6ad",
        color: "#fff",
        paddingBottom: 0,
    },
    inner: {
        height: "100%",
        display: "flex",
        flexDirection: "column",
        fontFamily: "Nanito, sans-serif",
    },
    header: {
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "20px 16px 8px 16px",
        cursor: "pointer",
    },
    headerCollapsed: {
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "20px 0 8px 0",
        cursor: "pointer",
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
        padding: "8px 8px 0 8px",
        margin: 0,
        color: "#fff",
    },
    bottomWrapper: {
        marginTop: "auto",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
    },
    menuBottom: {
        background: "transparent",
        borderInlineEnd: "none",
        padding: "0 8px 0 8px",
        margin: 0,
        color: "#fff",
    },
};
