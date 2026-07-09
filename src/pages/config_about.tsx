import { useEffect, useState } from "react";
import { Card, Divider } from "antd";
import { ReadOutlined, GlobalOutlined, ExportOutlined } from "@ant-design/icons";
import { tokens, cardStyle } from "../components/design/tokens";
import PageHeader from "../components/ui/page_header";
import CelumaButton from "../components/ui/button";
import { usePageTitle } from "../hooks/use_page_title";
import { FRONTEND_DEPENDENCIES, BACKEND_DEPENDENCIES } from "../legal/third_party_dependencies";

const CURRENT_YEAR = new Date().getFullYear();

const LINKS = {
    landing: "https://celuma.mx",
    docs: "https://docs.celuma.mx",
};

function getApiBase(): string {
    return import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL || "/api");
}

const sectionLabelStyle: React.CSSProperties = {
    margin: "0 0 12px 0",
    fontSize: 11,
    fontWeight: 600,
    color: tokens.textSecondary,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
};

function VersionStat({ label, value, color }: { label: string; value: string; color: string }) {
    return (
        <div>
            <p style={{ margin: "0 0 2px 0", fontSize: 10, fontWeight: 600, color: tokens.textSecondary, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {label}
            </p>
            <p style={{ margin: 0, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontSize: 16, fontWeight: 700, color }}>
                {value}
            </p>
        </div>
    );
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
        <div style={{ display: "grid", gap: tokens.gap }}>
            {/* Header — title + integrated version/license info */}
            <PageHeader
                title="Acerca de Céluma"
                subtitle="Información del sistema y licencias de componentes"
                extra={
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-end", textAlign: "right" }}>
                        <div style={{ display: "flex", gap: 28 }}>
                            <VersionStat label="Servidor" value={serverVersion ?? "—"} color={tokens.primary} />
                            <VersionStat label="Interfaz" value={uiVersion} color={tokens.textPrimary} />
                        </div>
                        <p style={{ margin: 0, fontSize: 12, color: tokens.textSecondary, lineHeight: 1.5 }}>
                            © {CURRENT_YEAR} Céluma. Todos los derechos reservados.
                        </p>
                    </div>
                }
            />

            {/* Resources + dependencies */}
            <Card style={cardStyle} styles={{ body: { padding: tokens.cardPadding } }}>
                {/* Resources */}
                <div>
                    <p style={sectionLabelStyle}>Recursos</p>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                        <CelumaButton
                            size="small"
                            href={LINKS.docs}
                            target="_blank"
                            rel="noopener noreferrer"
                            icon={<ReadOutlined />}
                        >
                            Documentación <ExportOutlined style={{ fontSize: 11, opacity: 0.7 }} />
                        </CelumaButton>
                        <CelumaButton
                            size="small"
                            href={LINKS.landing}
                            target="_blank"
                            rel="noopener noreferrer"
                            icon={<GlobalOutlined />}
                        >
                            Sitio web <ExportOutlined style={{ fontSize: 11, opacity: 0.7 }} />
                        </CelumaButton>
                    </div>
                </div>

                <Divider style={{ margin: "20px 0" }} />

                {/* Dependencies */}
                <div>
                    <p style={{ margin: "0 0 16px 0", fontSize: 13, color: tokens.textSecondary, lineHeight: 1.65 }}>
                        Este software incorpora componentes de código abierto bajo licencias MIT, BSD, Apache 2.0, LGPL, MPL-2.0, entre otras.
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                        <DepBlock title="Cliente Web" deps={FRONTEND_DEPENDENCIES} />
                        <DepBlock title="Servidor" deps={BACKEND_DEPENDENCIES} />
                    </div>
                </div>
            </Card>
        </div>
    );
}
