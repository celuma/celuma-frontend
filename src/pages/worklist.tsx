/**
 * Worklist - Unified view of the user's pending assignments and reviews.
 *
 * This page shows:
 * - Pending assignments (items assigned to the user)
 * - Pending reviews (reports the user needs to approve or reject)
 */
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Layout, Card, Tooltip } from "antd";
import { useNavigate } from "react-router-dom";
import type { ColumnsType } from "antd/es/table";
import { 
    UserOutlined, 
    CheckCircleOutlined,
} from "@ant-design/icons";
import SidebarCeluma from "../components/ui/sidebar_menu";
import PageHeader from "../components/ui/page_header";
import logo from "../images/celuma-isotipo.png";
import { tokens, cardStyle, listPageColumnStyle } from "../components/design/tokens";
import { getMyWorklist, type WorklistItem, type WorklistResponse } from "../services/worklist_service";
import { matchesQuery, validateSearchQuery } from "../lib/search";
import { CelumaTable } from "../components/ui/table";
import { usePageTitle } from "../hooks/use_page_title";
import { PatientCell, renderDateCell, renderStatusChip, ItemTypeBadge } from "../components/ui/table_helpers";
import { useListView } from "../hooks/use_list_view";
import type { ListViewSpec, ListViewState } from "../lib/list_view_state";
import type { ReturnedPlacement } from "../lib/list_return";
import ReturnedRecordNotice from "../components/lists/returned_record_notice";

/** The API's maximum page size, to fetch the whole worklist in few requests. */
const WORKLIST_PAGE_SIZE = 100;
/** Rows per table page (unchanged from 1.4). */
const TABLE_PAGE_SIZE = 20;

/**
 * Céluma 1.5 (#66): the worklist still searches, filters and sorts in the browser over the
 * whole per-user list, but its view is now controlled and kept in the URL (column keys as
 * parameter names), so Back and "Volver a Lista de trabajo" reopen the same view. A present
 * but empty `item_status=` means the user cleared the default status filter.
 */
const WORKLIST_VIEW: ListViewSpec = {
    sortFields: ["assigned_at", "patient"],
    defaultSort: null,
    filterNames: ["patient", "item_type", "kind", "item_status"],
};

const COMPLETED_STATUSES = ["APPROVED", "READY", "RELEASED", "CLOSED", "PUBLISHED"];

const patientSortName = (item: WorklistItem) => item.patient_name || item.patient_code || "";
const assignedTime = (item: WorklistItem) => (item.assigned_at ? new Date(item.assigned_at).getTime() : 0);
const ITEM_FIELDS: Record<string, (item: WorklistItem) => string | null | undefined> = {
    patient: (i) => i.patient_id,
    item_type: (i) => i.item_type,
    kind: (i) => i.kind,
    item_status: (i) => i.item_status,
};

/** The rows of `view` over `items`, with the same predicates the table applied before 1.5. */
function worklistRows(items: WorklistItem[], view: ListViewState): WorklistItem[] {
    let rows = items.filter((item) => Object.entries(view.filters).every(([name, values]) => {
        const field = ITEM_FIELDS[name];
        return !field || values.length === 0 || values.includes(String(field(item) ?? ""));
    }));
    const q = view.q.trim();
    if (q && !validateSearchQuery(q)) {
        rows = rows.filter((item) => matchesQuery([item.display_id, item.patient_name, item.patient_code, item.order_code, item.tags], q));
    }
    const sort = view.sort;
    if (sort) {
        const compare = sort.field === "patient"
            ? (a: WorklistItem, b: WorklistItem) => patientSortName(a).localeCompare(patientSortName(b))
            : (a: WorklistItem, b: WorklistItem) => assignedTime(a) - assignedTime(b);
        rows = [...rows].sort((a, b) => (sort.order === "desc" ? -compare(a, b) : compare(a, b)));
    }
    return rows;
}

function Worklist() {
    usePageTitle();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [items, setItems] = useState<WorklistItem[]>([]);
    const setViewRef = useRef<(view: ListViewState) => void>(() => undefined);
    const listView = useListView("worklist", WORKLIST_VIEW, (next) => setViewRef.current(next));
    const [view, setView] = useState<ListViewState>(listView.initialView);
    setViewRef.current = setView;
    const [noticeOpen, setNoticeOpen] = useState(listView.returned !== null);

    const loadWorklist = useCallback(async () => {
        setLoading(true);
        try {
            // Céluma 1.4 (#6/#7): the API pages the worklist (20 items unless
            // asked otherwise), while this table searches, filters and pages in
            // the browser. Loading only the first page hid every item after the
            // 20th from the table, its search and its total.
            const all: WorklistItem[] = [];
            for (let page = 1; ; page++) {
                const data: WorklistResponse = await getMyWorklist({ page, page_size: WORKLIST_PAGE_SIZE });
                all.push(...data.items);
                if (!data.has_more || data.items.length === 0) break;
            }
            setItems(all);
        } catch (error) {
            console.error("Error cargando lista de trabajo:", error);
        } finally {
            setLoading(false);
            setLoaded(true);
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

    // Default status filter — every present status except the completed ones — once the first
    // load has items, unless the view (URL) already carries a status choice, even an empty one.
    // Applied in the same render as the items, so no unfiltered list is ever shown or left.
    if (loaded && items.length > 0 && view.filters.item_status === undefined) {
        const statuses = Array.from(new Set(items.map(i => i.item_status)));
        setView({ ...view, filters: { ...view.filters, item_status: statuses.filter((st) => !COMPLETED_STATUSES.includes(st)) } });
    }

    const rows = useMemo(() => worklistRows(items, view), [items, view]);
    const lastPage = Math.max(1, Math.ceil(rows.length / TABLE_PAGE_SIZE));
    const page = Math.min(view.page, lastPage);
    const pageRows = useMemo(() => rows.slice((page - 1) * TABLE_PAGE_SIZE, page * TABLE_PAGE_SIZE), [rows, page]);

    // A page past the end (fewer items now) is clamped, as on the server lists.
    useEffect(() => {
        if (loaded && view.page > lastPage) setView((v) => ({ ...v, page: lastPage }));
    }, [loaded, view.page, lastPage]);

    const { syncUrl, markReady } = listView;
    useEffect(() => {
        if (loaded) syncUrl(view);
    }, [loaded, view, syncUrl]);
    useEffect(() => {
        if (loaded && !loading) markReady();
    }, [loaded, loading, markReady]);

    const returnedPlacement = useMemo((): ReturnedPlacement | null => {
        const returned = listView.returned;
        if (!returned || !loaded) return null;
        if (!items.some((i) => i.id === returned.id)) return { kind: "not_listed" };
        const index = rows.findIndex((i) => i.id === returned.id);
        if (index < 0) return { kind: "no_match" };
        const at = Math.floor(index / TABLE_PAGE_SIZE) + 1;
        return at === page ? { kind: "here" } : { kind: "other_page", page: at };
    }, [listView.returned, loaded, items, rows, page]);

    const setPage = (next: number) => setView((v) => ({ ...v, page: Math.max(1, next) }));
    const sortOrderOf = (key: string) => (view.sort?.field === key ? (view.sort.order === "desc" ? "descend" as const : "ascend" as const) : null);
    const filteredValueOf = (key: string) => (view.filters[key]?.length ? view.filters[key] : null);

    // Get unique patients for filters
    const patientFilters = useMemo(() => {
        const patients = new Map<string, string>();
        items.forEach(item => {
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
    }, [items]);

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
            sorter: true,
            sortOrder: sortOrderOf("assigned_at"),
        },
        {
            title: "Código",
            key: "display_id",
            width: 120,
            render: (_, record) => record.order_code || record.display_id,
        },
        {
            title: "Paciente",
            key: "patient",
            sorter: true,
            sortOrder: sortOrderOf("patient"),
            filters: patientFilters,
            filteredValue: filteredValueOf("patient"),
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
            filteredValue: filteredValueOf("item_type"),
        },
        {
            title: "Tarea",
            key: "kind",
            width: 120,
            render: (_, record) => renderKindChip(record.kind),
            filters: kindFilters,
            filteredValue: filteredValueOf("kind"),
        },
        {
            title: "Estado",
            dataIndex: "item_status",
            key: "item_status",
            width: 120,
            render: (status, record) => renderWorklistStatusChip(status, record.item_type),
            filters: statusFilters,
            filteredValue: filteredValueOf("item_status"),
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
                <div style={listPageColumnStyle}>
                    <PageHeader title="Mi Lista de Trabajo" subtitle="Tus asignaciones y revisiones pendientes" />
                    <Card style={cardStyle}>
                        {noticeOpen && listView.returned && returnedPlacement && (
                            <ReturnedRecordNotice
                                subject={`El elemento ${listView.returned.label ?? ""}`.trim()}
                                placement={returnedPlacement}
                                onGoToPage={setPage}
                                onOpen={() => {
                                    const returned = items.find((i) => i.id === listView.returned?.id);
                                    if (returned) listView.openRecord(returned.link, { id: returned.id, label: listView.returned?.label });
                                }}
                                onClearFilters={() => {
                                    setNoticeOpen(false);
                                    setView((v) => ({ ...v, q: "", page: 1, filters: { item_status: [] } }));
                                }}
                                onDismiss={() => setNoticeOpen(false)}
                                filtered={view.q.trim() !== "" || Object.values(view.filters).some((v) => v.length > 0)}
                            />
                        )}
                        <CelumaTable
                            dataSource={pageRows}
                            columns={columns}
                            rowKey="id"
                            loading={loading}
                            rowClassName={(r) => (listView.returned && r.id === listView.returned.id ? "celuma-row-returned" : "")}
                            onRowClick={(record) => listView.openRecord(record.link as string, { id: record.id, label: record.order_code || record.display_id })}
                            searchable
                            searchPlaceholder="Buscar en lista de trabajo"
                            pagination={{ pageSize: TABLE_PAGE_SIZE }}
                            server={{
                                total: rows.length,
                                page,
                                pageSize: TABLE_PAGE_SIZE,
                                onPageChange: setPage,
                                search: view.q,
                                onSearchChange: (q) => {
                                    setNoticeOpen(false);
                                    setView((v) => ({ ...v, q, page: 1 }));
                                },
                                onQueryChange: (next) => {
                                    setNoticeOpen(false);
                                    const filters: Record<string, string[]> = {};
                                    for (const name of WORKLIST_VIEW.filterNames) {
                                        const values = next.filters[name] ?? [];
                                        // A cleared status filter stays explicit, so the default does not come back.
                                        if (values.length || name === "item_status") filters[name] = values;
                                    }
                                    setView((v) => ({ ...v, sort: next.sort, filters, page: 1 }));
                                },
                            }}
                            emptyText="No tienes elementos pendientes"
                            locale={{
                                filterTitle: 'Filtrar',
                                filterConfirm: 'Aceptar',
                                filterReset: 'Limpiar',
                                filterEmptyText: 'Sin filtros',
                                filterCheckAll: 'Seleccionar todo',
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
