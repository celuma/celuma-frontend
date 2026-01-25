/**
 * Lista de Trabajo - Vista unificada para asignaciones y revisiones pendientes del usuario
 * 
 * Esta página muestra:
 * - Asignaciones pendientes (items donde el usuario está asignado)
 * - Revisiones pendientes (reportes que el usuario necesita aprobar/rechazar)
 */
import { useEffect, useState, useCallback, useMemo } from "react";
import { Layout, Card, Tooltip, Input } from "antd";
import { useNavigate } from "react-router-dom";
import type { ColumnsType } from "antd/es/table";
import { 
    UserOutlined, 
    CheckCircleOutlined,
} from "@ant-design/icons";
import SidebarCeluma from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import { tokens, cardStyle, cardTitleStyle } from "../components/design/tokens";
import { getMyWorklist, type WorklistItem, type WorklistResponse } from "../services/worklist_service";
import { CelumaTable } from "../components/ui/celuma_table";
import { usePageTitle } from "../hooks/use_page_title";
import { PatientCell, renderDateCell, renderStatusChip, ItemTypeBadge } from "../components/ui/table_helpers";

function Worklist() {
    usePageTitle();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [items, setItems] = useState<WorklistItem[]>([]);
    const [search, setSearch] = useState("");
    const [statusFilteredValue, setStatusFilteredValue] = useState<React.Key[] | null>(null);

    const loadWorklist = useCallback(async () => {
        setLoading(true);
        try {
            const data: WorklistResponse = await getMyWorklist();
            setItems(data.items);
        } catch (error) {
            console.error("Error cargando lista de trabajo:", error);
        } finally {
            setLoading(false);
        }
    }, []);

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

    // Helper to get item type label (for filters)
    const getItemTypeLabel = (itemType: string) => {
        switch (itemType) {
            case "lab_order": return "Orden";
            case "sample": return "Muestra";
            case "report": return "Reporte";
            default: return itemType;
        }
    };

    // Helper to get kind label
    const getKindLabel = (kind: string) => {
        if (kind === "review") {
            return "Revisión";
        }
        return "Asignación";
    };

    // Helper to render kind chip with consistent styling (integrated icon + text)
    const renderKindChip = (kind: string) => {
        const config = kind === "review" 
            ? { color: "#f59e0b", bg: "#fffbeb", label: "Revisión", icon: <CheckCircleOutlined /> }
            : { color: "#3b82f6", bg: "#eff6ff", label: "Asignación", icon: <UserOutlined /> };

        return (
            <div style={{
                padding: "4px 10px",
                borderRadius: 12,
                background: config.bg,
                color: config.color,
                fontWeight: 600,
                fontSize: 11,
                display: "flex",
                alignItems: "center",
                gap: 4,
                width: "fit-content",
            }}>
                {config.icon}
                {config.label}
            </div>
        );
    };

    // Helper to render status chip based on item type
    const renderWorklistStatusChip = (status: string, itemType: string) => {
        // Determine which config to use based on item_type
        let configType: "order" | "sample" | "report" = "order";
        if (itemType === "sample") {
            configType = "sample";
        } else if (itemType === "report") {
            configType = "report";
        }
        return renderStatusChip(status, configType);
    };

    // Helper to get status label for filters
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

    // Helper to check if a status represents completion
    const isCompletedStatus = useCallback((status: string) => {
        const completedStatuses = ["APPROVED", "READY", "RELEASED", "CLOSED", "PUBLISHED"];
        return completedStatuses.includes(status);
    }, []);

    // Filter items based on search only
    const filteredItems = useMemo(() => {
        let result = items;
        
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
    }, [items, search]);

    // Get unique kinds and types for filters (from all items, not filtered)
    const kindFilters = useMemo(() => {
        const kinds = new Set(items.map(i => i.kind));
        return Array.from(kinds).map(kind => ({
            text: getKindLabel(kind),
            value: kind,
        }));
    }, [items]);

    const typeFilters = useMemo(() => {
        const types = new Set(items.map(i => i.item_type));
        return Array.from(types).map(type => ({
            text: getItemTypeLabel(type),
            value: type,
        }));
    }, [items]);

    const statusFilters = useMemo(() => {
        const statuses = new Set(items.map(i => i.item_status));
        return Array.from(statuses).map(status => ({
            text: getStatusLabel(status),
            value: status,
        }));
    }, [items]);

    // Default filtered values - exclude completed statuses (only on first load)
    const defaultStatusFilteredValue = useMemo(() => {
        const allStatuses = new Set(items.map(i => i.item_status));
        return Array.from(allStatuses).filter(status => !isCompletedStatus(status));
    }, [items, isCompletedStatus]);

    // Set default filter on first load
    useEffect(() => {
        if (items.length > 0 && statusFilteredValue === null) {
            setStatusFilteredValue(defaultStatusFilteredValue);
        }
    }, [items, defaultStatusFilteredValue, statusFilteredValue]);

    // Get unique patients for filters
    const patientFilters = useMemo(() => {
        const patients = new Map<string, string>();
        filteredItems.forEach(item => {
            if (item.patient_id && item.patient_name) {
                patients.set(item.patient_id, item.patient_name);
            }
        });
        return Array.from(patients.entries())
            .sort((a, b) => a[1].localeCompare(b[1]))
            .map(([id, name]) => ({
                text: name,
                value: id,
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
            sorter: (a, b) => {
                const dateA = a.assigned_at ? new Date(a.assigned_at).getTime() : 0;
                const dateB = b.assigned_at ? new Date(b.assigned_at).getTime() : 0;
                return dateA - dateB;
            },
        },
        {
            title: "Código",
            dataIndex: "display_id",
            key: "display_id",
            width: 120,
        },
        {
            title: "Paciente",
            key: "patient",
            sorter: (a, b) => {
                const nameA = a.patient_name || a.patient_code || "";
                const nameB = b.patient_name || b.patient_code || "";
                return nameA.localeCompare(nameB);
            },
            filters: patientFilters,
            onFilter: (value, record) => record.patient_id === value,
            render: (_, record) => {
                if (!record.patient_name) return "—";
                return (
                    <PatientCell
                        patientId={record.patient_id || ""}
                        patientName={record.patient_name || ""}
                        patientCode={record.patient_code || undefined}
                    />
                );
            },
        },
        {
            title: "Tipo",
            key: "item_type",
            width: 120,
            render: (_, record) => <ItemTypeBadge type={record.item_type} />,
            filters: typeFilters,
            onFilter: (value, record) => record.item_type === value,
        },
        {
            title: "Tarea",
            key: "kind",
            width: 120,
            render: (_, record) => renderKindChip(record.kind),
            filters: kindFilters,
            onFilter: (value, record) => record.kind === value,
        },
        {
            title: "Estado",
            dataIndex: "item_status",
            key: "item_status",
            width: 120,
            render: (status, record) => renderWorklistStatusChip(status, record.item_type),
            filters: statusFilters,
            onFilter: (value, record) => record.item_status === value,
            filteredValue: statusFilteredValue as React.Key[] | undefined,
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
                        title={<span style={cardTitleStyle}>Mi Lista de Trabajo</span>}
                        style={cardStyle}
                        extra={
                            <Input.Search
                                allowClear
                                placeholder="Buscar en lista de trabajo"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onSearch={(v) => setSearch(v)}
                                style={{ width: 320 }}
                            />
                        }
                    >
                        <CelumaTable
                            dataSource={filteredItems}
                            columns={columns}
                            rowKey="id"
                            loading={loading}
                            onRowClick={(record) => navigate(record.link as string)}
                            onChange={(_pagination, filters) => {
                                // Handle filter changes
                                if (filters.item_status !== undefined) {
                                    setStatusFilteredValue(filters.item_status as React.Key[] | null);
                                }
                            }}
                            pagination={{
                                pageSize: 20,
                                showTotal: (t) => `Total: ${t} elementos`,
                            }}
                            emptyText="No tienes elementos pendientes"
                            locale={{
                                filterTitle: 'Filtrar',
                                filterConfirm: 'Aceptar',
                                filterReset: 'Limpiar',
                                filterEmptyText: 'Sin filtros',
                                filterCheckall: 'Seleccionar todo',
                                filterSearchPlaceholder: 'Buscar en filtros',
                                emptyText: 'No tienes elementos pendientes',
                                selectAll: 'Seleccionar todo',
                                selectInvert: 'Invertir selección',
                                selectNone: 'Limpiar selección',
                                selectionAll: 'Seleccionar todos',
                                sortTitle: 'Ordenar',
                                expand: 'Expandir fila',
                                collapse: 'Colapsar fila',
                                triggerDesc: 'Clic para ordenar descendente',
                                triggerAsc: 'Clic para ordenar ascendente',
                                cancelSort: 'Clic para cancelar ordenamiento',
                            }}
                        />
                    </Card>
                </div>
            </Layout.Content>
        </Layout>
    );
}

export default Worklist;
