import { useEffect, useState } from "react";
import { Layout, Card, Table, Button, Form, Input, Modal, message, Space, Popconfirm, Switch, Alert } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined, FileTextOutlined } from "@ant-design/icons";
import { useNavigate, useLocation } from "react-router-dom";
import SidebarCeluma from "../components/ui/sidebar_menu";
import type { CelumaKey } from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import { tokens, cardTitleStyle, cardStyle } from "../components/design/tokens";
import type { ColumnsType } from "antd/es/table";

const { TextArea } = Input;

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
    if (!res.ok) throw new Error(`${res.status}`);
    return await res.json();
}

async function postJSON<TRes>(path: string, body: unknown): Promise<TRes> {
    const token = getAuthToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = token;
    
    const res = await fetch(`${getApiBase()}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
    });
    
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText);
    }
    return await res.json();
}

async function putJSON<TRes>(path: string, body: unknown): Promise<TRes> {
    const token = getAuthToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = token;
    
    const res = await fetch(`${getApiBase()}${path}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(body),
    });
    
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText);
    }
    return await res.json();
}

async function deleteJSON(path: string): Promise<void> {
    const token = getAuthToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = token;
    
    const res = await fetch(`${getApiBase()}${path}`, {
        method: "DELETE",
        headers,
    });
    
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText);
    }
}

interface ReportTemplate {
    id: string;
    tenant_id: string;
    name: string;
    description?: string;
    is_active: boolean;
    created_at: string;
}

interface ReportTemplatesListResponse {
    templates: ReportTemplate[];
}

function ReportTemplates() {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const [loading, setLoading] = useState(false);
    const [templates, setTemplates] = useState<ReportTemplate[]>([]);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form] = Form.useForm();

    useEffect(() => {
        loadTemplates();
    }, []);

    const loadTemplates = async () => {
        setLoading(true);
        try {
            const data = await getJSON<ReportTemplatesListResponse>("/v1/reports/templates/?active_only=false");
            setTemplates(data.templates);
        } catch {
            message.error("Error al cargar plantillas de reporte");
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = () => {
        setEditingId(null);
        form.resetFields();
        form.setFieldsValue({ is_active: true });
        setModalVisible(true);
    };

    const handleEdit = (record: ReportTemplate) => {
        setEditingId(record.id);
        form.setFieldsValue({
            name: record.name,
            description: record.description,
            is_active: record.is_active,
        });
        setModalVisible(true);
    };

    const handleSave = async (values: Partial<ReportTemplate>) => {
        try {
            // Add empty template_json for creation (required by backend)
            const payload = {
                ...values,
                template_json: editingId ? undefined : {},  // Only send empty object for creation
            };
            
            if (editingId) {
                // Update
                await putJSON(`/v1/reports/templates/${editingId}`, payload);
                message.success("Plantilla actualizada");
            } else {
                // Create
                await postJSON("/v1/reports/templates/", payload);
                message.success("Plantilla creada");
            }
            
            setModalVisible(false);
            form.resetFields();
            loadTemplates();
        } catch (err) {
            message.error("Error al guardar plantilla");
            console.error(err);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await deleteJSON(`/v1/reports/templates/${id}`);
            message.success("Plantilla eliminada");
            loadTemplates();
        } catch {
            message.error("Error al eliminar plantilla");
        }
    };

    const columns: ColumnsType<ReportTemplate> = [
        {
            title: "Nombre",
            dataIndex: "name",
            key: "name",
            render: (name: string) => <span style={{ fontWeight: 600, color: "#0f8b8d" }}>{name}</span>,
        },
        {
            title: "Descripción",
            dataIndex: "description",
            key: "description",
            ellipsis: true,
            render: (text) => text || <span style={{ color: "#888" }}>—</span>,
        },
        {
            title: "Estado",
            dataIndex: "is_active",
            key: "is_active",
            width: 100,
            filters: [
                { text: "Activo", value: true },
                { text: "Inactivo", value: false },
            ],
            onFilter: (value, record) => record.is_active === value,
            render: (is_active: boolean) => (
                <div style={{
                    backgroundColor: is_active ? "#ecfdf5" : "#fef2f2",
                    color: is_active ? "#10b981" : "#ef4444",
                    borderRadius: 12,
                    fontSize: 11,
                    fontWeight: 500,
                    padding: "4px 10px",
                    display: "inline-block",
                }}>
                    {is_active ? "Activo" : "Inactivo"}
                </div>
            ),
        },
        {
            title: "Fecha de creación",
            dataIndex: "created_at",
            key: "created_at",
            width: 150,
            render: (date: string) => {
                const d = new Date(date);
                return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
            },
        },
        {
            title: "Acciones",
            key: "actions",
            width: 120,
            render: (_, record) => (
                <Space>
                    <Button
                        type="text"
                        icon={<EditOutlined />}
                        onClick={() => handleEdit(record)}
                        size="small"
                        title="Editar"
                    />
                    <Popconfirm
                        title="¿Desactivar esta plantilla?"
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
            ),
        },
    ];

    return (
        <Layout style={{ minHeight: "100vh" }}>
            <SidebarCeluma selectedKey={(pathname as CelumaKey) ?? "/report-templates"} onNavigate={(k) => navigate(k)} logoSrc={logo} />
            <Layout.Content style={{ padding: tokens.contentPadding, background: tokens.bg }}>
                <div style={{ maxWidth: tokens.maxWidth, margin: "0 auto" }}>
                    <Card
                        title={<span style={cardTitleStyle}>Plantillas de Reporte</span>}
                        style={cardStyle}
                        extra={
                            <Button
                                type="primary"
                                icon={<PlusOutlined />}
                                onClick={handleCreate}
                            >
                                Nueva Plantilla
                            </Button>
                        }
                    >
                        <Alert
                            message="Editor de contenido en desarrollo"
                            description="Por ahora puedes crear y gestionar plantillas con nombre y descripción. El editor de contenido JSON será implementado próximamente."
                            type="info"
                            showIcon
                            icon={<FileTextOutlined />}
                            style={{ marginBottom: 16 }}
                        />
                        
                        <Table
                            columns={columns}
                            dataSource={templates}
                            rowKey="id"
                            loading={loading}
                            pagination={{ pageSize: 10 }}
                        />
                    </Card>
                </div>
            </Layout.Content>

            <Modal
                title={editingId ? "Editar Plantilla" : "Nueva Plantilla"}
                open={modalVisible}
                onCancel={() => {
                    setModalVisible(false);
                    form.resetFields();
                }}
                footer={null}
                width={600}
            >
                <Form form={form} layout="vertical" onFinish={handleSave}>
                    <Form.Item
                        name="name"
                        label="Nombre"
                        rules={[
                            { required: true, message: "El nombre es requerido" },
                            { max: 255, message: "El nombre no puede exceder 255 caracteres" },
                        ]}
                    >
                        <Input placeholder="Ej: Plantilla de Biopsia Estándar" maxLength={255} />
                    </Form.Item>

                    <Form.Item name="description" label="Descripción">
                        <TextArea
                            placeholder="Descripción opcional de la plantilla"
                            rows={4}
                            maxLength={1000}
                        />
                    </Form.Item>

                    {!editingId && (
                        <Alert
                            message="El contenido del template se configurará posteriormente"
                            description="Se creará una plantilla vacía que podrá ser editada cuando el editor esté disponible."
                            type="info"
                            showIcon
                            style={{ marginBottom: 16 }}
                        />
                    )}

                    {editingId && (
                        <Form.Item name="is_active" label="Estado" valuePropName="checked">
                            <Switch checkedChildren="Activo" unCheckedChildren="Inactivo" />
                        </Form.Item>
                    )}

                    <Form.Item style={{ marginBottom: 0, textAlign: "right" }}>
                        <Space>
                            <Button onClick={() => setModalVisible(false)}>Cancelar</Button>
                            <Button type="primary" htmlType="submit">
                                {editingId ? "Guardar Cambios" : "Crear"}
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>
        </Layout>
    );
}

export default ReportTemplates;
