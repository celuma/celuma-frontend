/**
 * Worklist Page - Unified view for user's pending assignments and reviews
 * 
 * This page shows:
 * - Pending assignments (items where the user is assigned)
 * - Pending reviews (reports where the user needs to approve/reject)
 */
import { useEffect, useState, useCallback } from "react";
import { Layout, Table, Tag, Button, message, Card, Select, Space, Tooltip } from "antd";
import { useNavigate } from "react-router-dom";
import { 
    UserOutlined, 
    FileTextOutlined, 
    ExperimentOutlined,
    InboxOutlined,
    CheckCircleOutlined,
    EyeOutlined,
} from "@ant-design/icons";
import SidebarCeluma from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import { tokens, cardStyle, cardTitleStyle } from "../components/design/tokens";
import { getMyWorklist, type WorklistItem, type WorklistResponse } from "../services/worklist_service";
import type { ColumnsType } from "antd/es/table";

function Worklist() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [items, setItems] = useState<WorklistItem[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [hasMore, setHasMore] = useState(false);
    
    // Filters
    const [kindFilter, setKindFilter] = useState<"assignment" | "review" | undefined>(undefined);
    const [itemTypeFilter, setItemTypeFilter] = useState<"lab_order" | "sample" | "report" | undefined>(undefined);

    const loadWorklist = useCallback(async () => {
        setLoading(true);
        try {
            const data: WorklistResponse = await getMyWorklist({
                kind: kindFilter,
                item_type: itemTypeFilter,
                page,
                page_size: pageSize,
            });
            setItems(data.items);
            setTotal(data.total);
            setHasMore(data.has_more);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "Error al cargar worklist");
        } finally {
            setLoading(false);
        }
    }, [kindFilter, itemTypeFilter, page, pageSize]);

    useEffect(() => {
        loadWorklist();
    }, [loadWorklist]);

    // Helper to format relative time
    const formatRelativeTime = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);
        
        if (diffMins < 1) return "Ahora";
        if (diffMins < 60) return `Hace ${diffMins} min`;
        if (diffHours < 24) return `Hace ${diffHours}h`;
        if (diffDays < 7) return `Hace ${diffDays}d`;
        return date.toLocaleDateString("es-MX");
    };

    // Helper to get item type icon
    const getItemTypeIcon = (itemType: string) => {
        switch (itemType) {
            case "lab_order": return <InboxOutlined style={{ color: tokens.accent }} />;
            case "sample": return <ExperimentOutlined style={{ color: tokens.accent }} />;
            case "report": return <FileTextOutlined style={{ color: tokens.accent }} />;
            default: return <FileTextOutlined />;
        }
    };

    // Helper to get item type label
    const getItemTypeLabel = (itemType: string) => {
        switch (itemType) {
            case "lab_order": return "Orden";
            case "sample": return "Muestra";
            case "report": return "Reporte";
            default: return itemType;
        }
    };

    // Helper to get kind badge
    const getKindBadge = (kind: string) => {
        if (kind === "review") {
            return <Tag color="orange" icon={<CheckCircleOutlined />}>Revisión</Tag>;
        }
        return <Tag color="blue" icon={<UserOutlined />}>Asignación</Tag>;
    };

    // Helper to get status color
    const getStatusColor = (status: string) => {
        const statusLower = status.toLowerCase();
        if (statusLower === "pending" || statusLower === "received" || statusLower === "draft") return "default";
        if (statusLower === "in_review" || statusLower === "processing") return "processing";
        if (statusLower === "approved" || statusLower === "ready" || statusLower === "released") return "success";
        if (statusLower === "rejected" || statusLower === "cancelled" || statusLower === "damaged") return "error";
        return "default";
    };

    // Helper to get status label in Spanish
    const getStatusLabel = (status: string) => {
        const statusMap: Record<string, string> = {
            "PENDING": "Pendiente",
            "APPROVED": "Aprobado",
            "REJECTED": "Rechazado",
            "DRAFT": "Borrador",
            "IN_REVIEW": "En Revisión",
            "PUBLISHED": "Publicado",
            "RECEIVED": "Recibido",
            "PROCESSING": "En Proceso",
            "READY": "Listo",
            "DIAGNOSIS": "Diagnóstico",
            "REVIEW": "Revisión",
            "RELEASED": "Liberado",
            "CLOSED": "Cerrado",
            "CANCELLED": "Cancelado",
            "DAMAGED": "Dañado",
        };
        return statusMap[status.toUpperCase()] || status;
    };

    const columns: ColumnsType<WorklistItem> = [
        {
            title: "Tipo",
            key: "kind",
            width: 120,
            render: (_, record) => getKindBadge(record.kind),
        },
        {
            title: "Item",
            key: "item",
            width: 100,
            render: (_, record) => (
                <Tooltip title={getItemTypeLabel(record.item_type)}>
                    <Space>
                        {getItemTypeIcon(record.item_type)}
                        <span>{getItemTypeLabel(record.item_type)}</span>
                    </Space>
                </Tooltip>
            ),
        },
        {
            title: "Código",
            dataIndex: "display_id",
            key: "display_id",
            width: 150,
            render: (text, record) => (
                <div>
                    <div style={{ fontWeight: 600 }}>{text}</div>
                    {record.order_code && record.item_type !== "lab_order" && (
                        <div style={{ fontSize: 11, color: "#888" }}>Orden: {record.order_code}</div>
                    )}
                </div>
            ),
        },
        {
            title: "Paciente",
            key: "patient",
            width: 200,
            render: (_, record) => (
                <div>
                    <div style={{ fontWeight: 500 }}>{record.patient_name || "—"}</div>
                    {record.patient_code && (
                        <div style={{ fontSize: 12, color: "#888" }}>{record.patient_code}</div>
                    )}
                </div>
            ),
        },
        {
            title: "Estado",
            dataIndex: "item_status",
            key: "item_status",
            width: 120,
            render: (status) => (
                <Tag color={getStatusColor(status)}>
                    {getStatusLabel(status)}
                </Tag>
            ),
        },
        {
            title: "Asignado",
            dataIndex: "assigned_at",
            key: "assigned_at",
            width: 120,
            render: (date) => (
                <Tooltip title={new Date(date).toLocaleString("es-MX")}>
                    <span>{formatRelativeTime(date)}</span>
                </Tooltip>
            ),
        },
        {
            title: "Acciones",
            key: "actions",
            width: 100,
            render: (_, record) => (
                <Button
                    type="primary"
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={() => navigate(record.link)}
                >
                    Ver
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
            <Layout.Content style={{ padding: tokens.contentPadding, background: tokens.bg, fontFamily: tokens.textFont }}>
                <div style={{ maxWidth: tokens.maxWidth, margin: "0 auto" }}>
                    <Card
                        title={<span style={cardTitleStyle}>Mi Worklist</span>}
                        style={cardStyle}
                        extra={
                            <Space>
                                <Select
                                    placeholder="Tipo de tarea"
                                    allowClear
                                    style={{ width: 150 }}
                                    value={kindFilter}
                                    onChange={(v) => { setKindFilter(v); setPage(1); }}
                                    options={[
                                        { value: "assignment", label: "Asignaciones" },
                                        { value: "review", label: "Revisiones" },
                                    ]}
                                />
                                <Select
                                    placeholder="Tipo de item"
                                    allowClear
                                    style={{ width: 150 }}
                                    value={itemTypeFilter}
                                    onChange={(v) => { setItemTypeFilter(v); setPage(1); }}
                                    options={[
                                        { value: "lab_order", label: "Órdenes" },
                                        { value: "sample", label: "Muestras" },
                                        { value: "report", label: "Reportes" },
                                    ]}
                                />
                            </Space>
                        }
                    >
                        <Table
                            columns={columns}
                            dataSource={items}
                            loading={loading}
                            rowKey="id"
                            pagination={{
                                current: page,
                                pageSize: pageSize,
                                total: total,
                                showTotal: (t) => `Total: ${t} elementos`,
                                showSizeChanger: true,
                                pageSizeOptions: ["10", "20", "50"],
                                onChange: (p, ps) => {
                                    setPage(p);
                                    if (ps !== pageSize) setPageSize(ps);
                                },
                            }}
                            locale={{
                                emptyText: (
                                    <div style={{ padding: 40, textAlign: "center" }}>
                                        <InboxOutlined style={{ fontSize: 48, color: "#ccc" }} />
                                        <p style={{ color: "#888", marginTop: 16 }}>
                                            No tienes elementos pendientes
                                        </p>
                                    </div>
                                ),
                            }}
                        />
                    </Card>
                </div>
            </Layout.Content>
        </Layout>
    );
}

export default Worklist;
