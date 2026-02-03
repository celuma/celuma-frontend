import { useEffect, useState } from "react";
import { Layout, Card, Table, Button, Form, Input, Modal, message, Tag, Space, Popconfirm, Switch, Alert } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined, FileTextOutlined } from "@ant-design/icons";
import { useNavigate, useLocation } from "react-router-dom";
import SidebarCeluma from "../components/ui/sidebar_menu";
import type { CelumaKey } from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import { tokens, cardTitleStyle, cardStyle } from "../components/design/tokens";
import type { ColumnsType } from "antd/es/table";

const { Content } = Layout;
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

    const handleSave = async () => {
        try {
            const values = await form.validateFields();
            
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
            render: (name: string) => <strong>{name}</strong>,
        },
        {
            title: "Descripción",
            dataIndex: "description",
            key: "description",
            ellipsis: true,
        },
        {
            title: "Estado",
            dataIndex: "is_active",
            key: "is_active",
            width: 100,
            render: (is_active: boolean) => (
                <Tag color={is_active ? "green" : "red"}>
                    {is_active ? "Activo" : "Inactivo"}
                </Tag>
            ),
        },
        {
            title: "Fecha de creación",
            dataIndex: "created_at",
            key: "created_at",
            width: 180,
            render: (date: string) => new Date(date).toLocaleDateString("es-MX"),
        },
        {
            title: "Acciones",
            key: "actions",
            width: 150,
            render: (_, record) => (
                <Space size="small">
                    <Button
                        type="link"
                        icon={<EditOutlined />}
                        onClick={() => handleEdit(record)}
                    >
                        Editar
                    </Button>
                    <Popconfirm
                        title="¿Eliminar esta plantilla?"
                        onConfirm={() => handleDelete(record.id)}
                        okText="Sí"
                        cancelText="No"
                    >
                        <Button type="link" danger icon={<DeleteOutlined />}>
                            Eliminar
                        </Button>
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <Layout style={{ minHeight: "100vh", backgroundColor: tokens.colorBgLayout }}>
            <SidebarCeluma selectedKey={(pathname as CelumaKey) ?? "/report-templates"} onNavigate={(k) => navigate(k)} logoSrc={logo} />
            <Layout>
                <Content style={{ margin: "24px 24px 0" }}>
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
                            pagination={{ pageSize: 20 }}
                        />
                    </Card>
                </Content>
            </Layout>

            <Modal
                title={editingId ? "Editar Plantilla" : "Nueva Plantilla"}
                open={modalVisible}
                onOk={handleSave}
                onCancel={() => {
                    setModalVisible(false);
                    form.resetFields();
                }}
                okText="Guardar"
                cancelText="Cancelar"
                width={600}
            >
                <Form form={form} layout="vertical">
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
                        <Form.Item name="is_active" label="Activo" valuePropName="checked">
                            <Switch />
                        </Form.Item>
                    )}
                </Form>
            </Modal>
        </Layout>
    );
}

export default ReportTemplates;
