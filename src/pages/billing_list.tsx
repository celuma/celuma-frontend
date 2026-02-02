import { useEffect, useState } from "react";
import { Layout, Card, Button, message, Tag, Space } from "antd";
import { EyeOutlined } from "@ant-design/icons";
import { useNavigate, useLocation } from "react-router-dom";
import type { ColumnsType } from "antd/es/table";
import SidebarCeluma from "../components/ui/sidebar_menu";
import type { CelumaKey } from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import { tokens, cardStyle, cardTitleStyle } from "../components/design/tokens";
import { CelumaTable } from "../components/ui/celuma_table";
import { usePageTitle } from "../hooks/use_page_title";

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

interface Invoice {
    id: string;
    invoice_number: string;
    amount_total: number;
    currency: string;
    status: string;
    order_id: string;
    tenant_id: string;
    branch_id: string;
}

function BillingList() {
    usePageTitle();
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const [loading, setLoading] = useState(false);
    const [invoices, setInvoices] = useState<Invoice[]>([]);

    useEffect(() => {
        loadInvoices();
    }, []);

    const loadInvoices = async () => {
        setLoading(true);
        try {
            const data = await getJSON<Invoice[]>("/v1/billing/invoices/");
            setInvoices(data);
        } catch (error) {
            message.error("Error al cargar facturas");
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case "PAID":
                return "green";
            case "PARTIAL":
                return "orange";
            case "PENDING":
                return "red";
            default:
                return "default";
        }
    };

    const getStatusLabel = (status: string) => {
        switch (status) {
            case "PAID":
                return "Pagado";
            case "PARTIAL":
                return "Pago Parcial";
            case "PENDING":
                return "Pendiente";
            default:
                return status;
        }
    };

    const columns: ColumnsType<Invoice> = [
        {
            title: "Nº Factura",
            dataIndex: "invoice_number",
            key: "invoice_number",
            width: 150,
        },
        {
            title: "Orden",
            dataIndex: "order_id",
            key: "order_id",
            width: 100,
            render: (orderId: string) => (
                <Button
                    type="link"
                    size="small"
                    onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/orders/${orderId}`);
                    }}
                    style={{ padding: 0 }}
                >
                    Ver orden
                </Button>
            ),
        },
        {
            title: "Total",
            dataIndex: "amount_total",
            key: "amount_total",
            width: 120,
            render: (amount: number, record: Invoice) => `$${amount.toFixed(2)} ${record.currency}`,
        },
        {
            title: "Estado",
            dataIndex: "status",
            key: "status",
            width: 120,
            render: (status: string) => (
                <Tag color={getStatusColor(status)}>{getStatusLabel(status)}</Tag>
            ),
            filters: [
                { text: "Pagado", value: "PAID" },
                { text: "Pago Parcial", value: "PARTIAL" },
                { text: "Pendiente", value: "PENDING" },
            ],
            onFilter: (value, record) => record.status === value,
        },
        {
            title: "Acciones",
            key: "actions",
            width: 120,
            render: (_, record) => (
                <Space>
                    <Button
                        type="primary"
                        size="small"
                        icon={<EyeOutlined />}
                        onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/billing/${record.order_id}`);
                        }}
                    >
                        Ver detalle
                    </Button>
                </Space>
            ),
        },
    ];

    return (
        <Layout style={{ minHeight: "100vh" }}>
            <SidebarCeluma
                selectedKey={(pathname as CelumaKey) ?? "/billing"}
                onNavigate={(k) => navigate(k)}
                logoSrc={logo}
            />
            <Layout.Content style={{ padding: tokens.contentPadding, background: tokens.bg }}>
                <div style={{ maxWidth: tokens.maxWidth, margin: "0 auto" }}>
                    <Card
                        title={<span style={cardTitleStyle}>Facturación</span>}
                        style={cardStyle}
                    >
                        <CelumaTable
                            columns={columns}
                            dataSource={invoices}
                            loading={loading}
                            rowKey="id"
                            pagination={{ pageSize: 10 }}
                            onRowClick={(record) => navigate(`/billing/${record.order_id}`)}
                            emptyText="Sin facturas"
                            locale={{
                                filterTitle: 'Filtrar',
                                filterConfirm: 'Aceptar',
                                filterReset: 'Limpiar',
                                filterEmptyText: 'Sin filtros',
                                emptyText: 'Sin facturas',
                                sortTitle: 'Ordenar',
                            }}
                        />
                    </Card>
                </div>
            </Layout.Content>
        </Layout>
    );
}

export default BillingList;
