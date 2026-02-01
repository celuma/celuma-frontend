import { Layout } from "antd";
import { Link } from "react-router-dom";
import celuma from "../../images/celuma-isotipo.png";
import { tokens } from "../design/tokens";

const { Header } = Layout;

type Props = {
    activeLink?: "login" | "register";
};

export default function AuthHeader({ activeLink }: Props) {
    return (
        <Header
            style={{
                background: tokens.cardBg,
                boxShadow: tokens.shadow,
                height: 64,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0 24px",
                position: "sticky",
                top: 0,
                zIndex: 100,
            }}
        >
            {/* Logo + Brand */}
            <Link
                to="/"
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    textDecoration: "none",
                }}
            >
                <img
                    src={celuma}
                    alt="Céluma"
                    style={{
                        height: 40,
                        width: "auto",
                    }}
                />
                <span
                    style={{
                        fontFamily: tokens.titleFont,
                        fontSize: 24,
                        fontWeight: 800,
                        color: tokens.textPrimary,
                    }}
                >
                    Céluma
                </span>
            </Link>

            {/* Navigation Links */}
            <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
                <Link
                    to="/login"
                    style={{
                        fontSize: 15,
                        fontWeight: 600,
                        color: activeLink === "login" ? tokens.primary : tokens.textSecondary,
                        textDecoration: "none",
                        transition: "color 0.2s ease",
                    }}
                >
                    Iniciar sesión
                </Link>
                <span style={{ color: tokens.textSecondary }}>|</span>
                <Link
                    to="/register"
                    style={{
                        fontSize: 15,
                        fontWeight: 600,
                        color: activeLink === "register" ? tokens.primary : tokens.textSecondary,
                        textDecoration: "none",
                        transition: "color 0.2s ease",
                    }}
                >
                    Registrarme
                </Link>
            </div>
        </Header>
    );
}
