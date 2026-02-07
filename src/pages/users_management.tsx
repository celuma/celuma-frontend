import { useEffect, useState } from "react";
import { Layout, Card, Table, Button, Form, Input, Select, Modal, message, Space, Popconfirm, Switch, Spin, Avatar } from "antd";
import { PlusOutlined, DeleteOutlined, MailOutlined, EditOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import SidebarCeluma from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import { tokens, cardStyle, cardTitleStyle } from "../components/design/tokens";
import type { ColumnsType } from "antd/es/table";
import { useUserProfile } from "../hooks/use_user_profile";
import { usePageTitle } from "../hooks/use_page_title";

// Generate initials from full name (first letter of first name + first letter of last name)
const getInitials = (fullName?: string | null): string => {
    if (!fullName) return "U";
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) {
        return parts[0][0]?.toUpperCase() || "U";
    }
    const firstInitial = parts[0][0]?.toUpperCase() || "";
    const lastInitial = parts[parts.length - 1][0]?.toUpperCase() || "";
    return firstInitial + lastInitial;
};

// Generate a consistent color based on name
const getAvatarColor = (name: string): string => {
    const colors = [
        "#0f8b8d", "#3b82f6", "#8b5cf6", "#ec4899", 
        "#f59e0b", "#10b981", "#ef4444", "#6366f1"
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
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
    if (!res.ok) throw new Error(await res.text());
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
    role: string;
    is_active: boolean;
    branch_ids: string[];
    avatar_url?: string;
}

interface Branch {
    id: string;
    name: string;
    code: string;
}

function UsersManagement() {
    usePageTitle();
    const navigate = useNavigate();
    const { profile, loading: profileLoading, isAdmin } = useUserProfile();
    const [loading, setLoading] = useState(false);
    const [users, setUsers] = useState<User[]>([]);
    const [branches, setBranches] = useState<Branch[]>([]);
    
    // Modals state
    const [createModalVisible, setCreateModalVisible] = useState(false);
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [inviteModalVisible, setInviteModalVisible] = useState(false);
    
    // Forms
    const [createForm] = Form.useForm();
    const [editForm] = Form.useForm();
    const [inviteForm] = Form.useForm();
    
    const [editingUser, setEditingUser] = useState<User | null>(null);

    useEffect(() => {
        if (!profileLoading) {
            if (!isAdmin) {
                message.error("Acceso denegado: Solo administradores");
                navigate("/home");
                return;
            }
            loadData();
        }
    }, [profileLoading, isAdmin, navigate]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [usersData, branchesData] = await Promise.all([
                getJSON<{ users: User[] }>("/v1/users/"),
                getJSON<Branch[]>("/v1/branches/")
            ]);
            setUsers(usersData.users);
            setBranches(branchesData);
        } catch {
            message.error("Error al cargar datos");
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (values: Record<string, unknown>) => {
        try {
            await postJSON("/v1/users/", values);
            message.success("Usuario creado");
            setCreateModalVisible(false);
            createForm.resetFields();
            await loadData();
        } catch {
            message.error("Error al crear usuario");
        }
    };

    const handleEdit = async (values: Record<string, unknown>) => {
        if (!editingUser) return;
        try {
            await putJSON(`/v1/users/${editingUser.id}`, values);
            message.success("Usuario actualizado");
            setEditModalVisible(false);
            editForm.resetFields();
            setEditingUser(null);
            await loadData();
        } catch {
            message.error("Error al actualizar usuario");
        }
    };

    const openEditModal = (user: User) => {
        setEditingUser(user);
        editForm.setFieldsValue({
            email: user.email,
            username: user.username,
            full_name: user.full_name,
            role: user.role,
            is_active: user.is_active,
            branch_ids: user.branch_ids
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
            message.success(`Usuario ${currentStatus ? 'desactivado' : 'activado'}`);
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
                            backgroundColor: record.avatar_url ? "transparent" : getAvatarColor(name || "Usuario"),
                            fontWeight: 600,
                            fontSize: 13,
                        }}
                    >
                        {getInitials(name)}
                    </Avatar>
                    <span style={{ fontWeight: 500 }}>{name}</span>
                </Space>
            )
        },
        { title: "Email", dataIndex: "email", key: "email" },
        { title: "Usuario", dataIndex: "username", key: "username", render: (text) => text || "—" },
        { 
            title: "Rol", 
            dataIndex: "role", 
            key: "role",
            filters: [
                { text: "Administrador", value: "admin" },
                { text: "Patólogo", value: "pathologist" },
                { text: "Técnico", value: "lab_tech" },
                { text: "Facturación", value: "billing" },
                { text: "Asistente", value: "assistant" },
                { text: "Visor", value: "viewer" },
            ],
            onFilter: (value, record) => record.role === value,
            render: (role) => {
                const roleConfig: Record<string, { color: string; bg: string; label: string }> = {
                    admin: { color: "#8b5cf6", bg: "#f5f3ff", label: "Admin" },
                    pathologist: { color: "#3b82f6", bg: "#eff6ff", label: "Patólogo" },
                    lab_tech: { color: "#10b981", bg: "#ecfdf5", label: "Técnico" },
                    billing: { color: "#f59e0b", bg: "#fffbeb", label: "Facturación" },
                    assistant: { color: "#06b6d4", bg: "#ecfeff", label: "Asistente" },
                    viewer: { color: "#6b7280", bg: "#f3f4f6", label: "Visor" }
                };
                const config = roleConfig[role] || { color: "#6b7280", bg: "#f3f4f6", label: role };
                return (
                    <div style={{
                        backgroundColor: config.bg,
                        color: config.color,
                        borderRadius: 12,
                        fontSize: 11,
                        fontWeight: 500,
                        padding: "4px 10px",
                        display: "inline-block",
                    }}>
                        {config.label}
                    </div>
                );
            }
        },
        {
            title: "Sucursales",
            dataIndex: "branch_ids",
            key: "branches",
            render: (ids: string[], record) => {
                if (record.role === 'admin') {
                    return (
                        <div style={{
                            backgroundColor: "#fffbeb",
                            color: "#f59e0b",
                            borderRadius: 12,
                            fontSize: 11,
                            fontWeight: 500,
                            padding: "4px 10px",
                            display: "inline-block",
                        }}>
                            Todas (Admin)
                        </div>
                    );
                }
                if (!ids || ids.length === 0) {
                    return <span style={{ color: "#888", fontSize: 12 }}>—</span>;
                }
                
                // Show count if many, or names if few
                const branchNames = ids.map(id => branches.find(b => b.id === id)?.name || id);
                if (branchNames.length > 2) {
                    return (
                        <div 
                            style={{
                                backgroundColor: "#eff6ff",
                                color: "#3b82f6",
                                borderRadius: 12,
                                fontSize: 11,
                                fontWeight: 500,
                                padding: "4px 10px",
                                display: "inline-block",
                            }}
                            title={branchNames.join(', ')}
                        >
                            {branchNames.length} Sucursales
                        </div>
                    );
                }
                return (
                    <Space size={4} wrap>
                        {branchNames.map((name, i) => (
                            <div 
                                key={i}
                                style={{
                                    backgroundColor: "#eff6ff",
                                    color: "#3b82f6",
                                    borderRadius: 12,
                                    fontSize: 11,
                                    fontWeight: 500,
                                    padding: "4px 10px",
                                    display: "inline-block",
                                }}
                            >
                                {name}
                            </div>
                        ))}
                    </Space>
                );
            }
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
            }
        },
        {
            title: "Acciones",
            key: "actions",
            width: 120,
            render: (_, record) => {
                const isSelf = record.id === profile?.id;
                if (isSelf) {
                    return (
                        <div style={{
                            backgroundColor: "#f5f3ff",
                            color: "#8b5cf6",
                            borderRadius: 12,
                            fontSize: 11,
                            fontWeight: 500,
                            padding: "4px 10px",
                            display: "inline-block",
                        }}>
                            Tú
                        </div>
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
        return (
            <Layout style={{ minHeight: "100vh", justifyContent: "center", alignItems: "center" }}>
                <Spin size="large" />
            </Layout>
        );
    }

    return (
        <Layout style={{ minHeight: "100vh" }}>
            <SidebarCeluma selectedKey="/users" onNavigate={(k) => navigate(k)} logoSrc={logo} />
            <Layout.Content style={{ padding: tokens.contentPadding, background: tokens.bg, fontFamily: tokens.textFont }}>
                <div style={{ maxWidth: tokens.maxWidth, margin: "0 auto" }}>
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

                    {/* Create User Modal */}
                    <Modal
                        title="Crear Usuario"
                        open={createModalVisible}
                        onCancel={() => {
                            setCreateModalVisible(false);
                            createForm.resetFields();
                        }}
                        footer={null}
                        width={600}
                    >
                        <Form form={createForm} layout="vertical" onFinish={handleCreate}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                                <Form.Item name="email" label="Email" rules={[{ required: true, type: "email" }]}>
                                    <Input />
                                </Form.Item>
                                <Form.Item name="username" label="Usuario (opcional)">
                                    <Input />
                                </Form.Item>
                            </div>
                            <Form.Item name="full_name" label="Nombre Completo" rules={[{ required: true }]}>
                                <Input />
                            </Form.Item>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                                <Form.Item name="role" label="Rol" rules={[{ required: true }]}>
                                    <Select>
                                        <Select.Option value="admin">Administrador</Select.Option>
                                        <Select.Option value="pathologist">Patólogo</Select.Option>
                                        <Select.Option value="lab_tech">Técnico de Laboratorio</Select.Option>
                                        <Select.Option value="billing">Facturación</Select.Option>
                                        <Select.Option value="assistant">Asistente</Select.Option>
                                        <Select.Option value="viewer">Visor</Select.Option>
                                    </Select>
                                </Form.Item>
                                <Form.Item name="password" label="Contraseña" rules={[{ required: true, min: 8 }]}>
                                    <Input.Password />
                                </Form.Item>
                            </div>
                            
                            <Form.Item 
                                noStyle 
                                shouldUpdate={(prev, current) => prev.role !== current.role}
                            >
                                {({ getFieldValue }) => {
                                    const role = getFieldValue('role');
                                    return role !== 'admin' ? (
                                        <Form.Item name="branch_ids" label="Sucursales asignadas">
                                            <Select mode="multiple" placeholder="Seleccione sucursales" allowClear>
                                                {branches.map(b => (
                                                    <Select.Option key={b.id} value={b.id}>
                                                        {b.name} ({b.code})
                                                    </Select.Option>
                                                ))}
                                            </Select>
                                        </Form.Item>
                                    ) : (
                                        <div style={{ marginBottom: 24, color: '#888', fontStyle: 'italic' }}>
                                            * Los administradores tienen acceso a todas las sucursales automáticamente.
                                        </div>
                                    );
                                }}
                            </Form.Item>

                            <Form.Item style={{ marginBottom: 0, textAlign: "right" }}>
                                <Space>
                                    <Button onClick={() => setCreateModalVisible(false)}>Cancelar</Button>
                                    <Button type="primary" htmlType="submit">Crear</Button>
                                </Space>
                            </Form.Item>
                        </Form>
                    </Modal>

                    {/* Edit User Modal */}
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
                                <Form.Item name="role" label="Rol" rules={[{ required: true }]}>
                                    <Select>
                                        <Select.Option value="admin">Administrador</Select.Option>
                                        <Select.Option value="pathologist">Patólogo</Select.Option>
                                        <Select.Option value="lab_tech">Técnico de Laboratorio</Select.Option>
                                        <Select.Option value="billing">Facturación</Select.Option>
                                        <Select.Option value="assistant">Asistente</Select.Option>
                                        <Select.Option value="viewer">Visor</Select.Option>
                                    </Select>
                                </Form.Item>
                                <Form.Item name="is_active" label="Estado" valuePropName="checked">
                                    <Switch checkedChildren="Activo" unCheckedChildren="Inactivo" />
                                </Form.Item>
                            </div>

                            <Form.Item name="password" label="Nueva Contraseña (opcional)" help="Dejar en blanco para mantener la actual">
                                <Input.Password placeholder="Nueva contraseña" />
                            </Form.Item>

                            <Form.Item 
                                noStyle 
                                shouldUpdate={(prev, current) => prev.role !== current.role}
                            >
                                {({ getFieldValue }) => {
                                    const role = getFieldValue('role');
                                    return role !== 'admin' ? (
                                        <Form.Item name="branch_ids" label="Sucursales asignadas">
                                            <Select mode="multiple" placeholder="Seleccione sucursales" allowClear>
                                                {branches.map(b => (
                                                    <Select.Option key={b.id} value={b.id}>
                                                        {b.name} ({b.code})
                                                    </Select.Option>
                                                ))}
                                            </Select>
                                        </Form.Item>
                                    ) : (
                                        <div style={{ marginBottom: 24, color: '#888', fontStyle: 'italic' }}>
                                            * Los administradores tienen acceso a todas las sucursales automáticamente.
                                        </div>
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

                    {/* Invite User Modal */}
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
                                <Select placeholder="Seleccionar rol">
                                    <Select.Option value="admin">Administrador</Select.Option>
                                    <Select.Option value="pathologist">Patólogo</Select.Option>
                                    <Select.Option value="lab_tech">Técnico de Laboratorio</Select.Option>
                                    <Select.Option value="billing">Facturación</Select.Option>
                                    <Select.Option value="assistant">Asistente</Select.Option>
                                    <Select.Option value="viewer">Visor</Select.Option>
                                </Select>
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
            </Layout.Content>
        </Layout>
    );
}

export default UsersManagement;
