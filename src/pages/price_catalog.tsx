import { useEffect, useState } from "react";
import { Layout, Card, Table, Button, Form, InputNumber, Modal, message, Space, Popconfirm, Switch, Select, DatePicker } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import { useNavigate, useLocation } from "react-router-dom";
import SidebarCeluma from "../components/ui/sidebar_menu";
import type { CelumaKey } from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import { tokens, cardTitleStyle, cardStyle } from "../components/design/tokens";
import type { ColumnsType } from "antd/es/table";
import dayjs, { Dayjs } from "dayjs";

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
    code: string;
    name: string;
}

interface PriceCatalogEntry {
    id: string;
    study_type_id: string;
    unit_price: number;
    currency: string;
    is_active: boolean;
    effective_from?: string;
    effective_to?: string;
    created_at: string;
    study_type?: StudyType;
}

interface PriceCatalogListResponse {
    prices: PriceCatalogEntry[];
}

interface StudyTypesListResponse {
    study_types: StudyType[];
}

function PriceCatalog() {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const [loading, setLoading] = useState(false);
    const [prices, setPrices] = useState<PriceCatalogEntry[]>([]);
    const [studyTypes, setStudyTypes] = useState<StudyType[]>([]);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form] = Form.useForm();

    useEffect(() => {
        loadPrices();
        loadStudyTypes();
    }, []);

    const loadPrices = async () => {
        setLoading(true);
        try {
            const data = await getJSON<PriceCatalogListResponse>("/v1/price-catalog/?active_only=false");
            setPrices(data.prices);
        } catch {
            message.error("Error al cargar catálogo de precios");
        } finally {
            setLoading(false);
        }
    };

    const loadStudyTypes = async () => {
        try {
            const data = await getJSON<StudyTypesListResponse>("/v1/study-types/?active_only=true");
            setStudyTypes(data.study_types);
        } catch {
            message.error("Error al cargar tipos de estudio");
        }
    };

    const handleCreate = () => {
        setEditingId(null);
        form.resetFields();
        form.setFieldsValue({ is_active: true });
        setModalVisible(true);
    };

    const handleEdit = (record: PriceCatalogEntry) => {
        setEditingId(record.id);
        form.setFieldsValue({
            study_type_id: record.study_type_id,
            unit_price: record.unit_price,
            is_active: record.is_active,
            effective_from: record.effective_from ? dayjs(record.effective_from) : null,
            effective_to: record.effective_to ? dayjs(record.effective_to) : null,
        });
        setModalVisible(true);
    };

    const handleDelete = async (id: string) => {
        try {
            await deleteJSON(`/v1/price-catalog/${id}`);
            message.success("Precio desactivado");
            await loadPrices();
        } catch {
            message.error("Error al desactivar precio");
        }
    };

    const handleSubmit = async (values: {
        study_type_id: string;
        unit_price: number;
        is_active: boolean;
        effective_from?: Dayjs;
        effective_to?: Dayjs;
    }) => {
        try {
            const payload = {
                study_type_id: values.study_type_id,
                unit_price: values.unit_price,
                is_active: values.is_active,
                effective_from: values.effective_from ? values.effective_from.toISOString() : null,
                effective_to: values.effective_to ? values.effective_to.toISOString() : null,
            };

            if (editingId) {
                await putJSON(`/v1/price-catalog/${editingId}`, payload);
                message.success("Precio actualizado");
            } else {
                await postJSON("/v1/price-catalog/", payload);
                message.success("Precio creado");
            }
            
            setModalVisible(false);
            form.resetFields();
            await loadPrices();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "Error al guardar precio");
        }
    };

    const columns: ColumnsType<PriceCatalogEntry> = [
        {
            title: "Tipo de Estudio",
            key: "study_type",
            render: (_, record) => (
                <div>
                    <div style={{ fontWeight: 600, color: "#0f8b8d" }}>
                        {record.study_type?.code || "—"}
                    </div>
                    <div style={{ fontSize: 12, color: "#666" }}>
                        {record.study_type?.name || "—"}
                    </div>
                </div>
            ),
        },
        {
            title: "Precio Unitario",
            dataIndex: "unit_price",
            key: "unit_price",
            width: 150,
            render: (price: number) => (
                <span style={{ fontWeight: 500 }}>${price.toFixed(2)} MXN</span>
            ),
        },
        {
            title: "Vigencia Desde",
            dataIndex: "effective_from",
            key: "effective_from",
            width: 130,
            render: (date?: string) => {
                if (!date) return <span style={{ color: "#888" }}>—</span>;
                const d = new Date(date);
                return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
            },
        },
        {
            title: "Vigencia Hasta",
            dataIndex: "effective_to",
            key: "effective_to",
            width: 130,
            render: (date?: string) => {
                if (!date) return <span style={{ color: "#888" }}>—</span>;
                const d = new Date(date);
                return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
            },
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
                    {record.is_active && (
                        <Popconfirm
                            title="¿Desactivar este precio?"
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
                    )}
                </Space>
            ),
        },
    ];

    return (
        <Layout style={{ minHeight: "100vh" }}>
            <SidebarCeluma selectedKey={(pathname as CelumaKey) ?? "/catalog"} onNavigate={(k) => navigate(k)} logoSrc={logo} />
            <Layout.Content style={{ padding: tokens.contentPadding, background: tokens.bg }}>
                <div style={{ maxWidth: tokens.maxWidth, margin: "0 auto" }}>
                    <Card
                        title={<span style={cardTitleStyle}>Catálogo de Precios</span>}
                        extra={
                            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
                                Nuevo Precio
                            </Button>
                        }
                        style={cardStyle}
                    >
                        <Table
                            columns={columns}
                            dataSource={prices}
                            loading={loading}
                            rowKey="id"
                            pagination={{ pageSize: 10 }}
                        />
                    </Card>

                    <Modal
                        title={editingId ? "Editar Precio" : "Nuevo Precio"}
                        open={modalVisible}
                        onCancel={() => {
                            setModalVisible(false);
                            form.resetFields();
                        }}
                        footer={null}
                        width={600}
                    >
                        <Form form={form} layout="vertical" onFinish={handleSubmit}>
                            <Form.Item
                                name="study_type_id"
                                label="Tipo de Estudio"
                                rules={[{ required: true, message: "Requerido" }]}
                            >
                                <Select
                                    placeholder="Seleccionar tipo de estudio"
                                    showSearch
                                    optionFilterProp="children"
                                    filterOption={(input, option) =>
                                        (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                                    }
                                    options={studyTypes.map((st) => ({
                                        value: st.id,
                                        label: `${st.code} - ${st.name}`,
                                    }))}
                                />
                            </Form.Item>

                            <Form.Item
                                name="unit_price"
                                label="Precio Unitario (MXN)"
                                rules={[
                                    { required: true, message: "Requerido" },
                                    { type: "number", min: 0, message: "Debe ser mayor o igual a 0" },
                                ]}
                            >
                                <InputNumber
                                    min={0}
                                    step={0.01}
                                    precision={2}
                                    style={{ width: "100%" }}
                                    placeholder="0.00"
                                    prefix="$"
                                />
                            </Form.Item>

                            <Form.Item name="effective_from" label="Vigencia Desde (opcional)">
                                <DatePicker style={{ width: "100%" }} format="DD/MM/YYYY" />
                            </Form.Item>

                            <Form.Item name="effective_to" label="Vigencia Hasta (opcional)">
                                <DatePicker style={{ width: "100%" }} format="DD/MM/YYYY" />
                            </Form.Item>

                            <Form.Item name="is_active" label="Estado" valuePropName="checked">
                                <Switch checkedChildren="Activo" unCheckedChildren="Inactivo" />
                            </Form.Item>

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
                </div>
            </Layout.Content>
        </Layout>
    );
}

export default PriceCatalog;
