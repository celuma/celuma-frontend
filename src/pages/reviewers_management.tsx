import { useEffect, useState } from "react";
import {
    Layout, Card, Button, message,
    Space, Popconfirm, Spin, Avatar,
} from "antd";
import {
    DeleteOutlined,
    CheckCircleFilled, MinusCircleOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import SidebarCeluma from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import { tokens, cardStyle } from "../components/design/tokens";
import PageHeader from "../components/ui/page_header";
import { CelumaTable } from "../components/ui/table";
import CelumaButton from "../components/ui/button";
import CelumaModal from "../components/ui/celuma_modal";
import FloatingCaptionSelect from "../components/ui/floating_caption_select";
import Panel from "../components/ui/panel";
import ModalFormFooter from "../components/ui/modal_form_footer";
import { matchesQuery } from "../lib/search";
import type { ColumnsType } from "antd/es/table";
import { useUserProfile } from "../hooks/use_user_profile";
import { usePageTitle } from "../hooks/use_page_title";

const REVIEWER_ROLE = "reviewer";
// Only users who already hold one of these roles may be promoted to Revisor.
const REVIEWER_ELIGIBLE_ROLES = ["pathologist", "admin", "superuser"];

const getInitials = (fullName?: string | null): string => {
    if (!fullName) return "U";
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) return parts[0][0]?.toUpperCase() || "U";
    return (parts[0][0]?.toUpperCase() || "") + (parts[parts.length - 1][0]?.toUpperCase() || "");
};

const getAvatarColor = (name: string): string => {
    const colors = ["#49b6ad", "#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#ef4444", "#6366f1"];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
};

function getApiBase(): string {
    return import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL || "/api");
}

function getAuthToken(): string | null {
    return localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
}

async function getJSON<TRes>(path: string): Promise<TRes> {
    const token = getAuthToken();
    const headers: Record<string, string> = { accept: "application/json" };
    if (token) headers["Authorization"] = token;
    const res = await fetch(`${getApiBase()}${path}`, { method: "GET", headers });
    if (!res.ok) throw new Error(await res.text());
    return await res.json();
}

async function putJSON<TRes>(path: string, body: unknown): Promise<TRes> {
    const token = getAuthToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = token;
    const res = await fetch(`${getApiBase()}${path}`, { method: "PUT", headers, body: JSON.stringify(body) });
    if (!res.ok) {
        const text = await res.text();
        let detail = text;
        try {
            const json = JSON.parse(text);
            if (typeof json.detail === "string") detail = json.detail;
            else if (Array.isArray(json.detail)) detail = json.detail.map((e: { msg?: string }) => e.msg).join("; ");
        } catch { /* use raw text */ }
        throw new Error(detail);
    }
    return await res.json();
}

interface ReviewerItem {
    id: string;
    full_name: string;
    email: string;
    has_signature: boolean;
    avatar_url?: string;
}

interface User {
    id: string;
    email: string;
    username?: string;
    full_name: string;
    roles: string[];
    is_active: boolean;
    branch_ids: string[];
    avatar_url?: string;
}

interface ReviewersManagementProps {
    embedded?: boolean;
}

function ReviewersManagement({ embedded = false }: ReviewersManagementProps) {
    usePageTitle();
    const navigate = useNavigate();
    const { profile, loading: profileLoading, canManageUsers } = useUserProfile();

    const [loading, setLoading] = useState(false);
    const [reviewers, setReviewers] = useState<ReviewerItem[]>([]);
    const [allUsers, setAllUsers] = useState<User[]>([]);

    const [addModalOpen, setAddModalOpen] = useState(false);
    const [selectedUserId, setSelectedUserId] = useState<string | undefined>(undefined);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!profileLoading) {
            if (!canManageUsers) {
                message.error("Acceso denegado: permiso admin:manage_users requerido");
                navigate("/home");
                return;
            }
            loadData();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [profileLoading, canManageUsers]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [reviewersResp, usersResp] = await Promise.all([
                getJSON<{ reviewers: ReviewerItem[] }>("/v1/users/reviewers"),
                getJSON<{ users: User[] }>("/v1/users/"),
            ]);
            setReviewers(reviewersResp.reviewers);
            setAllUsers(usersResp.users);
        } catch {
            message.error("Error al cargar revisores");
        } finally {
            setLoading(false);
        }
    };

    const handleAddReviewer = async () => {
        if (!selectedUserId) return;
        const target = allUsers.find((u) => u.id === selectedUserId);
        if (!target) return;
        setSubmitting(true);
        try {
            const newRoles = Array.from(new Set([...target.roles, REVIEWER_ROLE]));
            await putJSON(`/v1/rbac/users/${target.id}/roles`, { roles: newRoles });
            message.success(`${target.full_name} ahora es revisor`);
            setAddModalOpen(false);
            setSelectedUserId(undefined);
            await loadData();
        } catch (e) {
            message.error(e instanceof Error ? e.message : "Error al asignar rol");
        } finally {
            setSubmitting(false);
        }
    };

    const handleRemoveReviewer = async (reviewerId: string) => {
        const target = allUsers.find((u) => u.id === reviewerId);
        if (!target) {
            // Fallback: remove only the reviewer role without knowing the rest of the roles
            try {
                await putJSON(`/v1/rbac/users/${reviewerId}/roles`, { roles: [] });
                message.success("Rol Revisor removido");
                await loadData();
            } catch (e) {
                message.error(e instanceof Error ? e.message : "Error al remover rol");
            }
            return;
        }
        try {
            const newRoles = target.roles.filter((r) => r !== REVIEWER_ROLE);
            await putJSON(`/v1/rbac/users/${target.id}/roles`, { roles: newRoles });
            message.success(`${target.full_name} ya no es revisor`);
            await loadData();
        } catch (e) {
            message.error(e instanceof Error ? e.message : "Error al remover rol");
        }
    };

    // Users eligible to be added as reviewers: active, without the reviewer role,
    // and holding at least one of the eligible roles (Patólogo, Admin o Superadmin).
    const eligibleUsers = allUsers.filter(
        (u) =>
            u.is_active &&
            !u.roles.includes(REVIEWER_ROLE) &&
            u.roles.some((r) => REVIEWER_ELIGIBLE_ROLES.includes(r)),
    );

    const columns: ColumnsType<ReviewerItem> = [
        {
            title: "Revisor",
            dataIndex: "full_name",
            key: "full_name",
            render: (name: string, record) => (
                <Space>
                    <Avatar
                        size={32}
                        src={record.avatar_url}
                        style={{
                            backgroundColor: record.avatar_url
                                ? "transparent"
                                : getAvatarColor(name || "Usuario"),
                            fontWeight: 600,
                            fontSize: 13,
                        }}
                    >
                        {getInitials(name)}
                    </Avatar>
                    <span style={{ fontWeight: 500 }}>{name}</span>
                </Space>
            ),
            sorter: (a, b) => a.full_name.localeCompare(b.full_name),
        },
        {
            title: "Email",
            dataIndex: "email",
            key: "email",
        },
        {
            title: "Firma digital",
            dataIndex: "has_signature",
            key: "has_signature",
            filters: [
                { text: "Cargada", value: true },
                { text: "Sin firma", value: false },
            ],
            onFilter: (value, record) => record.has_signature === value,
            render: (hasSignature: boolean) => (
                hasSignature ? (
                    <Space size={6} style={{ color: "#10b981", fontWeight: 500, fontSize: 12 }}>
                        <CheckCircleFilled />
                        Cargada
                    </Space>
                ) : (
                    <Space size={6} style={{ color: "#9ca3af", fontWeight: 500, fontSize: 12 }}>
                        <MinusCircleOutlined />
                        Sin firma
                    </Space>
                )
            ),
        },
        {
            title: "Acciones",
            key: "actions",
            width: 140,
            render: (_, record) => {
                const isSelf = record.id === profile?.id;
                return (
                    <Popconfirm
                        title="Remover rol Revisor"
                        description={
                            isSelf
                                ? "Te quitarás el rol de Revisor a ti mismo. ¿Continuar?"
                                : `${record.full_name} dejará de poder firmar informes. ¿Continuar?`
                        }
                        okText="Remover"
                        cancelText="Cancelar"
                        okButtonProps={{ danger: true }}
                        onConfirm={() => handleRemoveReviewer(record.id)}
                    >
                        <Button
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                            size="small"
                        >
                            Remover
                        </Button>
                    </Popconfirm>
                );
            },
        },
    ];

    if (profileLoading) {
        if (embedded) {
            return <div style={{ display: "flex", justifyContent: "center", padding: 48 }}><Spin size="large" /></div>;
        }
        return (
            <Layout style={{ minHeight: "100vh", justifyContent: "center", alignItems: "center" }}>
                <Spin size="large" />
            </Layout>
        );
    }

    const content = (
        <div style={{ display: "grid", gap: tokens.gap }}>
            <PageHeader
                title="Revisores"
                subtitle="Usuarios autorizados para firmar y publicar informes patológicos"
                extra={
                    <CelumaButton
                        type="primary"
                        onClick={() => setAddModalOpen(true)}
                        disabled={eligibleUsers.length === 0}
                    >
                        Agregar Revisor
                    </CelumaButton>
                }
            />
            <Card style={cardStyle}>
                <CelumaTable
                    columns={columns}
                    dataSource={reviewers}
                    loading={loading}
                    rowKey="id"
                    pagination={{ pageSize: 10 }}
                    emptyText="Aún no hay revisores asignados"
                    searchable
                    searchPlaceholder="Buscar revisores"
                    searchFilter={(r, q) => matchesQuery([r.full_name, r.email], q)}
                />
            </Card>

            <CelumaModal
                title="Agregar Revisor"
                open={addModalOpen}
                onCancel={() => {
                    setAddModalOpen(false);
                    setSelectedUserId(undefined);
                }}
                footer={null}
                width={520}
                destroyOnHidden
            >
                <form
                    onSubmit={(e) => { e.preventDefault(); if (selectedUserId) handleAddReviewer(); }}
                    style={{ display: "grid", gap: 18 }}
                >
                    <Panel style={{ background: "#f0fdfa", border: "2px solid #b2e8e4", color: tokens.textSecondary, fontSize: 13, lineHeight: 1.5 }}>
                        Selecciona el usuario al que deseas asignar el rol de Revisor. Solo se muestran usuarios activos con rol de <strong>Patólogo</strong>, <strong>Administrador</strong> o <strong>Superadministrador</strong> que aún no son revisores.
                    </Panel>
                    <FloatingCaptionSelect
                        label="Usuario"
                        requiredMark
                        value={selectedUserId}
                        onChange={(v) => setSelectedUserId(v)}
                        placeholder="Buscar por nombre o email…"
                        options={eligibleUsers.map((u) => ({ value: u.id, label: `${u.full_name} · ${u.email}` }))}
                        showSearch
                    />
                    <ModalFormFooter
                        onCancel={() => { setAddModalOpen(false); setSelectedUserId(undefined); }}
                        submitLabel="Agregar"
                        loading={submitting}
                        submitDisabled={!selectedUserId}
                        hideRequiredNote
                    />
                </form>
            </CelumaModal>
        </div>
    );

    if (embedded) {
        return content;
    }

    return (
        <Layout style={{ minHeight: "100vh", padding: 0, margin: 0 }}>
            <SidebarCeluma selectedKey="/config" onNavigate={(k) => navigate(k)} logoSrc={logo} />
            <Layout.Content style={{ padding: tokens.contentPadding, background: tokens.bg, fontFamily: tokens.textFont }}>
                <div style={{ maxWidth: tokens.maxWidth, margin: "0 auto" }}>
                    {content}
                </div>
            </Layout.Content>
        </Layout>
    );
}

export default ReviewersManagement;
