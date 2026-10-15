import { useCallback, useEffect, useMemo, useState } from "react";
import { Layout, Card, Avatar, Tooltip } from "antd";
import CelumaButton from "../components/ui/button";
import { useLocation, useNavigate } from "react-router-dom";
import type { ColumnsType } from "antd/es/table";
import SidebarCeluma from "../components/ui/sidebar_menu";
import type { CelumaKey } from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import ErrorText from "../components/ui/error_text";
import { tokens, cardStyle } from "../components/design/tokens";
import PageHeader from "../components/ui/page_header";
import { CelumaTable } from "../components/ui/table";
import { 
    PatientCell, 
    renderStatusChip, 
    renderLabels, 
    getInitials, 
    getAvatarColor,
    SampleTypeBadge 
} from "../components/ui/table_helpers";
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
import { UNTYPED_FILTER_VALUE, UNTYPED_LABEL, type SampleTypeRef } from "../models/sample_type";

type SampleRow = {
    id: string;
    sample_code: string;
    /** Catalog type; null for a legacy sample ("Sin tipo"). */
    sample_type: SampleTypeRef | null;
    state: string;
    tenant_id: string;
    branch: { id: string; name?: string; code?: string | null };
    order: {
        id: string;
        order_code: string;
        status: string;
        requested_by?: string | null;
        patient?: { id: string; full_name: string; patient_code: string } | null;
    };
    received_at?: string | null;
    labels?: Array<{ id: string; name: string; color: string }>;
    assignees?: Array<{ id: string; name: string; email: string; avatar_url?: string | null }>;
};

/** `GET /v1/laboratory/samples/filter-options`: catalogs over every sample, not one page. */
type SampleFilterOptions = {
    states: string[];
    /** Types referenced by the tenant's samples (deactivated ones marked in the text). */
    sample_types: FilterOption[];
    /** Whether any sample has no type: then "Sin tipo" is offered as a filter choice. */
    has_untyped_samples: boolean;
    orders: FilterOption[];
    patients: FilterOption[];
    labels: FilterOption[];
    assignees: FilterOption[];
};

// Céluma 1.4 (#6): column key → API sort field / filter parameter.
const QUERY_MAP: ColumnQueryMap = {
    sort: { sample_code: "sample_code", order: "order_code", patient: "patient" },
    filters: { order: "order_id", patient: "patient_id", type: "sample_type_id", state: "state", labels: "label_id", assignees: "assignee_id" },
};

const fetchSamples = (query: ListQuery, signal: AbortSignal) =>
    fetchListPage<SampleRow>("/v1/laboratory/samples/", "samples", query, signal);

const patientName = (r: SampleRow) => r.order.patient?.full_name || r.order.patient?.patient_code;

export default function SamplesList() {
    usePageTitle();
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const { hasPermission } = useUserProfile();
    const canCreateSample = hasPermission(PERMS.CREATE_SAMPLE);
    // Céluma 1.4 (#5/#6): one server page at a time. Search, filters, sorting
    // and the total run over the tenant's whole collection on the API; the
    // orders list is no longer downloaded just to repeat the patient and
    // requester the samples response already carries.
    const list = useServerList<SampleRow>({
        fetchPage: fetchSamples,
        pageSize: 10,
        initialSort: { field: "sample_code", order: "asc" },
    });
    const [options, setOptions] = useState<SampleFilterOptions | null>(null);
    const [optionsError, setOptionsError] = useState<string | null>(null);
    useEffect(() => {
        const controller = new AbortController();
        getJSON<SampleFilterOptions>("/v1/laboratory/samples/filter-options", controller.signal)
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

    const stateFilters = useMemo(() => (options?.states ?? []).map((state) => ({
        text: renderStatusChip(state, "sample").props.children,
        value: state,
    })), [options]);
    const typeFilters = useMemo(() => [
        ...(options?.sample_types ?? []).map((t) => ({ text: t.text, value: t.value })),
        ...(options?.has_untyped_samples ? [{ text: UNTYPED_LABEL, value: UNTYPED_FILTER_VALUE }] : []),
    ], [options]);
    const orderFilters = useMemo(() => (options?.orders ?? []).map((o) => ({ text: o.text, value: o.value })), [options]);
    const patientFilters = useMemo(() => (options?.patients ?? []).map((p) => ({ text: p.text, value: p.value })), [options]);
    const labelFilters = useMemo(() => (options?.labels ?? []).map((l) => ({ text: l.text, value: l.value })), [options]);
    const assigneeFilters = useMemo(() => (options?.assignees ?? []).map((u) => ({ text: u.text, value: u.value })), [options]);

    const columns: ColumnsType<SampleRow> = [
        { 
            title: "Código", 
            dataIndex: "sample_code", 
            key: "sample_code", 
            width: 120,
            sorter: true,
            defaultSortOrder: "ascend",
        },
        { 
            title: "Orden", 
            key: "order", 
            width: 120,
            sorter: true,
            filters: orderFilters,
            render: (_, r) => (
                <a
                    href={`/orders/${r.order.id}`}
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        navigate(`/orders/${r.order.id}`);
                    }}
                    style={{ 
                        color: "#0f8b8d", 
                        cursor: "pointer", 
                        fontWeight: 600,
                        textDecoration: "none",
                        borderBottom: "1px dashed #0f8b8d"
                    }}
                >
                    {r.order.order_code}
                </a>
            ),
        },
        { 
            title: "Paciente", 
            key: "patient",
            sorter: true,
            filters: patientFilters,
            render: (_, r) => {
                const name = patientName(r);
                if (!name || !r.order.patient) return "—";
                return (
                    <PatientCell
                        patientId={r.order.patient.id}
                        patientName={name}
                        patientCode={r.order.patient.patient_code}
                    />
                );
            },
        },
        { 
            title: "Tipo", 
            dataIndex: "sample_type", 
            key: "type", 
            width: 160,
            filters: typeFilters,
            render: (sampleType: SampleTypeRef | null) => <SampleTypeBadge sampleType={sampleType} />,
        },
        { 
            title: "Estado", 
            dataIndex: "state", 
            key: "state", 
            width: 120,
            render: (state: string) => renderStatusChip(state, "sample"),
            filters: stateFilters,
        },
        // Shown when any sample of the tenant has labels — not just this page.
        ...(labelFilters.length > 0 ? [{
            title: "Etiquetas",
            key: "labels",
            width: 200,
            filters: labelFilters,
            render: (_: unknown, r: SampleRow) =>
                r.labels && r.labels.length > 0 ? renderLabels(r.labels) : <span style={{ color: "#888", fontSize: 12 }}>—</span>,
        }] : []),
        ...(assigneeFilters.length > 0 ? [{
            title: "Asignados",
            key: "assignees",
            width: 80,
            filters: assigneeFilters,
            render: (_: unknown, r: SampleRow) => {
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
                        title="Muestras"
                        subtitle="Consulta y gestiona las muestras procesadas"
                        extra={
                            // CEL-131-08: the action is offered only to a user whose
                            // effective permissions actually allow it. `/samples/register`
                            // is itself gated on `lab:create_sample`, so before this a
                            // pathologist (who lost the permission) was shown a button
                            // that only ever led to the access-denied screen.
                            canCreateSample ? (
                                <CelumaButton type="primary" onClick={() => navigate("/samples/register")}>
                                    Registrar Muestra
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
                            onRowClick={(record) => navigate(`/samples/${record.id}`)}
                            emptyText="Sin muestras"
                            searchable
                            searchPlaceholder="Buscar en muestras"
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
                                emptyText: 'Sin muestras',
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
