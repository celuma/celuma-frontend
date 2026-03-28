import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
    Layout, Card, Table, Button, Form, Input, Select, Modal, message,
    Space, Popconfirm, Switch, Spin, Avatar, Tag,
} from "antd";
import { PlusOutlined, DeleteOutlined, MailOutlined, EditOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import FormField from "../components/ui/form_field";
import FloatingCaptionInput from "../components/ui/floating_caption_input";
import FloatingCaptionPassword from "../components/ui/floating_caption_password";
import CelumaButton from "../components/ui/button";
import ErrorText from "../components/ui/error_text";
import SidebarCeluma from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import { tokens, cardStyle, cardTitleStyle } from "../components/design/tokens";
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
    const colors = ["#0f8b8d", "#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#ef4444", "#6366f1"];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
};

const createUserSchema = z.object({
    email: z.string().nonempty("El email es obligatorio.").email("Email inválido."),
    username: z.string().optional(),
    first_name: z.string().nonempty("El nombre es obligatorio."),
    last_name: z.string().nonempty("El apellido es obligatorio."),
    role: z.string().nonempty("El rol es obligatorio."),
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
            email: "",
            username: "",
            first_name: "",
            last_name: "",
            role: "",
            password: "",
            confirmPassword: "",
            branch_ids: [],
        },
        mode: "onTouched",
    });
    const [createError, setCreateError] = useState<string | null>(null);
    const watchedRole = createUserForm.watch("role");

    const [editForm] = Form.useForm();
    const [inviteForm] = Form.useForm();
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
            const { confirmPassword, ...rest } = data;
            void confirmPassword;
            await postJSON("/v1/users/", {
                ...rest,
                branch_ids: rest.branch_ids ?? [],
            });
            message.success("Usuario creado");
            setCreateModalVisible(false);
            createUserForm.reset();
            await loadData();
        } catch (e) {
            setCreateError(e instanceof Error ? e.message : "Error al crear usuario");
        }
    });

    const handleEdit = async (values: Record<string, unknown>) => {
        if (!editingUser) return;
        try {
            // Profile fields — never include role here; roles are managed via the RBAC endpoint
            await putJSON(`/v1/users/${editingUser.id}`, {
                email: values.email,
                username: values.username || null,
                full_name: values.full_name,
                is_active: values.is_active,
                password: values.password || undefined,
                branch_ids: values.branch_ids,
            });

            // Separate RBAC call only when the role selection has actually changed
            const newRoles = (values.roles as string[]) ?? [];
            const rolesChanged =
                newRoles.length !== editingUser.roles.length ||
                newRoles.some((r) => !editingUser.roles.includes(r));

            if (rolesChanged) {
                await putJSON(`/v1/rbac/users/${editingUser.id}/roles`, { roles: newRoles });
            }

            message.success("Usuario actualizado");
            setEditModalVisible(false);
            editForm.resetFields();
            setEditingUser(null);
            await loadData();
        } catch (e) {
            message.error(e instanceof Error ? e.message : "Error al actualizar usuario");
        }
    };

    const openEditModal = (user: User) => {
        setEditingUser(user);
        editForm.setFieldsValue({
            email: user.email,
            username: user.username,
            full_name: user.full_name,
            roles: user.roles,
            is_active: user.is_active,
            branch_ids: user.branch_ids,
        });
        setEditModalVisible(true);
    };

    const handleInvite = async (values: Record<string, unknown>) => {
        try {
            await postJSON("/v1/users/invitations", values);
            message.success("Invitación enviada por email");
            setInviteModalVisible(false);
            inviteForm.resetFields();
        } catch {
            message.error("Error al enviar invitación");
        }
    };

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
            title: "Rol(es)",
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
                        <Tag color="gold">Todas</Tag>
                    );
                }
                if (!ids || ids.length === 0) {
                    return <span style={{ color: "#888", fontSize: 12 }}>—</span>;
                }
                const branchNames = ids.map((id) => branches.find((b) => b.id === id)?.name || id);
                if (branchNames.length > 2) {
                    return (
                        <Tag color="blue">{branchNames.length} sucursales</Tag>
                    );
                }
                return (
                    <Space size={4} wrap>
                        {branchNames.map((name, i) => (
                            <Tag key={i}>{name}</Tag>
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
                        <Tag color="purple">Tú</Tag>
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

    // Common role options for create/invite modals
    const roleSelectOptions = availableRoles.map((r) => (
        <Select.Option key={r.code} value={r.code}>{r.name}</Select.Option>
    ));

    const content = (
        <div>
            <Card
                title={<span style={cardTitleStyle}>Gestión de Usuarios</span>}
                extra={
                    <Space>
                        <Button icon={<MailOutlined />} onClick={() => setInviteModalVisible(true)}>
                            Enviar Invitación
                        </Button>
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalVisible(true)}>
                            Crear Usuario
                        </Button>
                    </Space>
                }
                style={cardStyle}
            >
                <Table
                    columns={columns}
                    dataSource={users}
                    loading={loading}
                    rowKey="id"
                    pagination={{ pageSize: 10 }}
                />
            </Card>

            {/* ── Create User Modal ── */}
            <Modal
                title="Crear Usuario"
                open={createModalVisible}
                onCancel={() => {
                    setCreateModalVisible(false);
                    createUserForm.reset();
                    setCreateError(null);
                }}
                footer={null}
                width={600}
            >
                <form onSubmit={handleCreate} noValidate style={{ display: "grid", gap: 16, paddingTop: 8 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                        <FormField
                            control={createUserForm.control}
                            name="first_name"
                            render={(p) => (
                                <FloatingCaptionInput {...p} value={String(p.value ?? "")} label="Nombre(s)" />
                            )}
                        />
                        <FormField
                            control={createUserForm.control}
                            name="last_name"
                            render={(p) => (
                                <FloatingCaptionInput {...p} value={String(p.value ?? "")} label="Apellidos" />
                            )}
                        />
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                        <FormField
                            control={createUserForm.control}
                            name="email"
                            render={(p) => (
                                <FloatingCaptionInput {...p} value={String(p.value ?? "")} label="Email" />
                            )}
                        />
                        <FormField
                            control={createUserForm.control}
                            name="username"
                            render={(p) => (
                                <FloatingCaptionInput {...p} value={String(p.value ?? "")} label="Usuario (opcional)" />
                            )}
                        />
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                        <div style={{ display: "grid", gap: 6 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: "#0f8b8d" }}>
                                Rol <span style={{ color: "#b91c1c" }}>*</span>
                            </span>
                            <Controller
                                control={createUserForm.control}
                                name="role"
                                render={({ field, fieldState }) => (
                                    <>
                                        <Select
                                            value={field.value || undefined}
                                            onChange={field.onChange}
                                            onBlur={field.onBlur}
                                            placeholder="Seleccionar rol"
                                            status={fieldState.error ? "error" : undefined}
                                            style={{ width: "100%", height: 44 }}
                                        >
                                            {roleSelectOptions}
                                        </Select>
                                        {fieldState.error && (
                                            <ErrorText>{fieldState.error.message}</ErrorText>
                                        )}
                                    </>
                                )}
                            />
                        </div>
                        <FormField
                            control={createUserForm.control}
                            name="password"
                            render={(p) => (
                                <FloatingCaptionPassword {...p} value={String(p.value ?? "")} label="Contraseña" />
                            )}
                        />
                    </div>

                    <FormField
                        control={createUserForm.control}
                        name="confirmPassword"
                        render={(p) => (
                            <FloatingCaptionPassword {...p} value={String(p.value ?? "")} label="Confirmar contraseña" />
                        )}
                    />

                    {/* Branch selector hidden for full-access roles */}
                    {watchedRole !== "admin" && watchedRole !== "superuser" ? (
                        <div style={{ display: "grid", gap: 6 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: "#0f8b8d" }}>
                                Sucursales asignadas
                            </span>
                            <Controller
                                control={createUserForm.control}
                                name="branch_ids"
                                render={({ field }) => (
                                    <Select
                                        mode="multiple"
                                        value={field.value ?? []}
                                        onChange={field.onChange}
                                        onBlur={field.onBlur}
                                        placeholder="Seleccione sucursales"
                                        allowClear
                                        style={{ width: "100%" }}
                                    >
                                        {branches.map((b) => (
                                            <Select.Option key={b.id} value={b.id}>
                                                {b.name} ({b.code})
                                            </Select.Option>
                                        ))}
                                    </Select>
                                )}
                            />
                        </div>
                    ) : (
                        <div style={{ color: "#888", fontStyle: "italic", fontSize: 13 }}>
                            * Este rol tiene acceso a todas las sucursales automáticamente.
                        </div>
                    )}

                    {createError && <ErrorText>{createError}</ErrorText>}

                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
                        <Button
                            onClick={() => {
                                setCreateModalVisible(false);
                                createUserForm.reset();
                                setCreateError(null);
                            }}
                        >
                            Cancelar
                        </Button>
                        <CelumaButton
                            type="primary"
                            htmlType="submit"
                            loading={createUserForm.formState.isSubmitting}
                            style={{ margin: 0 }}
                        >
                            Crear
                        </CelumaButton>
                    </div>
                </form>
            </Modal>

            {/* ── Edit User Modal ── */}
            <Modal
                title="Editar Usuario"
                open={editModalVisible}
                onCancel={() => {
                    setEditModalVisible(false);
                    editForm.resetFields();
                    setEditingUser(null);
                }}
                footer={null}
                width={600}
            >
                <Form form={editForm} layout="vertical" onFinish={handleEdit}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                        <Form.Item name="email" label="Email" rules={[{ required: true, type: "email" }]}>
                            <Input />
                        </Form.Item>
                        <Form.Item name="username" label="Usuario">
                            <Input />
                        </Form.Item>
                    </div>
                    <Form.Item name="full_name" label="Nombre Completo" rules={[{ required: true }]}>
                        <Input />
                    </Form.Item>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                        <Form.Item name="roles" label="Rol(es)" rules={[{ required: true, message: "Asigna al menos un rol" }]}>
                            <Select
                                mode="multiple"
                                placeholder="Seleccionar roles"
                                options={availableRoles.map((r) => ({ value: r.code, label: r.name }))}
                            />
                        </Form.Item>
                        <Form.Item name="is_active" label="Estado" valuePropName="checked">
                            <Switch checkedChildren="Activo" unCheckedChildren="Inactivo" />
                        </Form.Item>
                    </div>

                    <Form.Item
                        name="password"
                        label="Nueva Contraseña (opcional)"
                        help="Dejar en blanco para mantener la actual"
                    >
                        <Input.Password placeholder="Nueva contraseña" />
                    </Form.Item>

                    <Form.Item noStyle shouldUpdate={(prev, curr) => prev.roles !== curr.roles}>
                        {({ getFieldValue }) => {
                            const selectedRoles: string[] = getFieldValue("roles") ?? editingUser?.roles ?? [];
                            const fullAccess = hasFullBranchAccess(selectedRoles);
                            return fullAccess ? (
                                <div style={{ marginBottom: 24, color: "#888", fontStyle: "italic" }}>
                                    * Este rol tiene acceso a todas las sucursales automáticamente.
                                </div>
                            ) : (
                                <Form.Item name="branch_ids" label="Sucursales asignadas">
                                    <Select mode="multiple" placeholder="Seleccione sucursales" allowClear>
                                        {branches.map((b) => (
                                            <Select.Option key={b.id} value={b.id}>
                                                {b.name} ({b.code})
                                            </Select.Option>
                                        ))}
                                    </Select>
                                </Form.Item>
                            );
                        }}
                    </Form.Item>

                    <Form.Item style={{ marginBottom: 0, textAlign: "right" }}>
                        <Space>
                            <Button onClick={() => setEditModalVisible(false)}>Cancelar</Button>
                            <Button type="primary" htmlType="submit">Guardar Cambios</Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>

            {/* ── Invite User Modal ── */}
            <Modal
                title="Enviar Invitación"
                open={inviteModalVisible}
                onCancel={() => {
                    setInviteModalVisible(false);
                    inviteForm.resetFields();
                }}
                footer={null}
            >
                <Form form={inviteForm} layout="vertical" onFinish={handleInvite}>
                    <Form.Item name="email" label="Email" rules={[{ required: true, type: "email" }]}>
                        <Input placeholder="correo@ejemplo.com" />
                    </Form.Item>
                    <Form.Item name="full_name" label="Nombre Completo" rules={[{ required: true }]}>
                        <Input placeholder="Juan Pérez" />
                    </Form.Item>
                    <Form.Item name="role" label="Rol" rules={[{ required: true }]}>
                        <Select placeholder="Seleccionar rol">{roleSelectOptions}</Select>
                    </Form.Item>
                    <Form.Item style={{ marginBottom: 0, textAlign: "right" }}>
                        <Space>
                            <Button onClick={() => setInviteModalVisible(false)}>Cancelar</Button>
                            <Button type="primary" htmlType="submit">Enviar Invitación</Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>
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
