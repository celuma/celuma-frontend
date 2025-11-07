import { useEffect, useState } from "react";
import { Card, Table, Button, message, Typography, Tag } from "antd";
import { FilePdfOutlined, DownloadOutlined } from "@ant-design/icons";
import { tokens } from "../components/design/tokens";
import type { ColumnsType } from "antd/es/table";

const { Title } = Typography;

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

interface PhysicianOrder {
    id: string;
    order_code: string;
    patient_name: string;
    patient_code: string;
    status: string;
    has_report: boolean;
    report_status?: string;
}

function PhysicianPortal() {
    const [loading, setLoading] = useState(false);
    const [orders, setOrders] = useState<PhysicianOrder[]>([]);

    useEffect(() => {
        loadOrders();
    }, []);

    const loadOrders = async () => {
        setLoading(true);
        try {
            const data = await getJSON<PhysicianOrder[]>("/v1/portal/physician/orders");
            setOrders(data);
        } catch (error) {
            message.error("Error al cargar órdenes");
        } finally {
            setLoading(false);
        }
    };

    const handleDownloadReport = async (orderId: string) => {
        try {
            const data = await getJSON<{ pdf_url: string }>(`/v1/portal/physician/orders/${orderId}/report`);
            window.open(data.pdf_url, "_blank");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "Error al descargar reporte");
        }
    };

    const columns: ColumnsType<PhysicianOrder> = [
        { 
            title: "Paciente", 
            dataIndex: "patient_name", 
            key: "patient_name",
            render: (text, record) => (
                <div>
                    <div style={{ fontWeight: 600 }}>{text}</div>
                    <div style={{ fontSize: 12, color: "#888" }}>{record.patient_code}</div>
                </div>
            ),
        },
        { title: "Folio", dataIndex: "order_code", key: "order_code" },
        { 
            title: "Estado", 
            dataIndex: "status", 
            key: "status",
            render: (status) => <Tag color="blue">{status}</Tag>
        },
        { 
            title: "Reporte", 
            dataIndex: "report_status", 
            key: "report_status",
            render: (status) => {
                if (!status) return <Tag>Sin reporte</Tag>;
                const color = status === "PUBLISHED" ? "green" : "orange";
                return <Tag color={color}>{status === "PUBLISHED" ? "Disponible" : "En proceso"}</Tag>;
            }
        },
        {
            title: "Acciones",
            key: "actions",
            render: (_, record) => (
                record.has_report && record.report_status === "PUBLISHED" ? (
                    <Button
                        type="primary"
                        size="small"
                        icon={<DownloadOutlined />}
                        onClick={() => handleDownloadReport(record.id)}
                    >
                        Descargar PDF
                    </Button>
                ) : (
                    <Tag>No disponible</Tag>
                )
            ),
        },
    ];

    return (
        <div style={{ minHeight: "100vh", background: tokens.bg, padding: 24 }}>
            <div style={{ maxWidth: 1200, margin: "0 auto" }}>
                <Card
                    title={
                        <Title level={2} style={{ margin: 0, fontFamily: tokens.titleFont }}>
                            Portal del Médico
                        </Title>
                    }
                    style={{ borderRadius: tokens.radius, boxShadow: tokens.shadow }}
                >
                    <Table
                        columns={columns}
                        dataSource={orders}
                        loading={loading}
                        rowKey="id"
                        pagination={{ pageSize: 10 }}
                    />
                </Card>
            </div>
        </div>
    );
}

export default PhysicianPortal;

