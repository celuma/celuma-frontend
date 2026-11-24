import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Layout, Card, Avatar, Tooltip } from "antd";
import CelumaButton from "../components/ui/button";
import { CheckCircleOutlined, ClockCircleOutlined } from "@ant-design/icons";
import { useLocation, useNavigate } from "react-router-dom";
import type { ColumnsType } from "antd/es/table";
import SidebarCeluma from "../components/ui/sidebar_menu";
import type { CelumaKey } from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import ErrorText from "../components/ui/error_text";
import { tokens, cardStyle, listPageColumnStyle } from "../components/design/tokens";
import PageHeader from "../components/ui/page_header";
import { CelumaTable } from "../components/ui/table";
import { PatientCell, renderStatusChip, renderLabels, renderSampleCodes, getInitials, getAvatarColor } from "../components/ui/table_helpers";
import { usePageTitle } from "../hooks/use_page_title";
import { useUserProfile } from "../hooks/use_user_profile";
import { PERMS } from "../lib/rbac";
import { useServerList } from "../hooks/use_server_list";
import {
    columnQueryToList,
    columnViewState,
    fetchListPage,
    getJSON,
    type ColumnQueryMap,
    type FilterOption,
    type ListQuery,
} from "../services/list_service";
import { useListView } from "../hooks/use_list_view";
import { activeFilters, type ListViewSpec, type ListViewState } from "../lib/list_view_state";
import ReturnedRecordNotice from "../components/lists/returned_record_notice";
import { placementOf } from "../lib/list_return";

type OrdersListResponse = {
    orders: Array<{
        id: string;
        order_code: string;
        status: string;
        tenant_id: string;
        branch: { id: string; name?: string; code?: string | null };
        patient?: { id: string; full_name: string; patient_code: string } | null;
        requesting_physician?: { id: string; full_name: string; physician_code: string; specialty?: string | null; institution?: string | null; email?: string | null } | null;
        /** Every external requesting physician, no primary (Céluma 1.4, #16). */
        requesting_physicians?: Array<{ id: string; full_name: string; physician_code: string }>;
        expediente?: string | null;
        requested_by?: string | null;
        notes?: string | null;
        created_at?: string | null;
        report_id?: string | null;
        invoice_id?: string | null;
        sample_count: number;
        /** Codes of the order's visible samples, in sample-code order; [] without samples (Céluma 1.5, #80). */
        sample_codes?: string[];
        has_report: boolean;
        has_invoice: boolean;
        labels?: Array<{ id: string; name: string; color: string }>;
        assignees?: Array<{ id: string; name: string; email: string; avatar_url?: string | null }>;
    }>;
};

type OrderRow = OrdersListResponse["orders"][number];

/** `GET /v1/laboratory/orders/filter-options`: catalogs over every order, not one page. */
type OrderFilterOptions = {
    statuses: string[];
    patients: FilterOption[];
    requesting_physicians: FilterOption[];
    labels: FilterOption[];
    assignees: FilterOption[];
    has_requester: boolean;
};

// Céluma 1.4 (#6): column key → API sort field / filter parameter.
const QUERY_MAP: ColumnQueryMap = {
    sort: { order_code: "order_code", patient: "patient", requesting_physician: "requester", status: "status" },
    filters: {
        patient: "patient_id",
        requesting_physician: "requesting_physician_id",
        has_report: "has_report",
        has_invoice: "has_invoice",
        status: "status",
        labels: "label_id",
        assignees: "assignee_id",
    },
    booleanFilters: ["has_report", "has_invoice"],
};

// Céluma 1.5 (#66): the view kept in the URL, with the API's parameter names.
const ORDERS_VIEW: ListViewSpec = {
    sortFields: ["order_code", "patient", "requester", "status"],
    defaultSort: { field: "order_code", order: "asc" },
    filterNames: Object.values(QUERY_MAP.filters),
};
const fetchOrders = (query: ListQuery, signal: AbortSignal) =>
    fetchListPage<OrderRow>("/v1/laboratory/orders/", "orders", query, signal);

export default function OrdersList() {
    usePageTitle();
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const { hasPermission } = useUserProfile();
    const canCreateOrder = hasPermission(PERMS.CREATE_ORDER);
    // Céluma 1.5 (#66): search, filters, sort and page live in the URL (dashboard links such as
    // ?status=RECEIVED,PROCESSING included), so Back and "Volver a Órdenes" reopen the same view.
    const replaceViewRef = useRef<(view: ListViewState) => void>(() => undefined);
    const view = useListView("orders", ORDERS_VIEW, (next) => replaceViewRef.current(next));
    // Céluma 1.4 (#5/#6): one server page at a time; search, filters, sorting
    // and the total run over the tenant's whole collection on the API.
    const list = useServerList<OrderRow>({
        fetchPage: fetchOrders,
        pageSize: 10,
        initialSort: view.initialView.sort,
        initialFilters: activeFilters(view.initialView.filters),
        initialSearch: view.initialView.q,
        initialPage: view.initialView.page,
        locate: view.returned?.id,
    });
    replaceViewRef.current = (next) =>
        list.replaceView({ search: next.q, page: next.page, sort: next.sort, filters: activeFilters(next.filters) });
    const { syncUrl, markReady } = view;
    useEffect(() => {
        syncUrl({ q: list.search, page: list.page, sort: list.sort, filters: list.filters });
    }, [syncUrl, list.search, list.page, list.sort, list.filters]);
    useEffect(() => {
        if (!list.loading) markReady();
    }, [list.loading, markReady]);
    const [noticeOpen, setNoticeOpen] = useState(view.returned !== null);
    const returnedPlacement = placementOf(view.returned, list.located, list.page);
    const header = columnViewState(QUERY_MAP, list);
    const [options, setOptions] = useState<OrderFilterOptions | null>(null);
    const [optionsError, setOptionsError] = useState<string | null>(null);
    useEffect(() => {
        const controller = new AbortController();
        getJSON<OrderFilterOptions>("/v1/laboratory/orders/filter-options", controller.signal)
            .then(setOptions)
            .catch((err) => {
                if (!controller.signal.aborted) setOptionsError(err instanceof Error ? err.message : "Ocurrió un error inesperado.");
            });
        return () => controller.abort();
    }, []);
    const error = list.error ?? optionsError;
    const { setQuery, setSearch } = list;
    const onQueryChange = useCallback(
        (next: Parameters<typeof columnQueryToList>[0]) => {
            setNoticeOpen(false);
            setQuery(columnQueryToList(next, QUERY_MAP));
        },
        [setQuery],
    );
    const onSearchChange = useCallback((q: string) => {
        setNoticeOpen(false);
        setSearch(q);
    }, [setSearch]);

    const statusFilters = useMemo(() => (options?.statuses ?? []).map((status) => ({
        text: renderStatusChip(status, "order").props.children,
        value: status,
    })), [options]);
    const labelFilters = useMemo(() => (options?.labels ?? []).map((l) => ({ text: l.text, value: l.value })), [options]);
    const assigneeFilters = useMemo(() => (options?.assignees ?? []).map((u) => ({ text: u.text, value: u.value })), [options]);
    const patientFilters = useMemo(() => (options?.patients ?? []).map((p) => ({ text: p.text, value: p.value })), [options]);
    const requestingPhysicianFilters = useMemo(
        () => (options?.requesting_physicians ?? []).map((p) => ({ text: p.text, value: p.value })),
        [options],
    );

    const columns: ColumnsType<OrderRow> = [
        { 
            title: "Código", 
            dataIndex: "order_code", 
            key: "order_code", 
            width: 120,
            sorter: true,
            sortOrder: header.sortOrder("order_code"),
        },
        // Céluma 1.5 (#80): every visible sample's code; the server search also matches each one.
        {
            title: "Códigos de muestra",
            key: "sample_codes",
            width: 220,
            render: (_: unknown, r: OrderRow) => renderSampleCodes(r.sample_codes),
        },
        { 
            title: "Paciente", 
            key: "patient",
            sorter: true,
            sortOrder: header.sortOrder("patient"),
            filters: patientFilters,
            filteredValue: header.filteredValue("patient"),
            render: (_, r) => {
                if (!r.patient?.full_name || !r.patient?.id) return <span style={{ color: "#888" }}>—</span>;
                return (
                    <PatientCell
                        patientId={r.patient.id}
                        patientName={r.patient.full_name}
                        patientCode={r.patient.patient_code}
                    />
                );
            },
        },
        // Shown when any order of the tenant names a requester — not just this page.
        ...((options?.has_requester) ? [{
            title: "Solicitante",
            key: "requesting_physician",
            width: 220,
            filters: requestingPhysicianFilters.length > 0 ? requestingPhysicianFilters : undefined,
            filteredValue: header.filteredValue("requesting_physician"),
            sorter: true,
            sortOrder: header.sortOrder("requesting_physician"),
            render: (_: unknown, r: OrderRow) => {
                const physicians = r.requesting_physicians ?? [];
                if (physicians.length > 0) {
                    return (
                        <div>
                            {physicians.map((physician) => (
                                <div key={physician.id}>
                                    <a
                                        href={`/requesting-physicians/${physician.id}`}
                                        onClick={(event) => {
                                            event.preventDefault();
                                            event.stopPropagation();
                                            navigate(`/requesting-physicians/${physician.id}`);
                                        }}
                                        style={{ fontWeight: 600, color: "#49b6ad", borderBottom: "1px dashed #49b6ad", display: "inline-block", textDecoration: "none", cursor: "pointer" }}
                                    >
                                        {physician.full_name}
                                    </a>
                                    <div style={{ fontSize: 11, color: "#888" }}>{physician.physician_code}</div>
                                </div>
                            ))}
                            {r.expediente && <div style={{ fontSize: 11, color: "#888" }}>Expediente {r.expediente}</div>}
                        </div>
                    );
                }
                if (r.expediente && !r.requested_by) return <span>Expediente {r.expediente}</span>;
                return r.requested_by ? <span>{r.requested_by}</span> : <span style={{ color: "#888" }}>—</span>;
            },
        }] : []),
        { 
            title: "Reporte", 
            dataIndex: "has_report", 
            key: "has_report", 
            width: 40,
            align: "center" as const,
            render: (v: boolean) => v ? (
                <CheckCircleOutlined style={{ color: "#10b981", fontSize: 16 }} />
            ) : (
                <ClockCircleOutlined style={{ color: "#f59e0b", fontSize: 16 }} />
            ),
            filters: [
                { text: "Con Reporte", value: "true" },
                { text: "Sin Reporte", value: "false" },
            ],
            filteredValue: header.filteredValue("has_report"),
        },
        { 
            title: "Factura", 
            dataIndex: "has_invoice", 
            key: "has_invoice", 
            width: 40,
            align: "center" as const,
            render: (v: boolean, record) => {
                const icon = v ? (
                    <CheckCircleOutlined style={{ color: "#10b981", fontSize: 16 }} />
                ) : (
                    <ClockCircleOutlined style={{ color: "#f59e0b", fontSize: 16 }} />
                );
                
                if (v && hasPermission("billing:read")) {
                    return (
                        <div
                            onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/billing/${record.id}`);
                            }}
                            style={{ cursor: "pointer" }}
                        >
                            {icon}
                        </div>
                    );
                }

                return icon;
            },
            filters: [
                { text: "Con Factura", value: "true" },
                { text: "Sin Factura", value: "false" },
            ],
            filteredValue: header.filteredValue("has_invoice"),
        },
        { 
            title: "Estado", 
            dataIndex: "status", 
            key: "status", 
            width: 120,
            render: (status: string) => renderStatusChip(status, "order"),
            filters: statusFilters,
            filteredValue: header.filteredValue("status"),
            sorter: true,
            sortOrder: header.sortOrder("status"),
        },
        ...(labelFilters.length > 0 ? [{
            title: "Etiquetas",
            key: "labels",
            width: 200,
            filters: labelFilters,
            filteredValue: header.filteredValue("labels"),
            render: (_: unknown, r: OrderRow) =>
                r.labels && r.labels.length > 0 ? renderLabels(r.labels) : <span style={{ color: "#888", fontSize: 12 }}>—</span>,
        }] : []),
        ...(assigneeFilters.length > 0 ? [{
            title: "Asignados",
            key: "assignees",
            width: 80,
            filters: assigneeFilters,
            filteredValue: header.filteredValue("assignees"),
            render: (_: unknown, r: OrderRow) => {
                if (!r.assignees || r.assignees.length === 0) return <span style={{ color: "#888" }}>—</span>;
                return (
                    <Avatar.Group maxCount={3} size="small">
                        {r.assignees.map(user => (
                            <Tooltip key={user.id} title={user.name}>
                                <Avatar 
                                    size={24}
                                    src={user.avatar_url}
                                    style={{ 
                                        backgroundColor: user.avatar_url ? undefined : getAvatarColor(user.name),
                                        fontSize: 10,
                                    }}
                                >
                                    {!user.avatar_url && getInitials(user.name)}
                                </Avatar>
                            </Tooltip>
                        ))}
                    </Avatar.Group>
                );
            },
        }] : []),
    ];

    return (
        <Layout style={{ minHeight: "100vh", padding: 0, margin: 0 }}>
            <SidebarCeluma
                selectedKey={(pathname as CelumaKey) ?? "/home"}
                onNavigate={(k) => navigate(k)}
                logoSrc={logo}
            />
            <Layout.Content style={{ padding: tokens.contentPadding, background: tokens.bg, fontFamily: tokens.textFont }}>
                <div style={listPageColumnStyle}>
                    <PageHeader
                        title="Órdenes"
                        subtitle="Consulta y gestiona las órdenes de laboratorio"
                        // R5 (CEL-131-08): `POST /laboratory/orders/` requires
                        // `lab:create_order`, which a pathologist does not
                        // hold. The CTA used to render for everyone and only
                        // failed at the end of the registration form.
                        extra={
                            canCreateOrder ? (
                                <CelumaButton type="primary" onClick={() => navigate("/orders/register")}>
                                    Nueva Orden
                                </CelumaButton>
                            ) : undefined
                        }
                    />
                    <Card style={cardStyle}>
                        {noticeOpen && view.returned && returnedPlacement && (
                            <ReturnedRecordNotice
                                subject={`La orden ${view.returned.label ?? ""}`.trim()}
                                placement={returnedPlacement}
                                onGoToPage={list.setPage}
                                onOpen={() => view.returned && view.openRecord(`/orders/${view.returned.id}`, view.returned)}
                                onClearFilters={() => {
                                    setNoticeOpen(false);
                                    list.replaceView({ search: "", page: 1, sort: list.sort, filters: {} });
                                }}
                                onDismiss={() => setNoticeOpen(false)}
                                filtered={list.search.trim() !== "" || Object.keys(list.filters).length > 0}
                            />
                        )}
                        <CelumaTable
                            dataSource={list.rows}
                            columns={columns}
                            rowKey={(r) => r.id}
                            loading={list.loading}
                            rowClassName={(r) => (view.returned && r.id === view.returned.id ? "celuma-row-returned" : "")}
                            onRowClick={(record) => view.openRecord(`/orders/${record.id}`, { id: record.id, label: record.order_code })}
                            emptyText="Sin casos"
                            searchable
                            searchPlaceholder="Buscar en órdenes"
                            pagination={{ pageSize: list.pageSize }}
                            server={{
                                total: list.total,
                                page: list.page,
                                pageSize: list.pageSize,
                                onPageChange: list.setPage,
                                search: list.search,
                                onSearchChange,
                                onQueryChange,
                            }}
                            locale={{
                                filterTitle: 'Filtrar',
                                filterConfirm: 'Aceptar',
                                filterReset: 'Limpiar',
                                filterEmptyText: 'Sin filtros',
                                filterCheckAll: 'Seleccionar todo',
                                filterSearchPlaceholder: 'Buscar en filtros',
                                emptyText: 'Sin casos',
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
                        {error && <ErrorText>{error}</ErrorText>}
                    </Card>
                </div>
            </Layout.Content>
        </Layout>
    );
}
