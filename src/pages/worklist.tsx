/**
 * Worklist Page - Unified view for user's pending assignments and reviews
 * 
 * This page shows:
 * - Pending assignments (items where the user is assigned)
 * - Pending reviews (reports where the user needs to approve/reject)
 */
import { useEffect, useState, useCallback, useMemo } from "react";
import { Layout, Tag, Card, Space, Tooltip, Input } from "antd";
import { useNavigate } from "react-router-dom";
import type { ColumnsType } from "antd/es/table";
import { 
    UserOutlined, 
    FileTextOutlined, 
    ExperimentOutlined,
    InboxOutlined,
    CheckCircleOutlined,
} from "@ant-design/icons";
import SidebarCeluma from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import { tokens, cardStyle, cardTitleStyle } from "../components/design/tokens";
import { getMyWorklist, type WorklistItem, type WorklistResponse } from "../services/worklist_service";
import { CelumaTable } from "../components/ui/celuma_table";
import { PatientCell, renderDateCell, dateSorter } from "../components/ui/table_helpers";

function Worklist() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [items, setItems] = useState<WorklistItem[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [hasMore, setHasMore] = useState(false);
    const [search, setSearch] = useState("");
    const [hideCompleted, setHideCompleted] = useState(true);

    const loadWorklist = useCallback(async () => {
        setLoading(true);
        try {
            const data: WorklistResponse = await getMyWorklist({
                page,
                page_size: pageSize,
            });
            setItems(data.items);
            setTotal(data.total);
            setHasMore(data.has_more);
        } catch (error) {
            console.error("Error loading worklist:", error);
        } finally {
            setLoading(false);
        }
    }, [page, pageSize]);

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
        return null; // Return null to show only date
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

    // Completed statuses to filter out by default
    const completedStatuses = ["APPROVED", "READY", "RELEASED", "CLOSED", "PUBLISHED"];

    // Filter items based on search and hideCompleted
    const filteredItems = useMemo(() => {
        let result = items;
        
        // Filter by completed status
        if (hideCompleted) {
            result = result.filter(item => !completedStatuses.includes(item.item_status));
        }
        
        // Filter by search
        if (search.trim()) {
            const q = search.trim().toLowerCase();
            result = result.filter(item => 
                [item.display_id, item.patient_name, item.patient_code, item.order_code]
                    .filter(Boolean)
                    .some(v => String(v).toLowerCase().includes(q))
            );
        }
        
        return result;
    }, [items, search, hideCompleted]);

    // Get unique kinds and types for filters
    const kindFilters = useMemo(() => {
        const kinds = new Set(filteredItems.map(i => i.kind));
        return Array.from(kinds).map(kind => ({
            text: getKindBadge(kind).props.children[1], // Get label from badge
            value: kind,
        }));
    }, [filteredItems]);

    const typeFilters = useMemo(() => {
        const types = new Set(filteredItems.map(i => i.item_type));
        return Array.from(types).map(type => ({
            text: getItemTypeLabel(type),
            value: type,
        }));
    }, [filteredItems]);

    const statusFilters = useMemo(() => {
        const statuses = new Set(filteredItems.map(i => i.item_status));
        return Array.from(statuses).map(status => ({
            text: getStatusLabel(status),
            value: status,
        }));
    }, [filteredItems]);

    const columns: ColumnsType<WorklistItem> = [
        {
            title: "Fecha",
            dataIndex: "assigned_at",
            key: "assigned_at",
            width: 120,
            render: (dateStr: string) => {
                const relative = formatRelativeTime(dateStr);
                const dateOnly = renderDateCell(dateStr);
                return (
                    <Tooltip title={new Date(dateStr).toLocaleString("es-MX")}>
                        <div>
                            <div>{dateOnly}</div>
                            {relative && <div style={{ fontSize: 10, color: "#888" }}>{relative}</div>}
                        </div>
                    </Tooltip>
                );
            },
            sorter: dateSorter("assigned_at"),
        },
        {
            title: "Código",
            dataIndex: "display_id",
            key: "display_id",
            width: 150,
        },
        {
            title: "Paciente",
            key: "patient",
            render: (_, record) => {
                if (!record.patient_name) return "—";
                return (
                    <PatientCell
                        patientId={record.patient_id}
                        patientName={record.patient_name}
                        patientCode={record.patient_code}
                    />
                );
            },
        },
        {
            title: "Tipo",
            key: "item_type",
            width: 120,
            render: (_, record) => (
                <Space>
                    {getItemTypeIcon(record.item_type)}
                    <span>{getItemTypeLabel(record.item_type)}</span>
                </Space>
            ),
            filters: typeFilters,
            onFilter: (value, record) => record.item_type === value,
        },
        {
            title: "Tarea",
            key: "kind",
            width: 120,
            render: (_, record) => getKindBadge(record.kind),
            filters: kindFilters,
            onFilter: (value, record) => record.kind === value,
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
            filters: statusFilters,
            onFilter: (value, record) => record.item_status === value,
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
                                <Input.Search
                                    allowClear
                                    placeholder="Buscar por código, paciente, orden" 
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    onSearch={(v) => setSearch(v)}
                                    style={{ width: 320 }}
                                />
                                <Tag 
                                    color={hideCompleted ? "blue" : "default"}
                                    style={{ cursor: "pointer", userSelect: "none" }}
                                    onClick={() => setHideCompleted(!hideCompleted)}
                                >
                                    {hideCompleted ? "Ocultar completadas" : "Mostrar todas"}
                                </Tag>
                            </Space>
                        }
                    >
                        <CelumaTable
                            dataSource={filteredItems}
                            columns={columns}
                            rowKey="id"
                            loading={loading}
                            onRowClick={(record) => navigate(record.link)}
                            defaultSort={{ field: "assigned_at", order: "descend" }}
                            pagination={{
                                current: page,
                                pageSize: pageSize,
                                total: filteredItems.length,
                                showTotal: (t) => `Total: ${t} elementos`,
                                showSizeChanger: true,
                                pageSizeOptions: ["10", "20", "50"],
                                onChange: (p, ps) => {
                                    setPage(p);
                                    if (ps !== pageSize) setPageSize(ps);
                                },
                            }}
                            emptyText="No tienes elementos pendientes"
                        />
                    </Card>
                </div>
            </Layout.Content>
        </Layout>
    );
}

export default Worklist;
