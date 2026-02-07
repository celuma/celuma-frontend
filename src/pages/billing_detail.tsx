import { useEffect, useState } from "react";
import { Layout, Card, Table, Button, Form, InputNumber, Select, message, Divider, Descriptions } from "antd";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import SidebarCeluma from "../components/ui/sidebar_menu";
import type { CelumaKey } from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import { tokens, cardTitleStyle, cardStyle } from "../components/design/tokens";
import type { ColumnsType } from "antd/es/table";
import { renderInvoiceStatusChip } from "../components/ui/table_helpers";

function getApiBase(): string {
    return import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL || "/api");
}

function getAuthToken(): string | null {
    return localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
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
        throw new Error(`${res.status} - ${errText}`);
    }
    return await res.json();
}

async function getJSON<TRes>(path: string): Promise<TRes> {
    const token = getAuthToken();
    const headers: Record<string, string> = { accept: "application/json" };
    if (token) headers["Authorization"] = token;
    
    const res = await fetch(`${getApiBase()}${path}`, { method: "GET", headers });
    
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`${res.status} - ${errText}`);
    }
    return await res.json();
}

interface InvoiceItem {
    id: string;
    description: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
}

interface Payment {
    id: string;
    amount: number;
    currency: string;
    method?: string;
    reference?: string;
    received_at: string;
}

interface InvoiceDetail {
    id: string;
    invoice_number: string;
    subtotal: number;
    discount_total: number;
    tax_total: number;
    total: number;
    amount_paid: number;
    currency: string;
    status: string;
    order_id: string;
    items: InvoiceItem[];
    payments: Payment[];
    balance: number;
    paid_at?: string;
}

function BillingDetail() {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const { orderId } = useParams();
    const [loading, setLoading] = useState(false);
    const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
    const [form] = Form.useForm();

    useEffect(() => {
        if (!orderId) return;
        loadInvoice();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orderId]);

    const loadInvoice = async () => {
        if (!orderId) return;
        setLoading(true);
        try {
            // Use the new convenient endpoint to get invoice by order_id
            const detail = await getJSON<InvoiceDetail>(`/v1/billing/orders/${orderId}/invoice`);
            setInvoice(detail);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "Error al cargar factura");
        } finally {
            setLoading(false);
        }
    };

    const handlePayment = async (values: { amount: number; method: string }) => {
        if (!invoice) return;
        
        try {
            const tenantId = localStorage.getItem("tenant_id") || sessionStorage.getItem("tenant_id") || "";
            
            await postJSON("/v1/billing/payments/", {
                tenant_id: tenantId,
                invoice_id: invoice.id,
                amount: values.amount,
                currency: "MXN",
                method: values.method,
            });
            
            message.success("Pago registrado exitosamente");
            form.resetFields();
            await loadInvoice();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "Error al registrar pago");
        }
    };

    const itemsColumns: ColumnsType<InvoiceItem> = [
        { title: "Descripción", dataIndex: "description", key: "description" },
        { title: "Cantidad", dataIndex: "quantity", key: "quantity", width: 100 },
        { title: "Precio Unitario", dataIndex: "unit_price", key: "unit_price", width: 150, render: (price) => `$${price.toFixed(2)}` },
        { title: "Subtotal", dataIndex: "subtotal", key: "subtotal", width: 150, render: (subtotal) => `$${subtotal.toFixed(2)}` },
    ];

    const paymentsColumns: ColumnsType<Payment> = [
        { title: "Monto", dataIndex: "amount", key: "amount", render: (amount) => `$${amount.toFixed(2)}` },
        { title: "Método", dataIndex: "method", key: "method", render: (method) => method || "—" },
        { title: "Referencia", dataIndex: "reference", key: "reference", render: (ref) => ref || "—" },
        { title: "Fecha", dataIndex: "received_at", key: "received_at", render: (date) => new Date(date).toLocaleString("es-MX") },
    ];

    return (
        <Layout style={{ minHeight: "100vh" }}>
            <SidebarCeluma selectedKey={(pathname as CelumaKey) ?? "/billing"} onNavigate={(k) => navigate(k)} logoSrc={logo} />
            <Layout.Content style={{ padding: tokens.contentPadding, background: tokens.bg, fontFamily: tokens.textFont }}>
                <div style={{ maxWidth: tokens.maxWidth, margin: "0 auto" }}>
                    <Card
                        title={
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={cardTitleStyle}>Detalle de Facturación</span>
                                {invoice && (
                                    <Button 
                                        type="default"
                                        onClick={() => navigate(`/orders/${invoice.order_id}`)}
                                        style={{ marginLeft: 16 }}
                                    >
                                        Ver orden
                                    </Button>
                                )}
                            </div>
                        }
                        loading={loading}
                        style={cardStyle}
                    >
                        {invoice ? (
                            <>
                                <Descriptions bordered column={2} style={{ marginBottom: 24 }}>
                                    <Descriptions.Item label="Número de Factura">{invoice.invoice_number}</Descriptions.Item>
                                    <Descriptions.Item label="Estado">
                                        {renderInvoiceStatusChip(invoice.status)}
                                    </Descriptions.Item>
                                    <Descriptions.Item label="Subtotal">${invoice.subtotal.toFixed(2)} {invoice.currency}</Descriptions.Item>
                                    <Descriptions.Item label="Descuento">${invoice.discount_total.toFixed(2)} {invoice.currency}</Descriptions.Item>
                                    <Descriptions.Item label="Impuestos">${invoice.tax_total.toFixed(2)} {invoice.currency}</Descriptions.Item>
                                    <Descriptions.Item label="Total">${invoice.total.toFixed(2)} {invoice.currency}</Descriptions.Item>
                                    <Descriptions.Item label="Monto Pagado">${invoice.amount_paid.toFixed(2)} {invoice.currency}</Descriptions.Item>
                                    <Descriptions.Item label="Balance Pendiente">
                                        <span style={{ fontWeight: 700, color: invoice.balance > 0 ? "#ff4d4f" : "#52c41a" }}>
                                            ${invoice.balance.toFixed(2)} {invoice.currency}
                                        </span>
                                    </Descriptions.Item>
                                </Descriptions>

                                <Divider orientation="left">Items de la Factura</Divider>
                                <Table
                                    columns={itemsColumns}
                                    dataSource={invoice.items}
                                    rowKey="id"
                                    pagination={false}
                                    size="small"
                                    style={{ marginBottom: 24 }}
                                />

                                <Divider orientation="left">Pagos Recibidos</Divider>
                                {invoice.payments.length > 0 ? (
                                    <Table
                                        columns={paymentsColumns}
                                        dataSource={invoice.payments}
                                        rowKey="id"
                                        pagination={false}
                                        size="small"
                                        style={{ marginBottom: 24 }}
                                    />
                                ) : (
                                    <div style={{ padding: 16, textAlign: "center", color: tokens.textSecondary }}>Sin pagos registrados</div>
                                )}

                                {invoice.balance > 0 && (
                                    <>
                                        <Divider orientation="left">Registrar Pago</Divider>
                                        <Form
                                            form={form}
                                            layout="inline"
                                            onFinish={handlePayment}
                                            style={{ display: "flex", gap: 12, alignItems: "flex-start" }}
                                        >
                                            <Form.Item
                                                name="amount"
                                                label="Monto"
                                                rules={[{ required: true, message: "Requerido" }]}
                                                style={{ flex: 1 }}
                                            >
                                                <InputNumber
                                                    min={0}
                                                    max={invoice.balance}
                                                    step={0.01}
                                                    placeholder={`Máx: $${invoice.balance.toFixed(2)}`}
                                                    style={{ width: "100%" }}
                                                />
                                            </Form.Item>
                                            <Form.Item
                                                name="method"
                                                label="Método"
                                                rules={[{ required: true, message: "Requerido" }]}
                                                style={{ flex: 1 }}
                                            >
                                                <Select placeholder="Seleccionar">
                                                    <Select.Option value="cash">Efectivo</Select.Option>
                                                    <Select.Option value="card">Tarjeta</Select.Option>
                                                    <Select.Option value="transfer">Transferencia</Select.Option>
                                                    <Select.Option value="other">Otro</Select.Option>
                                                </Select>
                                            </Form.Item>
                                            <Form.Item>
                                                <Button type="primary" htmlType="submit">
                                                    Registrar Pago
                                                </Button>
                                            </Form.Item>
                                        </Form>
                                    </>
                                )}
                            </>
                        ) : (
                            <div style={{ padding: 32, textAlign: "center", color: tokens.textSecondary }}>
                                Sin factura asociada a esta orden
                            </div>
                        )}
                    </Card>
                </div>
            </Layout.Content>
        </Layout>
    );
}

export default BillingDetail;

