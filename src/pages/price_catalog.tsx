import { useEffect, useState } from "react";
import { Layout, Card, Table, Button, Form, Input, InputNumber, Modal, message, Tag, Space, Popconfirm } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
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

interface Service {
    id: string;
    service_name: string;
    service_code: string;
    description?: string;
    price: number;
    currency: string;
    is_active: boolean;
}

function PriceCatalog() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [services, setServices] = useState<Service[]>([]);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingService, setEditingService] = useState<Service | null>(null);
    const [form] = Form.useForm();

    useEffect(() => {
        loadServices();
    }, []);

    const loadServices = async () => {
        setLoading(true);
        try {
            const data = await getJSON<Service[]>("/v1/billing/catalog?active_only=false");
            setServices(data);
        } catch {
            message.error("Error al cargar catálogo");
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = () => {
        setEditingService(null);
        form.resetFields();
        setModalVisible(true);
    };

    const handleEdit = (service: Service) => {
        setEditingService(service);
        form.setFieldsValue(service);
        setModalVisible(true);
    };

    const handleDelete = async (serviceId: string) => {
        try {
            await deleteJSON(`/v1/billing/catalog/${serviceId}`);
            message.success("Servicio desactivado");
            await loadServices();
        } catch {
            message.error("Error al desactivar servicio");
        }
    };

    const handleSubmit = async (values: Partial<Service>) => {
        try {
            if (editingService) {
                await putJSON(`/v1/billing/catalog/${editingService.id}`, values);
                message.success("Servicio actualizado");
            } else {
                await postJSON("/v1/billing/catalog", values);
                message.success("Servicio creado");
            }
            setModalVisible(false);
            form.resetFields();
            await loadServices();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "Error al guardar servicio");
        }
    };

    const columns: ColumnsType<Service> = [
        { title: "Código", dataIndex: "service_code", key: "service_code", width: 120 },
        { title: "Nombre", dataIndex: "service_name", key: "service_name" },
        { title: "Descripción", dataIndex: "description", key: "description", render: (text) => text || "—" },
        { 
            title: "Precio", 
            dataIndex: "price", 
            key: "price", 
            width: 120,
            render: (price, record) => `$${price.toFixed(2)} ${record.currency}` 
        },
        { 
            title: "Estado", 
            dataIndex: "is_active", 
            key: "is_active", 
            width: 100,
            render: (active) => <Tag color={active ? "green" : "red"}>{active ? "Activo" : "Inactivo"}</Tag>
        },
        {
            title: "Acciones",
            key: "actions",
            width: 150,
            render: (_, record) => (
                <Space>
                    <Button
                        type="text"
                        icon={<EditOutlined />}
                        onClick={() => handleEdit(record)}
                        size="small"
                    />
                    {record.is_active && (
                        <Popconfirm
                            title="¿Desactivar este servicio?"
                            onConfirm={() => handleDelete(record.id)}
                            okText="Sí"
                            cancelText="No"
                        >
                            <Button
                                type="text"
                                danger
                                icon={<DeleteOutlined />}
                                size="small"
                            />
                        </Popconfirm>
                    )}
                </Space>
            ),
        },
    ];

    return (
        <Layout style={{ minHeight: "100vh" }}>
            <SidebarCeluma selectedKey="/home" onNavigate={(k) => navigate(k)} logoSrc={logo} />
            <Layout.Content style={{ padding: 24, background: tokens.bg }}>
                <div style={{ maxWidth: 1200, margin: "0 auto" }}>
                    <Card
                        title={<span style={{ fontFamily: tokens.titleFont, fontSize: 24, fontWeight: 800 }}>Catálogo de Precios</span>}
                        extra={
                            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
                                Nuevo Servicio
                            </Button>
                        }
                        style={{ borderRadius: tokens.radius, boxShadow: tokens.shadow }}
                    >
                        <Table
                            columns={columns}
                            dataSource={services}
                            loading={loading}
                            rowKey="id"
                            pagination={{ pageSize: 10 }}
                        />
                    </Card>

                    <Modal
                        title={editingService ? "Editar Servicio" : "Nuevo Servicio"}
                        open={modalVisible}
                        onCancel={() => {
                            setModalVisible(false);
                            form.resetFields();
                        }}
                        footer={null}
                    >
                        <Form form={form} layout="vertical" onFinish={handleSubmit}>
                            <Form.Item
                                name="service_code"
                                label="Código"
                                rules={[{ required: true, message: "Requerido" }]}
                            >
                                <Input placeholder="ej: BIOPSIA-001" />
                            </Form.Item>
                            <Form.Item
                                name="service_name"
                                label="Nombre del Servicio"
                                rules={[{ required: true, message: "Requerido" }]}
                            >
                                <Input placeholder="ej: Biopsia de Piel" />
                            </Form.Item>
                            <Form.Item name="description" label="Descripción">
                                <Input.TextArea rows={3} placeholder="Descripción opcional" />
                            </Form.Item>
                            <Form.Item
                                name="price"
                                label="Precio"
                                rules={[{ required: true, message: "Requerido" }]}
                            >
                                <InputNumber min={0} step={0.01} style={{ width: "100%" }} placeholder="0.00" />
                            </Form.Item>
                            <Form.Item name="currency" label="Moneda" initialValue="MXN">
                                <Input placeholder="MXN" />
                            </Form.Item>
                            <Form.Item style={{ marginBottom: 0, textAlign: "right" }}>
                                <Space>
                                    <Button onClick={() => setModalVisible(false)}>Cancelar</Button>
                                    <Button type="primary" htmlType="submit">
                                        {editingService ? "Actualizar" : "Crear"}
                                    </Button>
                                </Space>
                            </Form.Item>
                        </Form>
                    </Modal>
                </div>
            </Layout.Content>
        </Layout>
    );
}

export default PriceCatalog;

