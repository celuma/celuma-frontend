import { useCallback, useEffect, useMemo, useState } from "react";
import { Layout, Card, Avatar, Tooltip } from "antd";
import CelumaButton from "../components/ui/button";
import { CheckCircleOutlined, ClockCircleOutlined } from "@ant-design/icons";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import type { ColumnsType } from "antd/es/table";
import SidebarCeluma from "../components/ui/sidebar_menu";
import type { CelumaKey } from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import ErrorText from "../components/ui/error_text";
import { tokens, cardStyle } from "../components/design/tokens";
import PageHeader from "../components/ui/page_header";
import { CelumaTable } from "../components/ui/table";
import { PatientCell, renderStatusChip, renderLabels, getInitials, getAvatarColor } from "../components/ui/table_helpers";
import { usePageTitle } from "../hooks/use_page_title";
import { useUserProfile } from "../hooks/use_user_profile";
import { PERMS } from "../lib/rbac";
import { useServerList } from "../hooks/use_server_list";
import {
    columnQueryToList,
    fetchListPage,
    getJSON,
    type ColumnQueryMap,
    type FilterOption,
    type ListQuery,
} from "../services/list_service";

type OrdersListResponse = {
    orders: Array<{
        id: string;
        order_code: string;
        status: string;
        tenant_id: string;
        branch: { id: string; name?: string; code?: string | null };
        patient?: { id: string; full_name: string; patient_code: string } | null;
        requesting_physician?: { id: string; full_name: string; physician_code: string; specialty?: string | null; institution?: string | null; email?: string | null } | null;
        requested_by?: string | null;
        notes?: string | null;
        created_at?: string | null;
        report_id?: string | null;
        invoice_id?: string | null;
        sample_count: number;
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

const fetchOrders = (query: ListQuery, signal: AbortSignal) =>
    fetchListPage<OrderRow>("/v1/laboratory/orders/", "orders", query, signal);

export default function OrdersList() {
    usePageTitle();
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const [searchParams] = useSearchParams();
    const { hasPermission } = useUserProfile();
    const canCreateOrder = hasPermission(PERMS.CREATE_ORDER);
    // Status filter, optionally seeded from the URL (?status=RECEIVED,PROCESSING) e.g. when arriving from the dashboard cards
    const [initialStatus] = useState<string[] | null>(() => {
        const s = searchParams.get("status");
        return s ? s.split(",") : null;
    });
    // Céluma 1.4 (#5/#6): one server page at a time; search, filters, sorting
    // and the total run over the tenant's whole collection on the API.
    const list = useServerList<OrderRow>({
        fetchPage: fetchOrders,
        pageSize: 10,
        initialSort: { field: "order_code", order: "asc" },
        initialFilters: initialStatus ? { status: initialStatus } : {},
    });
    const statusFilter = list.filters.status ?? null;
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
    const { setQuery } = list;
    const onQueryChange = useCallback(
        (next: Parameters<typeof columnQueryToList>[0]) => setQuery(columnQueryToList(next, QUERY_MAP)),
        [setQuery],
    );

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
            defaultSortOrder: "ascend",
        },
        { 
            title: "Paciente", 
            key: "patient",
            sorter: true,
            filters: patientFilters,
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
        ...(options?.has_requester ? [{
            title: "Solicitante",
            key: "requesting_physician",
            width: 220,
            filters: requestingPhysicianFilters.length > 0 ? requestingPhysicianFilters : undefined,
            sorter: true,
            render: (_: unknown, r: OrderRow) => {
                if (r.requesting_physician) {
                    return (
                        <div>
                            <a
                                href={`/requesting-physicians/${r.requesting_physician.id}`}
                                onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    navigate(`/requesting-physicians/${r.requesting_physician?.id}`);
                                }}
                                style={{ fontWeight: 600, color: "#49b6ad", borderBottom: "1px dashed #49b6ad", display: "inline-block", textDecoration: "none", cursor: "pointer" }}
                            >
                                {r.requesting_physician.full_name}
                            </a>
                            <div style={{ fontSize: 11, color: "#888" }}>{r.requesting_physician.physician_code}</div>
                        </div>
                    );
                }
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
        },
        { 
            title: "Estado", 
            dataIndex: "status", 
            key: "status", 
            width: 120,
            render: (status: string) => renderStatusChip(status, "order"),
            filters: statusFilters,
            filteredValue: statusFilter,
            sorter: true,
        },
        ...(labelFilters.length > 0 ? [{
            title: "Etiquetas",
            key: "labels",
            width: 200,
            filters: labelFilters,
            render: (_: unknown, r: OrderRow) =>
                r.labels && r.labels.length > 0 ? renderLabels(r.labels) : <span style={{ color: "#888", fontSize: 12 }}>—</span>,
        }] : []),
        ...(assigneeFilters.length > 0 ? [{
            title: "Asignados",
            key: "assignees",
            width: 80,
            filters: assigneeFilters,
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
                <div style={{ maxWidth: tokens.maxWidth, margin: "0 auto", display: "grid", gap: tokens.gap }}>
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
                        <CelumaTable
                            dataSource={list.rows}
                            columns={columns}
                            rowKey={(r) => r.id}
                            loading={list.loading}
                            onRowClick={(record) => navigate(`/orders/${record.id}`)}
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
                                onSearchChange: list.setSearch,
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
