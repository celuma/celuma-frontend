import { useEffect, useMemo, useState } from "react";
import { Layout, Spin, message, Popconfirm, Typography, Tag, Card } from "antd";
import { useNavigate, useParams } from "react-router-dom";
import type { ColumnsType } from "antd/es/table";
import SidebarCeluma from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import { tokens, cardStyle } from "../components/design/tokens";
import PageHeader from "../components/ui/page_header";
import CelumaButton from "../components/ui/button";
import { CelumaTable } from "../components/ui/table";
import Tooltip from "../components/ui/tooltip";
import { formatDateOnly } from "../components/ui/table_helpers";
import { useUserProfile } from "../hooks/use_user_profile";
import { PERMS } from "../lib/rbac";
import {
    getReportLetterhead,
    listReportLetterheadVersions,
    activateReportLetterheadVersion,
    archiveReportLetterheadVersion,
    exportReportLetterheadVersion,
} from "../services/report_letterhead_service";
import { DownloadOutlined } from "@ant-design/icons";
import type { ReportLetterheadVersionSummary } from "../models/report_letterhead";

const { Text } = Typography;

function getApiBase(): string {
    return import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL || "/api");
}
function getAuthToken(): string | null {
    return localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
}
function getTenantId(): string | null {
    return localStorage.getItem("tenant_id") || sessionStorage.getItem("tenant_id");
}

/** Status chip — never relies on color alone (label text carries the meaning). */
function VersionStatusChip({ status }: { status: ReportLetterheadVersionSummary["status"] }) {
    const cfg =
        status === "ACTIVE"
            ? { bg: "#ecfdf5", ink: "#10b981", label: "Activa" }
            : status === "ARCHIVED"
                ? { bg: "#f3f4f6", ink: "#6b7280", label: "Archivada" }
                : { bg: "#eff6ff", ink: "#2563eb", label: "Publicada" };
    return (
        <span
            style={{
                backgroundColor: cfg.bg,
                color: cfg.ink,
                borderRadius: 12,
                fontSize: 11,
                fontWeight: 600,
                padding: "4px 10px",
                display: "inline-block",
            }}
        >
            {cfg.label}
        </span>
    );
}

interface ReportLetterheadVersionsProps {
    embedded?: boolean;
}

function ReportLetterheadVersions({ embedded = false }: ReportLetterheadVersionsProps) {
    const navigate = useNavigate();
    const { letterheadId } = useParams<{ letterheadId: string }>();
    const { hasPermission } = useUserProfile();
    const canManage = hasPermission(PERMS.MANAGE_TEMPLATES);

    const [loading, setLoading] = useState(false);
    const [letterheadName, setLetterheadName] = useState<string>("");
    const [versions, setVersions] = useState<ReportLetterheadVersionSummary[]>([]);
    const [userNames, setUserNames] = useState<Record<string, string>>({});
    const [busyVersionId, setBusyVersionId] = useState<string | null>(null);

    const load = async () => {
        if (!letterheadId) return;
        setLoading(true);
        try {
            const [letterhead, versionsResp] = await Promise.all([
                getReportLetterhead(letterheadId),
                listReportLetterheadVersions(letterheadId),
            ]);
            setLetterheadName(letterhead.name);
            setVersions(versionsResp.versions);
        } catch (err) {
            message.error(err instanceof Error ? err.message : "Error al cargar las versiones del membrete");
        } finally {
            setLoading(false);
        }
    };

    // Best-effort id -> nombre lookup for "Publicado por".
    useEffect(() => {
        const tenantId = getTenantId();
        if (!tenantId) return;
        const token = getAuthToken();
        const headers: Record<string, string> = { accept: "application/json" };
        if (token) headers["Authorization"] = token;
        fetch(`${getApiBase()}/v1/tenants/${tenantId}/users`, { headers })
            .then((res) => (res.ok ? res.json() : []))
            .then((users: Array<{ id: string; full_name?: string; email?: string }>) => {
                const map: Record<string, string> = {};
                for (const u of users) map[u.id] = u.full_name || u.email || u.id;
                setUserNames(map);
            })
            .catch(() => { /* best-effort only */ });
    }, []);

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [letterheadId]);

    const activeVersion = useMemo(() => versions.find((v) => v.status === "ACTIVE"), [versions]);

    const handleActivate = async (version: ReportLetterheadVersionSummary) => {
        if (!letterheadId) return;
        setBusyVersionId(version.id);
        try {
            await activateReportLetterheadVersion(letterheadId, version.id);
            message.success(`Versión ${version.version_number} activada`);
            await load();
        } catch (err) {
            message.error(err instanceof Error ? err.message : "Error al activar la versión");
        } finally {
            setBusyVersionId(null);
        }
    };

    const handleArchive = async (version: ReportLetterheadVersionSummary) => {
        if (!letterheadId) return;
        setBusyVersionId(version.id);
        try {
            await archiveReportLetterheadVersion(letterheadId, version.id);
            message.success(`Versión ${version.version_number} archivada`);
            await load();
        } catch (err) {
            message.error(err instanceof Error ? err.message : "Error al archivar la versión");
        } finally {
            setBusyVersionId(null);
        }
    };

    const handleExport = async (version: ReportLetterheadVersionSummary) => {
        if (!letterheadId) return;
        setBusyVersionId(version.id);
        try {
            const filename = `${(letterheadName || "membrete").replace(/\s+/g, "-")}-v${version.version_number}.cell`;
            await exportReportLetterheadVersion(letterheadId, version.id, filename);
        } catch (err) {
            message.error(err instanceof Error ? err.message : "Error al exportar la versión");
        } finally {
            setBusyVersionId(null);
        }
    };

    const columns: ColumnsType<ReportLetterheadVersionSummary> = [
        {
            title: "Versión",
            dataIndex: "version_number",
            key: "version_number",
            sorter: (a, b) => a.version_number - b.version_number,
            defaultSortOrder: "descend",
            render: (n: number) => <Text strong>#{n}</Text>,
        },
        {
            title: "Estado",
            dataIndex: "status",
            key: "status",
            filters: [
                { text: "Publicada", value: "PUBLISHED" },
                { text: "Activa", value: "ACTIVE" },
                { text: "Archivada", value: "ARCHIVED" },
            ],
            onFilter: (value, record) => record.status === value,
            render: (status: ReportLetterheadVersionSummary["status"]) => <VersionStatusChip status={status} />,
        },
        {
            title: "Publicada",
            dataIndex: "published_at",
            key: "published_at",
            sorter: (a, b) => new Date(a.published_at).getTime() - new Date(b.published_at).getTime(),
            render: (d: string) => formatDateOnly(d),
        },
        {
            title: "Publicado por",
            dataIndex: "created_by",
            key: "created_by",
            render: (id: string | null) => (id ? (userNames[id] ?? id) : "—"),
        },
        {
            title: "Activada",
            dataIndex: "activated_at",
            key: "activated_at",
            render: (d: string | null) => formatDateOnly(d),
        },
        {
            title: "Archivada",
            dataIndex: "archived_at",
            key: "archived_at",
            render: (d: string | null) => formatDateOnly(d),
        },
        {
            title: "Acciones",
            key: "actions",
            render: (_: unknown, version) => (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Tooltip title="Ver esta configuración y publicar una nueva versión a partir de ella">
                        <CelumaButton
                            size="xsmall"
                            disabled={!canManage}
                            onClick={() => navigate(`/config/report-letterheads/${letterheadId}/versions/new?mode=publish&from=${version.id}`)}
                        >
                            Nueva versión desde esta
                        </CelumaButton>
                    </Tooltip>
                    <Tooltip title="Exportar como archivo .cell portable">
                        <CelumaButton
                            size="xsmall"
                            icon={<DownloadOutlined />}
                            loading={busyVersionId === version.id}
                            onClick={() => handleExport(version)}
                        >
                            Exportar
                        </CelumaButton>
                    </Tooltip>
                    {version.status !== "ACTIVE" && (
                        <Popconfirm
                            title="Restaurar esta versión"
                            description={
                                <span>
                                    Se usará como membrete predeterminado para reportes futuros que usen
                                    este membrete. Los reportes ya publicados conservan su presentación
                                    original intacta.
                                </span>
                            }
                            okText="Restaurar"
                            cancelText="Cancelar"
                            onConfirm={() => handleActivate(version)}
                            disabled={!canManage}
                        >
                            <CelumaButton size="xsmall" type="primary" loading={busyVersionId === version.id} disabled={!canManage}>
                                Restaurar
                            </CelumaButton>
                        </Popconfirm>
                    )}
                    {version.status === "PUBLISHED" && (
                        <Popconfirm
                            title="Archivar esta versión"
                            description={
                                <span>
                                    Dejará de estar disponible para reportes nuevos. Los reportes que ya
                                    la usan no cambiarán. Puedes reactivarla más adelante.
                                </span>
                            }
                            okText="Archivar"
                            cancelText="Cancelar"
                            onConfirm={() => handleArchive(version)}
                            disabled={!canManage}
                        >
                            <CelumaButton size="xsmall" danger loading={busyVersionId === version.id} disabled={!canManage}>
                                Archivar
                            </CelumaButton>
                        </Popconfirm>
                    )}
                </div>
            ),
        },
    ];

    const content = (
        <div style={{ display: "grid", gap: tokens.gap }}>
            <PageHeader
                title={letterheadName ? `Versiones — ${letterheadName}` : "Versiones del membrete"}
                subtitle="Publica, activa y archiva configuraciones de presentación para este membrete."
                extra={
                    <div style={{ display: "flex", gap: 8 }}>
                        <CelumaButton onClick={() => navigate("/config/report-letterheads")}>Volver</CelumaButton>
                        <CelumaButton
                            type="primary"
                            disabled={!canManage}
                            onClick={() => navigate(`/config/report-letterheads/${letterheadId}/versions/new?mode=publish`)}
                        >
                            Nueva versión
                        </CelumaButton>
                    </div>
                }
            />

            {!canManage && (
                <Tag color="warning" style={{ width: "fit-content" }}>
                    Solo lectura — se requiere el permiso reports:manage_templates para publicar, activar o archivar versiones.
                </Tag>
            )}

            {activeVersion && (
                <Tag color="success" style={{ width: "fit-content", padding: "4px 10px" }}>
                    Versión activa: #{activeVersion.version_number}
                </Tag>
            )}

            <Card style={cardStyle}>
                <CelumaTable
                    columns={columns}
                    dataSource={versions}
                    loading={loading}
                    rowKey="id"
                    pagination={{ pageSize: 10 }}
                    emptyText="Este membrete aún no tiene versiones publicadas"
                    scroll={{ x: 960 }}
                />
            </Card>
        </div>
    );

    if (loading && versions.length === 0) {
        return (
            <Layout style={{ minHeight: "100vh", alignItems: "center", justifyContent: "center" }}>
                <Spin size="large" />
            </Layout>
        );
    }

    if (embedded) {
        return content;
    }

    return (
        <Layout style={{ minHeight: "100vh" }}>
            <SidebarCeluma selectedKey="/config" onNavigate={(k) => navigate(k)} logoSrc={logo} />
            <Layout.Content style={{ padding: tokens.contentPadding, background: tokens.bg, fontFamily: tokens.textFont }}>
                <div style={{ maxWidth: tokens.maxWidth, margin: "0 auto" }}>{content}</div>
            </Layout.Content>
        </Layout>
    );
}

export default ReportLetterheadVersions;
