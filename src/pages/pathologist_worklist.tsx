import { useEffect, useState } from "react";
import { Layout, Table, Tag, Button, message } from "antd";
import { useNavigate } from "react-router-dom";
import SidebarCeluma from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import { tokens } from "../components/design/tokens";
import { getWorklist, type WorklistResponse } from "../services/report_service";
import type { ColumnsType } from "antd/es/table";

interface WorklistItem {
    id: string;
    status: string;
    title?: string;
    order_code: string;
    patient_name: string;
    patient_code: string;
    created_at?: string;
}

function PathologistWorklist() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [reports, setReports] = useState<WorklistItem[]>([]);

    useEffect(() => {
        loadWorklist();
    }, []);

    const loadWorklist = async () => {
        setLoading(true);
        try {
            const data: WorklistResponse = await getWorklist();
            const mapped = data.reports.map((r) => ({
                id: r.id,
                status: r.status,
                title: r.title || undefined,
                order_code: r.order.order_code,
                patient_name: r.order.patient?.full_name || "Sin nombre",
                patient_code: r.order.patient?.patient_code || "",
                created_at: r.created_at || undefined,
            }));
            setReports(mapped);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "Error al cargar worklist");
        } finally {
            setLoading(false);
        }
    };

    const columns: ColumnsType<WorklistItem> = [
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
        {
            title: "Folio",
            dataIndex: "order_code",
            key: "order_code",
        },
        {
            title: "Tipo de Reporte",
            dataIndex: "title",
            key: "title",
            render: (text) => text || "Sin título",
        },
        {
            title: "Estado",
            dataIndex: "status",
            key: "status",
            render: (status) => (
                <Tag color="blue">
                    {status === "IN_REVIEW" ? "En Revisión" : status}
                </Tag>
            ),
        },
        {
            title: "Fecha de Envío",
            dataIndex: "created_at",
            key: "created_at",
            render: (date) => (date ? new Date(date).toLocaleDateString("es-MX") : "-"),
        },
        {
            title: "Acciones",
            key: "actions",
            render: (_, record) => (
                <Button
                    type="primary"
                    size="small"
                    onClick={() => navigate(`/reports/${record.id}`)}
                >
                    Revisar
                </Button>
            ),
        },
    ];

    return (
        <Layout style={{ minHeight: "100vh", padding: 0, margin: 0 }}>
            <SidebarCeluma
                selectedKey="/worklist"
                onNavigate={(k) => navigate(k)}
                logoSrc={logo}
            />
            <Layout.Content
                style={{
                    padding: 24,
                    background: tokens.bg,
                    fontFamily: tokens.textFont,
                }}
            >
                <div style={{ maxWidth: 1400, margin: "0 auto" }}>
                    <div
                        style={{
                            background: tokens.cardBg,
                            borderRadius: tokens.radius,
                            boxShadow: tokens.shadow,
                            padding: 24,
                        }}
                    >
                        <div style={{ marginBottom: 24 }}>
                            <h1
                                style={{
                                    marginTop: 0,
                                    marginBottom: 8,
                                    fontFamily: tokens.titleFont,
                                    fontSize: 24,
                                    fontWeight: 800,
                                    color: "#0d1b2a",
                                }}
                            >
                                Worklist del Patólogo
                            </h1>
                            <p style={{ margin: 0, color: "#666" }}>
                                Reportes pendientes de revisión
                            </p>
                        </div>

                        <Table
                            columns={columns}
                            dataSource={reports}
                            loading={loading}
                            rowKey="id"
                            pagination={{
                                pageSize: 10,
                                showTotal: (total) => `Total: ${total} reportes`,
                            }}
                        />
                    </div>
                </div>
            </Layout.Content>
        </Layout>
    );
}

export default PathologistWorklist;

