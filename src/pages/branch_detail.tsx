import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Layout, Card, Avatar } from "antd";
import { EditOutlined, PoweroffOutlined, EnvironmentOutlined, ClockCircleOutlined, GlobalOutlined, TeamOutlined } from "@ant-design/icons";
import { useNavigate, useParams } from "react-router-dom";
import type { ColumnsType } from "antd/es/table";
import SidebarCeluma from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import ErrorText from "../components/ui/error_text";
import ActionButtonPanel from "../components/ui/action_button_panel";
import ConfirmDialog from "../components/ui/confirm_dialog";
import { tokens, cardStyle, cardTitleStyle } from "../components/design/tokens";
import { CelumaTable } from "../components/ui/table";
import { matchesQuery } from "../lib/search";
import { getInitials, getAvatarColor, stringSorter } from "../components/ui/table_helpers";
import { roleDisplayName, roleColor } from "../lib/rbac";
import { usePageTitle } from "../hooks/use_page_title";

const codeChipStyle: CSSProperties = {
    background: tokens.secondary,
    color: "#fff",
    fontSize: 13,
    fontWeight: 600,
    padding: "3px 12px",
    borderRadius: 999,
    lineHeight: 1.5,
};

const statusChipStyle = (active: boolean): CSSProperties => ({
    background: active ? "#e9f9f1" : "#f1f5f9",
    color: active ? "#0f9d6e" : "#64748b",
    fontSize: 13,
    fontWeight: 600,
    padding: "3px 12px",
    borderRadius: 999,
    lineHeight: 1.5,
});

const MetaItem = ({ icon, children }: { icon: ReactNode; children: ReactNode }) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, color: tokens.textSecondary, fontSize: 14 }}>
        <span style={{ color: tokens.primary, fontSize: 16, display: "inline-flex" }}>{icon}</span>
        {children}
    </span>
);

const Stat = ({ value, label, color }: { value: number; label: string; color: string }) => (
    <div style={{ textAlign: "center", padding: "0 18px" }}>
        <div style={{ fontSize: 24, fontWeight: 800, color, fontFamily: tokens.titleFont, lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 12, color: tokens.textSecondary, marginTop: 2 }}>{label}</div>
    </div>
);

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

async function putJSON<TReq extends object, TRes>(path: string, body: TReq): Promise<TRes> {
    const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
    const headers: Record<string, string> = { "Content-Type": "application/json", accept: "application/json" };
    if (token) headers["Authorization"] = token;
    const res = await fetch(`${getApiBase()}${path}`, { method: "PUT", headers, body: JSON.stringify(body), credentials: "include" });
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
    roles: string[];
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
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [toggling, setToggling] = useState(false);

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

    const avatarSeed = branch?.name || branch?.code || "SU";
    const initials = useMemo(() => getInitials(avatarSeed), [avatarSeed]);
    const avatarColor = useMemo(() => getAvatarColor(avatarSeed), [avatarSeed]);
    const isActive = !!branch?.is_active;

    const cityState = branch
        ? [branch.city, branch.state].filter(Boolean).join(", ")
        : "";
    const streetAddress = branch
        ? [branch.address_line1, branch.address_line2, cityState, branch.postal_code].filter(Boolean).join(", ")
        : "";

    const userColumns: ColumnsType<BranchUser> = [
        {
            title: "Usuario",
            key: "name",
            render: (_, r: BranchUser) => {
                const userInitials = getInitials(r.full_name || r.email);
                const color = getAvatarColor(r.full_name || r.email);
                return (
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <Avatar size={32} style={{ backgroundColor: color, fontSize: 13, fontWeight: 600 }}>
                            {userInitials}
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
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {r.roles.map((code) => {
                            const { color, bg } = roleColor(code);
                            return (
                                <span
                                    key={code}
                                    style={{ backgroundColor: bg, color, borderRadius: 12, fontSize: 11, fontWeight: 500, padding: "3px 9px", display: "inline-block" }}
                                >
                                    {roleDisplayName(code)}
                                </span>
                            );
                        })}
                    </div>
                ) : (
                    <span style={{ color: tokens.textSecondary, fontSize: 12 }}>Sin rol</span>
                ),
        },
    ];

    const handleToggleActive = async () => {
        if (!branch) return;
        const next = !branch.is_active;
        setError(null);
        setToggling(true);
        try {
            await putJSON(`/v1/branches/${branch.id}`, { is_active: next });
            setBranch({ ...branch, is_active: next });
            setConfirmOpen(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : "No se pudo actualizar el estado de la sucursal.");
        } finally {
            setToggling(false);
        }
    };

    const content = (
        <div style={{ display: "grid", gap: tokens.gap }}>
            <style>{`
                .br-badge { display: flex; gap: 24px; align-items: flex-start; }
                .br-badge-info { flex: 1; min-width: 0; }
                .br-meta { display: flex; flex-wrap: wrap; gap: 8px 22px; margin-top: 12px; }
                .br-footer { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; margin-top: 18px; }
                @media (max-width: 640px) {
                    .br-badge { flex-direction: column; align-items: center; text-align: center; }
                    .br-meta { justify-content: center; }
                    .br-name-row { justify-content: center; }
                    .br-footer { justify-content: center; }
                }
            `}</style>

            {/* Branch badge / ficha */}
            <Card
                style={{ ...cardStyle, borderLeft: `5px solid ${tokens.secondary}`, position: "relative" }}
                loading={loading}
            >
                {!loading && branch && (
                    <>
                        <div style={{ position: "absolute", top: 16, right: 20, display: "flex", gap: 6, alignItems: "center" }}>
                            <span style={codeChipStyle}>{branch.code}</span>
                            <span style={statusChipStyle(branch.is_active)}>{branch.is_active ? "Activo" : "Inactivo"}</span>
                        </div>
                        <div className="br-badge">
                            <Avatar
                                size={104}
                                style={{
                                    backgroundColor: avatarColor,
                                    fontSize: 38,
                                    fontWeight: 700,
                                    border: "2px solid #d1d5db",
                                    flexShrink: 0,
                                }}
                            >
                                {initials}
                            </Avatar>
                            <div className="br-badge-info">
                                <div className="br-name-row" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                                    <h1 style={{ margin: 0, fontFamily: tokens.titleFont, fontSize: 26, fontWeight: 800, color: tokens.textPrimary, lineHeight: 1.1 }}>
                                        {branch.name}
                                    </h1>
                                </div>
                                <div className="br-meta">
                                    {branch.timezone && <MetaItem icon={<ClockCircleOutlined />}>{branch.timezone}</MetaItem>}
                                    {streetAddress && <MetaItem icon={<EnvironmentOutlined />}>{streetAddress}</MetaItem>}
                                    {branch.country && <MetaItem icon={<GlobalOutlined />}>{branch.country}</MetaItem>}
                                </div>
                                <div className="br-footer">
                                    <Stat value={users.length} label="Usuarios" color={tokens.primary} />
                                    <ActionButtonPanel
                                        actions={[
                                            {
                                                icon: <EditOutlined />,
                                                tooltip: "Editar sucursal",
                                                ariaLabel: "Editar",
                                                onClick: () => navigate(`${basePath}/${branch.id}/edit`),
                                            },
                                            {
                                                icon: <PoweroffOutlined />,
                                                tooltip: isActive ? "Desactivar sucursal" : "Activar sucursal",
                                                ariaLabel: isActive ? "Desactivar" : "Activar",
                                                danger: isActive,
                                                onClick: () => setConfirmOpen(true),
                                            },
                                        ]}
                                    />
                                </div>
                            </div>
                        </div>
                    </>
                )}
                {error && <ErrorText>{error}</ErrorText>}
            </Card>

            {/* Users table */}
            <Card
                title={<span style={cardTitleStyle}><TeamOutlined style={{ color: tokens.primary, marginRight: 8 }} />Usuarios con acceso</span>}
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
                    searchFilter={(r, q) => matchesQuery([r.full_name, r.email, r.roles?.map((code) => [code, roleDisplayName(code)])], q)}
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

            <ConfirmDialog
                open={confirmOpen}
                danger={isActive}
                title={isActive ? "Desactivar sucursal" : "Activar sucursal"}
                description={isActive
                    ? "La sucursal quedará inactiva y no aparecerá como opción activa para nuevas órdenes."
                    : "La sucursal volverá a estar disponible como opción activa para nuevas órdenes."}
                confirmText={isActive ? "Desactivar" : "Activar"}
                cancelText="Cancelar"
                loading={toggling}
                onConfirm={handleToggleActive}
                onCancel={() => setConfirmOpen(false)}
            />
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
