import { useEffect, useState } from "react";
import { Card, Divider } from "antd";
import logo from "../images/celuma-isotipo.png";
import { tokens, cardTitleStyle, cardStyle } from "../components/design/tokens";
import { usePageTitle } from "../hooks/use_page_title";
import { FRONTEND_DEPENDENCIES, BACKEND_DEPENDENCIES } from "../legal/third_party_dependencies";

const CURRENT_YEAR = new Date().getFullYear();

function getApiBase(): string {
    return import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL || "/api");
}

function DepBlock({ title, deps }: { title: string; deps: string }) {
    const lines = deps.split("\n").filter(Boolean);
    return (
        <div>
            <p
                style={{
                    margin: "0 0 6px 0",
                    fontSize: 13,
                    fontWeight: 600,
                    color: tokens.textPrimary,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                }}
            >
                {title}
            </p>
            <p style={{ margin: 0, fontSize: 13, color: tokens.textSecondary, lineHeight: 1.8 }}>
                {lines.join(" · ")}
            </p>
        </div>
    );
}

export default function ConfigAbout() {
    usePageTitle();

    const { version: uiVersion } = __CELUMA_APP_INFO__;
    const [serverVersion, setServerVersion] = useState<string | null>(null);

    useEffect(() => {
        fetch(`${getApiBase()}/v1/health`)
            .then((r) => r.json())
            .then((data: { celuma_version?: string }) => {
                setServerVersion(data.celuma_version ?? null);
            })
            .catch(() => setServerVersion(null));
    }, []);

    return (
        <Card title={<span style={cardTitleStyle}>Acerca de Céluma</span>} style={cardStyle}>
            {/* Logo + server version (prominent) + UI version (secondary) */}
            <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 24 }}>
                <img
                    src={logo}
                    alt=""
                    width={56}
                    height={56}
                    style={{ borderRadius: 12, flexShrink: 0, boxShadow: "0 4px 12px rgba(0,0,0,.12)" }}
                />
                <div>
                    <div
                        style={{
                            fontFamily: tokens.titleFont,
                            fontSize: 22,
                            fontWeight: tokens.titleWeight,
                            color: tokens.textPrimary,
                            lineHeight: 1.2,
                        }}
                    >
                        Céluma
                    </div>
                    {serverVersion !== null && (
                        <div style={{ fontSize: 14, color: tokens.textSecondary, marginTop: 4 }}>
                            {" "}
                            <span
                                style={{
                                    fontWeight: 600,
                                    color: tokens.primary,
                                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                                    fontSize: 13,
                                }}
                            >
                                {serverVersion}
                            </span>
                        </div>
                    )}
                    <div
                        style={{
                            fontSize: 12,
                            color: tokens.textSecondary,
                            marginTop: serverVersion !== null ? 2 : 4,
                            opacity: 0.75,
                        }}
                    >
                        Interfaz{" "}
                        <span
                            style={{
                                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                            }}
                        >
                            {uiVersion}
                        </span>
                    </div>
                </div>
            </div>

            {/* Copyright */}
            <p style={{ margin: "0 0 8px 0", fontSize: 14, color: tokens.textPrimary, fontWeight: 600 }}>
                © {CURRENT_YEAR} Céluma. Todos los derechos reservados.
            </p>
            <p style={{ margin: 0, fontSize: 13, color: tokens.textSecondary, lineHeight: 1.65 }}>
                Este software incorpora componentes de código abierto de terceros distribuidos
                bajo sus respectivas licencias (MIT, BSD, Apache 2.0, LGPL, MPL-2.0, entre otras).
                Las dependencias listadas a continuación corresponden exclusivamente a los paquetes
                de ejecución del cliente web y del servidor.
            </p>

            <Divider style={{ margin: "24px 0" }} />

            {/* Dependency lists */}
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <DepBlock title="Cliente web" deps={FRONTEND_DEPENDENCIES} />
                <DepBlock title="Servidor" deps={BACKEND_DEPENDENCIES} />
            </div>
        </Card>
    );
}
