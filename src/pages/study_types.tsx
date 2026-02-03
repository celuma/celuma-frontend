import { useEffect, useState } from "react";
import { Layout, Card, Table, Button, Form, Input, Modal, message, Tag, Space, Popconfirm, Switch, Select } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
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

interface StudyType {
    id: string;
    tenant_id: string;
    code: string;
    name: string;
    description?: string;
    is_active: boolean;
    created_at: string;
    default_report_template_id?: string;
    default_template?: {
        id: string;
        name: string;
    };
}

interface StudyTypesListResponse {
    study_types: StudyType[];
}

interface ReportTemplate {
    id: string;
    name: string;
    is_active: boolean;
}

interface ReportTemplatesListResponse {
    templates: ReportTemplate[];
}

function StudyTypes() {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const [loading, setLoading] = useState(false);
    const [studyTypes, setStudyTypes] = useState<StudyType[]>([]);
    const [templates, setTemplates] = useState<ReportTemplate[]>([]);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form] = Form.useForm();

    useEffect(() => {
        loadStudyTypes();
        loadTemplates();
    }, []);

    const loadStudyTypes = async () => {
        setLoading(true);
        try {
            const data = await getJSON<StudyTypesListResponse>("/v1/study-types/?active_only=false");
            setStudyTypes(data.study_types);
        } catch {
            message.error("Error al cargar tipos de estudio");
        } finally {
            setLoading(false);
        }
    };

    const loadTemplates = async () => {
        try {
            const data = await getJSON<ReportTemplatesListResponse>("/v1/reports/templates/?active_only=true");
            setTemplates(data.templates);
        } catch {
            // Silently fail - templates are optional
        }
    };

    const handleCreate = () => {
        setEditingId(null);
        form.resetFields();
        form.setFieldsValue({ is_active: true });
        setModalVisible(true);
    };

    const handleEdit = (record: StudyType) => {
        setEditingId(record.id);
        form.setFieldsValue({
            code: record.code,
            name: record.name,
            description: record.description,
            is_active: record.is_active,
            default_report_template_id: record.default_report_template_id,
        });
        setModalVisible(true);
    };

    const handleSave = async () => {
        try {
            const values = await form.validateFields();
            
            if (editingId) {
                // Update
                await putJSON(`/v1/study-types/${editingId}`, values);
                message.success("Tipo de estudio actualizado");
            } else {
                // Create
                await postJSON("/v1/study-types/", values);
                message.success("Tipo de estudio creado");
            }
            
            setModalVisible(false);
            form.resetFields();
            loadStudyTypes();
        } catch (err) {
            message.error("Error al guardar tipo de estudio");
            console.error(err);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await deleteJSON(`/v1/study-types/${id}`);
            message.success("Tipo de estudio eliminado");
            loadStudyTypes();
        } catch {
            message.error("Error al eliminar tipo de estudio");
        }
    };

    const columns: ColumnsType<StudyType> = [
        {
            title: "Código",
            dataIndex: "code",
            key: "code",
            width: 120,
            render: (code: string) => <strong>{code}</strong>,
        },
        {
            title: "Nombre",
            dataIndex: "name",
            key: "name",
        },
        {
            title: "Descripción",
            dataIndex: "description",
            key: "description",
            ellipsis: true,
        },
        {
            title: "Template por defecto",
            dataIndex: "default_template",
            key: "default_template",
            width: 200,
            render: (template?: { id: string; name: string }) => 
                template ? <Tag color="blue">{template.name}</Tag> : <Tag>Sin template</Tag>,
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
                        title="¿Eliminar este tipo de estudio?"
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
            <SidebarCeluma selectedKey={(pathname as CelumaKey) ?? "/study-types"} onNavigate={(k) => navigate(k)} logoSrc={logo} />
            <Layout>
                <Content style={{ margin: "24px 24px 0" }}>
                    <Card
                        title={<span style={cardTitleStyle}>Tipos de Estudio</span>}
                        style={cardStyle}
                        extra={
                            <Button
                                type="primary"
                                icon={<PlusOutlined />}
                                onClick={handleCreate}
                            >
                                Nuevo Tipo de Estudio
                            </Button>
                        }
                    >
                        <Table
                            columns={columns}
                            dataSource={studyTypes}
                            rowKey="id"
                            loading={loading}
                            pagination={{ pageSize: 20 }}
                        />
                    </Card>
                </Content>
            </Layout>

            <Modal
                title={editingId ? "Editar Tipo de Estudio" : "Nuevo Tipo de Estudio"}
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
                        name="code"
                        label="Código"
                        rules={[
                            { required: true, message: "El código es requerido" },
                            { max: 50, message: "El código no puede exceder 50 caracteres" },
                        ]}
                    >
                        <Input placeholder="Ej: BIOPSIA, CITOLOGIA" maxLength={50} />
                    </Form.Item>

                    <Form.Item
                        name="name"
                        label="Nombre"
                        rules={[
                            { required: true, message: "El nombre es requerido" },
                            { max: 255, message: "El nombre no puede exceder 255 caracteres" },
                        ]}
                    >
                        <Input placeholder="Ej: Biopsia de tejido" maxLength={255} />
                    </Form.Item>

                    <Form.Item name="description" label="Descripción">
                        <TextArea
                            placeholder="Descripción opcional del tipo de estudio"
                            rows={4}
                            maxLength={1000}
                        />
                    </Form.Item>

                    <Form.Item name="default_report_template_id" label="Template por defecto (opcional)">
                        <Select
                            placeholder="Seleccionar template de reporte"
                            allowClear
                            showSearch
                            optionFilterProp="children"
                        >
                            {templates.map((template) => (
                                <Select.Option key={template.id} value={template.id}>
                                    {template.name}
                                </Select.Option>
                            ))}
                        </Select>
                    </Form.Item>

                    <Form.Item name="is_active" label="Activo" valuePropName="checked">
                        <Switch />
                    </Form.Item>
                </Form>
            </Modal>
        </Layout>
    );
}

export default StudyTypes;
