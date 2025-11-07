import { useEffect, useState } from "react";
import { Layout, Card, Table, Button, Form, Input, Select, Modal, message, Tag, Space, Popconfirm, Switch } from "antd";
import { PlusOutlined, DeleteOutlined, MailOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import SidebarCeluma from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import { tokens } from "../components/design/tokens";
import type { ColumnsType } from "antd/es/table";

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
}

function UsersManagement() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [users, setUsers] = useState<User[]>([]);
    const [createModalVisible, setCreateModalVisible] = useState(false);
    const [inviteModalVisible, setInviteModalVisible] = useState(false);
    const [form] = Form.useForm();
    const [inviteForm] = Form.useForm();

    useEffect(() => {
        loadUsers();
    }, []);

    const loadUsers = async () => {
        setLoading(true);
        try {
            const data = await getJSON<{ users: User[] }>("/v1/users/");
            setUsers(data.users);
        } catch {
            message.error("Error al cargar usuarios");
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (values: Partial<User> & { password: string }) => {
        try {
            await postJSON("/v1/users/", values);
            message.success("Usuario creado");
            setCreateModalVisible(false);
            form.resetFields();
            await loadUsers();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "Error al crear usuario");
        }
    };

    const handleInvite = async (values: { email: string; full_name: string; role: string }) => {
        try {
            await postJSON("/v1/users/invitations", values);
            message.success("Invitación enviada por email");
            setInviteModalVisible(false);
            inviteForm.resetFields();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "Error al enviar invitación");
        }
    };

    const handleToggleActive = async (userId: string, currentStatus: boolean) => {
        try {
            await postJSON(`/v1/users/${userId}/toggle-active`, {});
            message.success(`Usuario ${currentStatus ? 'desactivado' : 'activado'}`);
            await loadUsers();
        } catch {
            message.error("Error al cambiar estado");
        }
    };

    const handleDelete = async (userId: string) => {
        try {
            await deleteJSON(`/v1/users/${userId}`);
            message.success("Usuario desactivado");
            await loadUsers();
        } catch {
            message.error("Error al desactivar usuario");
        }
    };

    const columns: ColumnsType<User> = [
        { title: "Nombre", dataIndex: "full_name", key: "full_name" },
        { title: "Email", dataIndex: "email", key: "email" },
        { title: "Usuario", dataIndex: "username", key: "username", render: (text) => text || "—" },
        { 
            title: "Rol", 
            dataIndex: "role", 
            key: "role",
            render: (role) => {
                const colors: Record<string, string> = {
                    admin: "purple",
                    pathologist: "blue",
                    lab_tech: "green",
                    billing: "orange",
                };
                return <Tag color={colors[role] || "default"}>{role}</Tag>;
            }
        },
        { 
            title: "Estado", 
            dataIndex: "is_active", 
            key: "is_active",
            render: (active, record) => (
                <Switch
                    checked={active}
                    onChange={() => handleToggleActive(record.id, active)}
                    checkedChildren="Activo"
                    unCheckedChildren="Inactivo"
                />
            )
        },
        {
            title: "Acciones",
            key: "actions",
            render: (_, record) => (
                <Space>
                    <Popconfirm
                        title="¿Desactivar este usuario?"
                        onConfirm={() => handleDelete(record.id)}
                        okText="Sí"
                        cancelText="No"
                    >
                        <Button type="text" danger icon={<DeleteOutlined />} size="small" />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <Layout style={{ minHeight: "100vh" }}>
            <SidebarCeluma selectedKey="/home" onNavigate={(k) => navigate(k)} logoSrc={logo} />
            <Layout.Content style={{ padding: 24, background: tokens.bg }}>
                <div style={{ maxWidth: 1400, margin: "0 auto" }}>
                    <Card
                        title={<span style={{ fontFamily: tokens.titleFont, fontSize: 24, fontWeight: 800 }}>Gestión de Usuarios</span>}
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
                        style={{ borderRadius: tokens.radius, boxShadow: tokens.shadow }}
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
                            form.resetFields();
                        }}
                        footer={null}
                    >
                        <Form form={form} layout="vertical" onFinish={handleCreate}>
                            <Form.Item name="email" label="Email" rules={[{ required: true, type: "email" }]}>
                                <Input />
                            </Form.Item>
                            <Form.Item name="username" label="Usuario (opcional)">
                                <Input />
                            </Form.Item>
                            <Form.Item name="full_name" label="Nombre Completo" rules={[{ required: true }]}>
                                <Input />
                            </Form.Item>
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
                            <Form.Item style={{ marginBottom: 0, textAlign: "right" }}>
                                <Space>
                                    <Button onClick={() => setCreateModalVisible(false)}>Cancelar</Button>
                                    <Button type="primary" htmlType="submit">Crear</Button>
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

