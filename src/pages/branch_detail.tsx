import { useEffect, useState } from "react";
import { Layout, Card, Tag, Space, Button as AntButton, Avatar } from "antd";
import { EditOutlined, EnvironmentOutlined, ClockCircleOutlined } from "@ant-design/icons";
import { useNavigate, useParams } from "react-router-dom";
import type { ColumnsType } from "antd/es/table";
import SidebarCeluma from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import ErrorText from "../components/ui/error_text";
import { tokens, cardStyle, cardTitleStyle } from "../components/design/tokens";
import { CelumaTable } from "../components/ui/table";
import { matchesQuery } from "../lib/search";
import { getInitials, getAvatarColor, stringSorter } from "../components/ui/table_helpers";
import { usePageTitle } from "../hooks/use_page_title";

function getApiBase(): string {
    return import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL || "/api");
}

async function getJSON<TRes>(path: string): Promise<TRes> {
    const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
    const headers: Record<string, string> = { accept: "application/json" };
    if (token) headers["Authorization"] = token;
    const res = await fetch(`${getApiBase()}${path}`, { method: "GET", headers, credentials: "include" });
    const text = await res.text();
    let parsed: unknown = undefined;
    try { parsed = text ? JSON.parse(text) : undefined; } catch { /* ignore */ }
    if (!res.ok) {
        const message = (parsed as { message?: string } | undefined)?.message ?? `${res.status} ${res.statusText}`;
        throw new Error(message);
    }
    return parsed as TRes;
}

type BranchDetail = {
    id: string;
    code: string;
    name: string;
    timezone: string;
    address_line1?: string | null;
    address_line2?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
    country: string;
    is_active: boolean;
    tenant_id: string;
};

type BranchUser = {
    id: string;
    email: string;
    full_name: string;
    roles: Array<{ code: string; name: string }>;
};

interface Props {
    embedded?: boolean;
}

function BranchDetail({ embedded = false }: Props) {
    usePageTitle();
    const navigate = useNavigate();
    const { branchId } = useParams();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [branch, setBranch] = useState<BranchDetail | null>(null);
    const [users, setUsers] = useState<BranchUser[]>([]);

    const basePath = "/config/branches";

    useEffect(() => {
        if (!branchId) return;
        setLoading(true);
        Promise.all([
            getJSON<BranchDetail>(`/v1/branches/${branchId}`),
            getJSON<BranchUser[]>(`/v1/branches/${branchId}/users`),
        ])
            .then(([detail, branchUsers]) => {
                setBranch(detail);
                setUsers(branchUsers || []);
            })
            .catch((err) => setError(err instanceof Error ? err.message : "Ocurrió un error inesperado."))
            .finally(() => setLoading(false));
    }, [branchId]);

    const addressParts = branch
        ? [branch.address_line1, branch.address_line2, branch.city, branch.state, branch.postal_code, branch.country]
              .filter(Boolean)
              .join(", ")
        : "";

    const userColumns: ColumnsType<BranchUser> = [
        {
            title: "Usuario",
            key: "name",
            render: (_, r: BranchUser) => {
                const initials = getInitials(r.full_name || r.email);
                const color = getAvatarColor(r.full_name || r.email);
                return (
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <Avatar size={32} style={{ backgroundColor: color, fontSize: 13, fontWeight: 600 }}>
                            {initials}
                        </Avatar>
                        <div>
                            <div style={{ fontWeight: 500 }}>{r.full_name || "—"}</div>
                            <div style={{ fontSize: 12, color: tokens.textSecondary }}>{r.email}</div>
                        </div>
                    </div>
                );
            },
            sorter: stringSorter("full_name"),
        },
        {
            title: "Roles",
            key: "roles",
            render: (_, r: BranchUser) =>
                r.roles.length > 0 ? (
                    <Space size={4} wrap>
                        {r.roles.map((role) => (
                            <Tag key={role.code}>{role.name}</Tag>
                        ))}
                    </Space>
                ) : (
                    <span style={{ color: tokens.textSecondary, fontSize: 12 }}>Sin rol</span>
                ),
        },
    ];

    const content = (
        <div style={{ display: "grid", gap: tokens.gap }}>
            {/* Branch info card */}
            <Card
                style={cardStyle}
                loading={loading}
                extra={
                    !loading && branch ? (
                        <AntButton
                            icon={<EditOutlined />}
                            onClick={() => navigate(`${basePath}/${branch.id}/edit`)}
                        >
                            Editar
                        </AntButton>
                    ) : null
                }
            >
                {branch && (
                    <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
                            <div>
                                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, fontFamily: tokens.titleFont, color: tokens.textPrimary }}>
                                    {branch.name}
                                </h1>
                                <Tag color={tokens.primary} style={{ marginTop: 6, fontSize: 13, padding: "2px 12px", borderRadius: 12 }}>
                                    {branch.code}
                                </Tag>
                                <Tag color={branch.is_active ? "green" : "default"} style={{ marginTop: 6, marginLeft: 4 }}>
                                    {branch.is_active ? "Activo" : "Inactivo"}
                                </Tag>
                            </div>
                        </div>

                        <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
                            {branch.timezone && (
                                <div style={{ display: "flex", alignItems: "center", gap: 8, color: tokens.textSecondary }}>
                                    <ClockCircleOutlined style={{ fontSize: 16, color: tokens.primary }} />
                                    <span>{branch.timezone}</span>
                                </div>
                            )}
                            {addressParts && (
                                <div style={{ display: "flex", alignItems: "center", gap: 8, color: tokens.textSecondary }}>
                                    <EnvironmentOutlined style={{ fontSize: 16, color: tokens.primary }} />
                                    <span>{addressParts}</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}
                {error && <ErrorText>{error}</ErrorText>}
            </Card>

            {/* Users table */}
            <Card
                title={<span style={cardTitleStyle}>Usuarios con acceso</span>}
                style={cardStyle}
                loading={loading}
            >
                <CelumaTable
                    dataSource={users}
                    columns={userColumns}
                    rowKey={(r) => r.id}
                    loading={loading}
                    emptyText="Sin usuarios asignados"
                    pagination={{ pageSize: 10 }}
                    searchable
                    searchPlaceholder="Buscar usuarios"
                    searchFilter={(r, q) => matchesQuery([r.full_name, r.email, r.roles?.map((role) => [role.code, role.name])], q)}
                    locale={{
                        filterTitle: "Filtrar",
                        filterConfirm: "Aceptar",
                        filterReset: "Limpiar",
                        filterEmptyText: "Sin filtros",
                        filterCheckall: "Seleccionar todo",
                        filterSearchPlaceholder: "Buscar en filtros",
                        emptyText: "Sin usuarios",
                        selectAll: "Seleccionar todo",
                        selectInvert: "Invertir selección",
                        selectNone: "Limpiar selección",
                        selectionAll: "Seleccionar todos",
                        sortTitle: "Ordenar",
                        expand: "Expandir fila",
                        collapse: "Colapsar fila",
                        triggerDesc: "Clic para ordenar descendente",
                        triggerAsc: "Clic para ordenar ascendente",
                        cancelSort: "Clic para cancelar ordenamiento",
                    }}
                />
            </Card>
        </div>
    );

    if (embedded) return content;

    return (
        <Layout style={{ minHeight: "100vh", padding: 0, margin: 0 }}>
            <SidebarCeluma selectedKey="/config" onNavigate={(k) => navigate(k)} logoSrc={logo} />
            <Layout.Content style={{ padding: tokens.contentPadding, background: tokens.bg, fontFamily: tokens.textFont }}>
                <div style={{ maxWidth: tokens.maxWidth, margin: "0 auto" }}>{content}</div>
            </Layout.Content>
        </Layout>
    );
}

export default BranchDetail;
