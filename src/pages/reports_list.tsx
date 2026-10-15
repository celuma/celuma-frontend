import { useCallback, useEffect, useMemo, useState } from "react";
import { Layout, Card, Avatar, Tooltip } from "antd";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import type { ColumnsType } from "antd/es/table";
import SidebarCeluma from "../components/ui/sidebar_menu";
import type { CelumaKey } from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import ErrorText from "../components/ui/error_text";
import { tokens, cardStyle } from "../components/design/tokens";
import PageHeader from "../components/ui/page_header";
import { CelumaTable } from "../components/ui/table";
import { PatientCell, renderStatusChip, getInitials, getAvatarColor } from "../components/ui/table_helpers";
import { usePageTitle } from "../hooks/use_page_title";
import { useServerList } from "../hooks/use_server_list";
import {
    columnQueryToList,
    fetchListPage,
    getJSON,
    type ColumnQueryMap,
    type FilterOption,
    type ListQuery,
} from "../services/list_service";

type ReportsListResponse = {
    reports: Array<{
        id: string;
        status: string;
        tenant_id: string;
        branch: { id: string; name?: string; code?: string | null };
        order: {
            id: string;
            order_code: string;
            status: string;
            requested_by?: string | null;
            patient?: { id: string; full_name: string; patient_code: string };
        };
        title?: string | null;
        diagnosis_text?: string | null;
        published_at?: string | null;
        created_at?: string | null;
        created_by?: string | null;
        signed_by?: string | null;
        signed_at?: string | null;
        version_no?: number | null;
        has_pdf: boolean;
        reviewers?: Array<{ id: string; name: string; email: string; avatar_url?: string | null; status: string; review_id?: string | null }>;
    }>;
};

type ReportRow = ReportsListResponse["reports"][number];

/** `GET /v1/reports/filter-options`: catalogs over every report, not one page. */
type ReportFilterOptions = {
    statuses: string[];
    patients: FilterOption[];
    reviewers: FilterOption[];
};

// Céluma 1.4 (#6): column key → API sort field / filter parameter.
const QUERY_MAP: ColumnQueryMap = {
    sort: { order: "order_code", patient: "patient", title: "title", status: "status" },
    filters: { patient: "patient_id", status: "status", reviewers: "reviewer_id" },
};

const fetchReports = (query: ListQuery, signal: AbortSignal) =>
    fetchListPage<ReportRow>("/v1/reports/", "reports", query, signal);

export default function ReportsList() {
    usePageTitle();
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const [searchParams] = useSearchParams();
    // Status filter, optionally seeded from the URL (?status=DRAFT) e.g. when arriving from the dashboard cards
    const [initialStatus] = useState<string[] | null>(() => {
        const s = searchParams.get("status");
        return s ? s.split(",") : null;
    });
    // Céluma 1.4 (#5/#6): one server page at a time; search, filters, sorting
    // and the total run over the tenant's whole collection on the API.
    const list = useServerList<ReportRow>({
        fetchPage: fetchReports,
        pageSize: 10,
        initialSort: { field: "order_code", order: "asc" },
        initialFilters: initialStatus ? { status: initialStatus } : {},
    });
    const statusFilter = list.filters.status ?? null;
    const [options, setOptions] = useState<ReportFilterOptions | null>(null);
    const [optionsError, setOptionsError] = useState<string | null>(null);
    useEffect(() => {
        const controller = new AbortController();
        getJSON<ReportFilterOptions>("/v1/reports/filter-options", controller.signal)
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
        text: renderStatusChip(status, "report").props.children,
        value: status,
    })), [options]);
    const reviewerFilters = useMemo(() => (options?.reviewers ?? []).map((r) => ({ text: r.text, value: r.value })), [options]);
    const patientFilters = useMemo(() => (options?.patients ?? []).map((p) => ({ text: p.text, value: p.value })), [options]);

    const columns: ColumnsType<ReportRow> = [
        { 
            title: "Código", 
            key: "order", 
            width: 120,
            render: (_, r) => (
                <span 
                style={{ 
                    color: "#0f8b8d", 
                    cursor: "pointer", 
                    fontWeight: 600,
                    textDecoration: "none",
                    borderBottom: "1px dashed #0f8b8d"
                }}
                    onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/orders/${r.order.id}`);
                    }}
                >
                    {r.order.order_code}
                </span>
            ),
            sorter: true,
            defaultSortOrder: "ascend",
        },
        { 
            title: "Paciente", 
            key: "patient",
            sorter: true,
            filters: patientFilters,
            render: (_, r) => {
                const patientName = r.order.patient?.full_name || r.order.patient?.patient_code;
                if (!patientName || !r.order.patient) return "—";
                return (
                    <PatientCell
                        patientId={r.order.patient.id}
                        patientName={patientName}
                        patientCode={r.order.patient.patient_code}
                    />
                );
            },
        },
        { 
            title: "Título", 
            dataIndex: "title", 
            key: "title",
            render: (title: string | null) => title || <span style={{ color: "#888" }}>Sin título</span>,
            sorter: true,
        },
        { 
            title: "Estado", 
            dataIndex: "status", 
            key: "status", 
            width: 120,
            render: (status: string) => renderStatusChip(status, "report"),
            filters: statusFilters,
            filteredValue: statusFilter,
            sorter: true,
        },
        // Shown when any report of the tenant has reviewers — not just this page.
        ...(reviewerFilters.length > 0 ? [{
            title: "Revisores",
            key: "reviewers",
            width: 80,
            filters: reviewerFilters,
            render: (_: unknown, r: ReportRow) => {
                if (!r.reviewers || r.reviewers.length === 0) return <span style={{ color: "#888" }}>—</span>;
                return (
                    <Avatar.Group maxCount={3} size="small">
                        {r.reviewers.map(reviewer => (
                            <Tooltip key={reviewer.id} title={`${reviewer.name} (${reviewer.status})`}>
                                <Avatar 
                                    size={24}
                                    src={reviewer.avatar_url}
                                    style={{ 
                                        backgroundColor: reviewer.avatar_url ? undefined : getAvatarColor(reviewer.name),
                                        fontSize: 10,
                                    }}
                                >
                                    {!reviewer.avatar_url && getInitials(reviewer.name)}
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
                    <PageHeader title="Reportes" subtitle="Consulta y gestiona los reportes generados" />
                    <Card style={cardStyle}>
                        <CelumaTable
                            dataSource={list.rows}
                            columns={columns}
                            rowKey={(r) => r.id}
                            loading={list.loading}
                            onRowClick={(record) => navigate(`/reports/${record.id}`)}
                            emptyText="Sin reportes"
                            searchable
                            searchPlaceholder="Buscar en reportes"
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
                                emptyText: 'Sin reportes',
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
