import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
    Layout, Card, Button, message,
    Space, Popconfirm, Switch, Spin, Avatar,
} from "antd";
import { DeleteOutlined, MailOutlined, EditOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import FormField from "../components/ui/form_field";
import FloatingCaptionInput from "../components/ui/floating_caption_input";
import FloatingCaptionPassword from "../components/ui/floating_caption_password";
import FloatingCaptionSelect from "../components/ui/floating_caption_select";
import FloatingCaptionMultiSelect from "../components/ui/floating_caption_multiselect";
import CelumaModal from "../components/ui/celuma_modal";
import Panel from "../components/ui/panel";
import ModalFormFooter from "../components/ui/modal_form_footer";
import CelumaButton from "../components/ui/button";
import ErrorText from "../components/ui/error_text";
import SidebarCeluma from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import { tokens, cardStyle } from "../components/design/tokens";
import PageHeader from "../components/ui/page_header";
import { CelumaTable } from "../components/ui/table";
import { matchesQuery } from "../lib/search";
import type { ColumnsType } from "antd/es/table";
import { useUserProfile } from "../hooks/use_user_profile";
import { usePageTitle } from "../hooks/use_page_title";
import { roleDisplayName, roleColor, hasFullBranchAccess } from "../lib/rbac";

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

const createUserSchema = z.object({
    first_name: z.string().trim().nonempty("El nombre es obligatorio."),
    last_name: z.string().trim().nonempty("El apellido es obligatorio."),
    email: z.string().nonempty("El email es obligatorio.").email("Email inválido."),
    username: z.string().optional(),
    roles: z.array(z.string()).min(1, "Asigna al menos un rol."),
    is_active: z.boolean().optional(),
    password: z
        .string()
        .nonempty("La contraseña es obligatoria.")
        .min(8, "Mínimo 8 caracteres.")
        .regex(
            /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])/,
            "La contraseña debe contener al menos una minúscula, una mayúscula, un número y un carácter especial."
        ),
    confirmPassword: z.string().nonempty("Confirmar contraseña es obligatorio."),
    branch_ids: z.array(z.string()).optional(),
}).refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden.",
    path: ["confirmPassword"],
});

type CreateUserFormData = z.infer<typeof createUserSchema>;

const editUserSchema = z.object({
    email: z.string().nonempty("El email es obligatorio.").email("Email inválido."),
    username: z.string().optional(),
    first_name: z.string().trim().nonempty("El nombre es obligatorio."),
    last_name: z.string().trim().nonempty("El apellido es obligatorio."),
    roles: z.array(z.string()).min(1, "Asigna al menos un rol."),
    is_active: z.boolean().optional(),
    password: z.string().optional().refine((v) => !v || v.length >= 8, "Mínimo 8 caracteres."),
    branch_ids: z.array(z.string()).optional(),
});

type EditUserFormData = z.infer<typeof editUserSchema>;

const inviteUserSchema = z.object({
    email: z.string().nonempty("El email es obligatorio.").email("Email inválido."),
    full_name: z.string().nonempty("El nombre es obligatorio."),
    role: z.string().nonempty("El rol es obligatorio."),
});

type InviteUserFormData = z.infer<typeof inviteUserSchema>;

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

async function postJSON<TRes>(path: string, body: unknown): Promise<TRes> {
    const token = getAuthToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = token;
    const res = await fetch(`${getApiBase()}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
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

async function deleteJSON(path: string): Promise<void> {
    const token = getAuthToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = token;
    const res = await fetch(`${getApiBase()}${path}`, { method: "DELETE", headers });
    if (!res.ok) throw new Error(await res.text());
}

interface User {
    id: string;
    email: string;
    username?: string;
    first_name?: string;
    last_name?: string;
    full_name: string;
    roles: string[];
    is_active: boolean;
    branch_ids: string[];
    avatar_url?: string;
}

interface Branch {
    id: string;
    name: string;
    code: string;
}

// Assignable system roles (superuser excluded — can only be assigned via RBAC admin endpoint)
interface RoleOption {
    code: string;
    name: string;
}

interface UsersManagementProps {
    embedded?: boolean;
}

function UsersManagement({ embedded = false }: UsersManagementProps) {
    usePageTitle();
    const navigate = useNavigate();
    const { profile, loading: profileLoading, canManageUsers, hasRole } = useUserProfile();
    const [loading, setLoading] = useState(false);
    const [users, setUsers] = useState<User[]>([]);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [availableRoles, setAvailableRoles] = useState<RoleOption[]>([]);

    const [createModalVisible, setCreateModalVisible] = useState(false);
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [inviteModalVisible, setInviteModalVisible] = useState(false);

    const createUserForm = useForm<CreateUserFormData>({
        resolver: zodResolver(createUserSchema),
        defaultValues: {
            first_name: "",
            last_name: "",
            email: "",
            username: "",
            roles: [],
            is_active: true,
            password: "",
            confirmPassword: "",
            branch_ids: [],
        },
        mode: "onTouched",
    });
    const [createError, setCreateError] = useState<string | null>(null);
    const watchedCreateRoles = createUserForm.watch("roles");

    const editUserForm = useForm<EditUserFormData>({
        resolver: zodResolver(editUserSchema),
        defaultValues: { email: "", username: "", first_name: "", last_name: "", roles: [], is_active: true, password: "", branch_ids: [] },
        mode: "onTouched",
    });
    const [editError, setEditError] = useState<string | null>(null);
    const watchedEditRoles = editUserForm.watch("roles");

    const inviteUserForm = useForm<InviteUserFormData>({
        resolver: zodResolver(inviteUserSchema),
        defaultValues: { email: "", full_name: "", role: "" },
        mode: "onTouched",
    });
    const [inviteError, setInviteError] = useState<string | null>(null);

    const [editingUser, setEditingUser] = useState<User | null>(null);

    useEffect(() => {
        if (!profileLoading) {
            if (!canManageUsers) {
                message.error("Acceso denegado: permiso admin:manage_users requerido");
                navigate("/home");
                return;
            }
            loadData();
        }
    }, [profileLoading, canManageUsers, navigate]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [usersData, branchesData, rolesData] = await Promise.all([
                getJSON<{ users: User[] }>("/v1/users/"),
                getJSON<Branch[]>("/v1/branches/"),
                getJSON<{ code: string; name: string; is_protected: boolean }[]>("/v1/rbac/roles"),
            ]);
            setUsers(usersData.users);
            setBranches(branchesData);
            // Expose superuser option only if the current actor is a superuser themselves
            const isSuperuser = hasRole("superuser");
            setAvailableRoles(
                rolesData.filter((r) => isSuperuser || r.code !== "superuser")
            );
        } catch {
            message.error("Error al cargar datos");
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = createUserForm.handleSubmit(async (data) => {
        setCreateError(null);
        try {
            // Backend create takes first/last name + a single primary role.
            const fullAccess = hasFullBranchAccess(data.roles);

            const created = await postJSON<{ id: string }>("/v1/users/", {
                email: data.email,
                username: data.username || undefined,
                first_name: data.first_name,
                last_name: data.last_name,
                role: data.roles[0],
                password: data.password,
                branch_ids: fullAccess ? [] : (data.branch_ids ?? []),
            });

            // Assign any additional roles beyond the primary one via the RBAC endpoint.
            if (created?.id && data.roles.length > 1) {
                await putJSON(`/v1/rbac/users/${created.id}/roles`, { roles: data.roles });
            }
            // New users are active by default — only call toggle when created as inactive.
            if (created?.id && data.is_active === false) {
                await postJSON(`/v1/users/${created.id}/toggle-active`, {});
            }

            message.success("Usuario creado");
            setCreateModalVisible(false);
            createUserForm.reset();
            await loadData();
        } catch (e) {
            setCreateError(e instanceof Error ? e.message : "Error al crear usuario");
        }
    });

    const handleEdit = editUserForm.handleSubmit(async (data) => {
        if (!editingUser) return;
        setEditError(null);
        try {
            // Profile fields — never include role here; roles are managed via the RBAC endpoint
            await putJSON(`/v1/users/${editingUser.id}`, {
                email: data.email,
                username: data.username || null,
                first_name: data.first_name,
                last_name: data.last_name,
                is_active: data.is_active,
                password: data.password || undefined,
                branch_ids: hasFullBranchAccess(data.roles) ? [] : (data.branch_ids ?? []),
            });

            // Separate RBAC call only when the role selection has actually changed
            const newRoles = data.roles ?? [];
            const rolesChanged =
                newRoles.length !== editingUser.roles.length ||
                newRoles.some((r) => !editingUser.roles.includes(r));

            if (rolesChanged) {
                await putJSON(`/v1/rbac/users/${editingUser.id}/roles`, { roles: newRoles });
            }

            message.success("Usuario actualizado");
            setEditModalVisible(false);
            editUserForm.reset();
            setEditingUser(null);
            await loadData();
        } catch (e) {
            setEditError(e instanceof Error ? e.message : "Error al actualizar usuario");
        }
    });

    const openEditModal = (user: User) => {
        setEditingUser(user);
        setEditError(null);
        editUserForm.reset({
            email: user.email,
            username: user.username || "",
            first_name: user.first_name || "",
            last_name: user.last_name || "",
            roles: user.roles,
            is_active: user.is_active,
            password: "",
            branch_ids: user.branch_ids,
        });
        setEditModalVisible(true);
    };

    const handleInvite = inviteUserForm.handleSubmit(async (data) => {
        setInviteError(null);
        try {
            await postJSON("/v1/users/invitations", data);
            message.success("Invitación enviada por email");
            setInviteModalVisible(false);
            inviteUserForm.reset();
        } catch (e) {
            setInviteError(e instanceof Error ? e.message : "Error al enviar invitación");
        }
    });

    const handleToggleActive = async (userId: string, currentStatus: boolean) => {
        try {
            await postJSON(`/v1/users/${userId}/toggle-active`, {});
            message.success(`Usuario ${currentStatus ? "desactivado" : "activado"}`);
            await loadData();
        } catch {
            message.error("Error al cambiar estado");
        }
    };

    const handleDelete = async (userId: string) => {
        try {
            await deleteJSON(`/v1/users/${userId}`);
            message.success("Usuario desactivado");
            await loadData();
        } catch {
            message.error("Error al desactivar usuario");
        }
    };

    // All known role codes for column filters
    const roleFilterOptions = availableRoles.map((r) => ({ text: r.name, value: r.code }));

    const columns: ColumnsType<User> = [
        {
            title: "Nombre",
            dataIndex: "full_name",
            key: "full_name",
            render: (name: string, record: User) => (
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
        },
        { title: "Email", dataIndex: "email", key: "email" },
        { title: "Usuario", dataIndex: "username", key: "username", render: (text) => text || "—" },
        {
            title: "Roles",
            dataIndex: "roles",
            key: "roles",
            filters: roleFilterOptions,
            onFilter: (value, record) => record.roles.includes(value as string),
            render: (roles: string[]) => (
                <Space size={4} wrap>
                    {roles.map((r) => {
                        const { color, bg } = roleColor(r);
                        return (
                            <div
                                key={r}
                                style={{
                                    backgroundColor: bg,
                                    color,
                                    borderRadius: 12,
                                    fontSize: 11,
                                    fontWeight: 500,
                                    padding: "3px 9px",
                                    display: "inline-block",
                                }}
                            >
                                {roleDisplayName(r)}
                            </div>
                        );
                    })}
                </Space>
            ),
        },
        {
            title: "Sucursales",
            dataIndex: "branch_ids",
            key: "branches",
            render: (ids: string[], record: User) => {
                if (hasFullBranchAccess(record.roles)) {
                    return (
                        <div style={{ backgroundColor: "#fffbeb", color: "#d97706", borderRadius: 12, fontSize: 11, fontWeight: 500, padding: "4px 10px", display: "inline-block" }}>Todas</div>
                    );
                }
                if (!ids || ids.length === 0) {
                    return <span style={{ color: "#888", fontSize: 12 }}>—</span>;
                }
                const branchNames = ids.map((id) => branches.find((b) => b.id === id)?.name || id);
                if (branchNames.length > 2) {
                    return (
                        <div style={{ backgroundColor: "#eff6ff", color: "#3b82f6", borderRadius: 12, fontSize: 11, fontWeight: 500, padding: "4px 10px", display: "inline-block" }}>{branchNames.length} sucursales</div>
                    );
                }
                return (
                    <Space size={4} wrap>
                        {branchNames.map((name, i) => (
                            <div key={i} style={{ backgroundColor: "#f3f4f6", color: "#374151", borderRadius: 12, fontSize: 11, fontWeight: 500, padding: "4px 10px", display: "inline-block" }}>{name}</div>
                        ))}
                    </Space>
                );
            },
        },
        {
            title: "Estado",
            dataIndex: "is_active",
            key: "is_active",
            render: (active, record) => {
                const isSelf = record.id === profile?.id;
                return (
                    <Switch
                        checked={active}
                        disabled={isSelf}
                        onChange={() => handleToggleActive(record.id, active)}
                        checkedChildren="Activo"
                        unCheckedChildren="Inactivo"
                    />
                );
            },
        },
        {
            title: "Acciones",
            key: "actions",
            width: 120,
            render: (_, record) => {
                const isSelf = record.id === profile?.id;
                if (isSelf) {
                    return (
                        <div style={{ backgroundColor: "#f5f3ff", color: "#7c3aed", borderRadius: 12, fontSize: 11, fontWeight: 500, padding: "4px 10px", display: "inline-block" }}>Tú</div>
                    );
                }
                return (
                    <Space>
                        <Button
                            type="text"
                            icon={<EditOutlined />}
                            onClick={() => openEditModal(record)}
                            size="small"
                            title="Editar"
                        />
                        <Popconfirm
                            title="¿Desactivar este usuario?"
                            onConfirm={() => handleDelete(record.id)}
                            okText="Sí"
                            cancelText="No"
                        >
                            <Button
                                type="text"
                                danger
                                icon={<DeleteOutlined />}
                                size="small"
                                title="Desactivar"
                            />
                        </Popconfirm>
                    </Space>
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

    // Common option lists for the form selects.
    const roleOptions = availableRoles.map((r) => ({ value: r.code, label: r.name }));
    const branchOptions = branches.map((b) => ({ value: b.id, label: `${b.name} (${b.code})` }));

    const content = (
        <div style={{ display: "grid", gap: tokens.gap }}>
            <PageHeader
                title="Gestión de Usuarios"
                subtitle="Administra los usuarios y sus permisos de acceso"
                extra={
                    <Space>
                        <Button icon={<MailOutlined />} onClick={() => setInviteModalVisible(true)}>
                            Enviar Invitación
                        </Button>
                        <CelumaButton type="primary" onClick={() => setCreateModalVisible(true)}>
                            Crear Usuario
                        </CelumaButton>
                    </Space>
                }
            />
            <Card style={cardStyle}>
                <CelumaTable
                    columns={columns}
                    dataSource={users}
                    loading={loading}
                    rowKey="id"
                    pagination={{ pageSize: 10 }}
                    emptyText="Sin usuarios registrados"
                    searchable
                    searchPlaceholder="Buscar usuarios"
                    searchFilter={(r, q) => matchesQuery([r.full_name, r.email, r.username, r.roles?.map((code) => [code, roleDisplayName(code)])], q)}
                />
            </Card>

            {/* ── Create User Modal ── */}
            <CelumaModal
                title="Crear Usuario"
                open={createModalVisible}
                onCancel={() => { setCreateModalVisible(false); createUserForm.reset(); setCreateError(null); }}
                footer={null}
                width={600}
                destroyOnHidden
            >
                <form onSubmit={handleCreate} noValidate style={{ display: "grid", gap: 18 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                        <FormField control={createUserForm.control} name="email" render={(p) => <FloatingCaptionInput {...p} value={String(p.value ?? "")} label="Email" requiredMark />} />
                        <FormField control={createUserForm.control} name="username" render={(p) => <FloatingCaptionInput {...p} value={String(p.value ?? "")} label="Usuario" />} />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                        <FormField control={createUserForm.control} name="first_name" render={(p) => <FloatingCaptionInput {...p} value={String(p.value ?? "")} label="Nombre" requiredMark />} />
                        <FormField control={createUserForm.control} name="last_name" render={(p) => <FloatingCaptionInput {...p} value={String(p.value ?? "")} label="Apellido" requiredMark />} />
                    </div>
                    <FormField
                        control={createUserForm.control}
                        name="roles"
                        render={(p) => (
                            <FloatingCaptionMultiSelect
                                label="Roles"
                                requiredMark
                                value={Array.isArray(p.value) ? p.value : []}
                                onChange={(v) => p.onChange(v)}
                                placeholder="Seleccionar roles"
                                options={roleOptions}
                                error={p.error}
                            />
                        )}
                    />
                    <FormField
                        control={createUserForm.control}
                        name="is_active"
                        render={(p) => {
                            const active = p.value !== false;
                            return (
                                <Panel style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                                    <div>
                                        <div style={{ fontSize: 14, fontWeight: 700, color: tokens.textPrimary }}>Estado</div>
                                        <div style={{ fontSize: 13, color: tokens.textSecondary, marginTop: 2 }}>Define si el usuario puede iniciar sesión.</div>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                        <span style={{ fontSize: 14, fontWeight: 600, color: active ? tokens.primary : tokens.textSecondary }}>{active ? "Activo" : "Inactivo"}</span>
                                        <Switch checked={active} onChange={(checked) => p.onChange(checked)} />
                                    </div>
                                </Panel>
                            );
                        }}
                    />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                        <FormField control={createUserForm.control} name="password" render={(p) => <FloatingCaptionPassword {...p} value={String(p.value ?? "")} label="Contraseña" requiredMark />} />
                        <FormField control={createUserForm.control} name="confirmPassword" render={(p) => <FloatingCaptionPassword {...p} value={String(p.value ?? "")} label="Confirmar contraseña" requiredMark />} />
                    </div>

                    {/* Branch selector hidden for full-access roles */}
                    {!hasFullBranchAccess(watchedCreateRoles ?? []) ? (
                        <FormField
                            control={createUserForm.control}
                            name="branch_ids"
                            render={(p) => (
                                <FloatingCaptionMultiSelect
                                    label="Sucursales asignadas"
                                    value={Array.isArray(p.value) ? p.value : []}
                                    onChange={(v) => p.onChange(v)}
                                    placeholder="Seleccione sucursales"
                                    options={branchOptions}
                                    error={p.error}
                                />
                            )}
                        />
                    ) : (
                        <Panel style={{ color: tokens.textSecondary, fontSize: 13 }}>
                            Este rol tiene acceso a <strong>todas las sucursales</strong> automáticamente.
                        </Panel>
                    )}

                    {createError && <ErrorText>{createError}</ErrorText>}

                    <ModalFormFooter
                        onCancel={() => { setCreateModalVisible(false); createUserForm.reset(); setCreateError(null); }}
                        submitLabel="Crear"
                        loading={createUserForm.formState.isSubmitting}
                    />
                </form>
            </CelumaModal>

            {/* ── Edit User Modal ── */}
            <CelumaModal
                title="Editar Usuario"
                open={editModalVisible}
                onCancel={() => { setEditModalVisible(false); editUserForm.reset(); setEditingUser(null); setEditError(null); }}
                footer={null}
                width={600}
                destroyOnHidden
            >
                <form onSubmit={handleEdit} noValidate style={{ display: "grid", gap: 18 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                        <FormField control={editUserForm.control} name="email" render={(p) => <FloatingCaptionInput {...p} value={String(p.value ?? "")} label="Email" requiredMark />} />
                        <FormField control={editUserForm.control} name="username" render={(p) => <FloatingCaptionInput {...p} value={String(p.value ?? "")} label="Usuario" />} />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                        <FormField control={editUserForm.control} name="first_name" render={(p) => <FloatingCaptionInput {...p} value={String(p.value ?? "")} label="Nombre" requiredMark />} />
                        <FormField control={editUserForm.control} name="last_name" render={(p) => <FloatingCaptionInput {...p} value={String(p.value ?? "")} label="Apellido" requiredMark />} />
                    </div>
                    <FormField
                        control={editUserForm.control}
                        name="roles"
                        render={(p) => (
                            <FloatingCaptionMultiSelect
                                label="Roles"
                                requiredMark
                                value={Array.isArray(p.value) ? p.value : []}
                                onChange={(v) => p.onChange(v)}
                                placeholder="Seleccionar roles"
                                options={roleOptions}
                                error={p.error}
                            />
                        )}
                    />
                    <FormField
                        control={editUserForm.control}
                        name="is_active"
                        render={(p) => {
                            const active = p.value !== false;
                            return (
                                <Panel style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                                    <div>
                                        <div style={{ fontSize: 14, fontWeight: 700, color: tokens.textPrimary }}>Estado</div>
                                        <div style={{ fontSize: 13, color: tokens.textSecondary, marginTop: 2 }}>Define si el usuario puede iniciar sesión.</div>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                        <span style={{ fontSize: 14, fontWeight: 600, color: active ? tokens.primary : tokens.textSecondary }}>{active ? "Activo" : "Inactivo"}</span>
                                        <Switch checked={active} onChange={(checked) => p.onChange(checked)} />
                                    </div>
                                </Panel>
                            );
                        }}
                    />
                    <FormField control={editUserForm.control} name="password" render={(p) => <FloatingCaptionPassword {...p} value={String(p.value ?? "")} label="Nueva contraseña (opcional)" />} />

                    {hasFullBranchAccess(watchedEditRoles ?? []) ? (
                        <Panel style={{ color: tokens.textSecondary, fontSize: 13 }}>
                            Este rol tiene acceso a <strong>todas las sucursales</strong> automáticamente.
                        </Panel>
                    ) : (
                        <FormField
                            control={editUserForm.control}
                            name="branch_ids"
                            render={(p) => (
                                <FloatingCaptionMultiSelect
                                    label="Sucursales asignadas"
                                    value={Array.isArray(p.value) ? p.value : []}
                                    onChange={(v) => p.onChange(v)}
                                    placeholder="Seleccione sucursales"
                                    options={branchOptions}
                                    error={p.error}
                                />
                            )}
                        />
                    )}

                    {editError && <ErrorText>{editError}</ErrorText>}

                    <ModalFormFooter
                        onCancel={() => { setEditModalVisible(false); editUserForm.reset(); setEditingUser(null); setEditError(null); }}
                        submitLabel="Guardar cambios"
                        loading={editUserForm.formState.isSubmitting}
                    />
                </form>
            </CelumaModal>

            {/* ── Invite User Modal ── */}
            <CelumaModal
                title="Enviar Invitación"
                open={inviteModalVisible}
                onCancel={() => { setInviteModalVisible(false); inviteUserForm.reset(); setInviteError(null); }}
                footer={null}
                width={520}
                destroyOnHidden
            >
                <form onSubmit={handleInvite} noValidate style={{ display: "grid", gap: 18 }}>
                    <FormField control={inviteUserForm.control} name="email" render={(p) => <FloatingCaptionInput {...p} value={String(p.value ?? "")} label="Email" requiredMark />} />
                    <FormField control={inviteUserForm.control} name="full_name" render={(p) => <FloatingCaptionInput {...p} value={String(p.value ?? "")} label="Nombre completo" requiredMark />} />
                    <FormField
                        control={inviteUserForm.control}
                        name="role"
                        render={(p) => (
                            <FloatingCaptionSelect
                                label="Rol"
                                requiredMark
                                value={typeof p.value === "string" ? p.value : undefined}
                                onChange={(v) => p.onChange(v ?? "")}
                                placeholder="Seleccionar rol"
                                options={roleOptions}
                                showSearch
                                error={p.error}
                            />
                        )}
                    />

                    {inviteError && <ErrorText>{inviteError}</ErrorText>}

                    <ModalFormFooter
                        onCancel={() => { setInviteModalVisible(false); inviteUserForm.reset(); setInviteError(null); }}
                        submitLabel="Enviar invitación"
                        loading={inviteUserForm.formState.isSubmitting}
                    />
                </form>
            </CelumaModal>
        </div>
    );

    if (embedded) {
        return content;
    }

    return (
        <Layout style={{ minHeight: "100vh" }}>
            <SidebarCeluma
                selectedKey={"/config" as import("../components/ui/sidebar_menu").CelumaKey}
                onNavigate={(k) => navigate(k)}
                logoSrc={logo}
            />
            <Layout.Content style={{ padding: tokens.contentPadding, background: tokens.bg, fontFamily: tokens.textFont }}>
                <div style={{ maxWidth: tokens.maxWidth, margin: "0 auto" }}>
                    {content}
                </div>
            </Layout.Content>
        </Layout>
    );
}

export default UsersManagement;
