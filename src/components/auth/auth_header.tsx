import { Layout } from "antd";
import { Link } from "react-router-dom";
import celuma from "../../images/celuma-isotipo.png";
import { tokens } from "../design/tokens";

const { Header } = Layout;

type Props = {
    // Mantenido para compatibilidad mientras los enlaces de navegación están ocultos.
    activeLink?: "login" | "register";
};

export default function AuthHeader(_props: Props) {
    void _props;
    return (
        <Header
            style={{
                background: tokens.cardBg,
                boxShadow: "0 1px 12px rgba(0,0,0,0.08)",
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

            {/* Navigation Links — temporalmente ocultos para evitar múltiples registros
                mientras se terminan otras partes del proyecto.
            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
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
                <Link
                    to="/register"
                    style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: "#fff",
                        textDecoration: "none",
                        background: tokens.primary,
                        padding: "8px 20px",
                        borderRadius: 999,
                        transition: "background 0.2s ease",
                        boxShadow: "0 4px 16px rgba(15,139,141,0.35)",
                        lineHeight: 1,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#3da8a0")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = tokens.primary)}
                >
                    Registrarme
                </Link>
            </div>
            */}
        </Header>
    );
}
