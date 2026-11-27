/**
 * Mi Lista de Trabajo — the user's assignments and reviews (Céluma 1.5, #85).
 *
 * Contract: celuma-engineering/specs/lists/search-and-pagination.md ("Mi Lista de Trabajo").
 *  - One request loads the whole personal worklist from one API snapshot (`scope=all`); a newer
 *    request always wins and an older answer is dropped, and a failed load never changes rows.
 *  - "Pendientes" (default) shows the rows whose step falls to the user now (`next_step`, from the
 *    approval/signing contracts or an open record); "Todas" every row still in the worklist.
 *  - Membership, filters, search, order, count, range and page all come from `deriveWorklist`
 *    over that one collection, so they always agree.
 *  - The view lives in the URL (#66): Back and "Volver a Lista de trabajo" reopen it with its
 *    scroll position; pre-1.5 links keep their status filter (see `lib/worklist_view.ts`).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Card, Grid, Layout } from "antd";
import { useNavigate } from "react-router-dom";
import type { ColumnsType } from "antd/es/table";
import { CloseOutlined, ExclamationCircleOutlined, FilterOutlined, InboxOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import SidebarCeluma from "../components/ui/sidebar_menu";
import PageHeader from "../components/ui/page_header";
import logo from "../images/celuma-isotipo.png";
import { tokens, cardStyle, listPageColumnStyle } from "../components/design/tokens";
import { getMyWorklistSnapshot, type WorklistItem } from "../services/worklist_service";
import { CelumaTable } from "../components/ui/table";
import CelumaButton from "../components/ui/button";
import CelumaAlert from "../components/ui/celuma_alert";
import EmptyState from "../components/ui/empty_state";
import ActionButtonPanel from "../components/ui/action_button_panel";
import FloatingCaptionMultiSelect from "../components/ui/floating_caption_multiselect";
import FloatingCaptionSelect from "../components/ui/floating_caption_select";
import { usePageTitle } from "../hooks/use_page_title";
import { PatientCell, renderDateCell, renderNextStepChip, renderStatusChip } from "../components/ui/table_helpers";
import { useListView } from "../hooks/use_list_view";
import type { ListViewState } from "../lib/list_view_state";
import type { ReturnedPlacement } from "../lib/list_return";
import ReturnedRecordNotice from "../components/lists/returned_record_notice";
import {
    KIND_OPTIONS, SORT_OPTIONS, TYPE_OPTIONS, WORKLIST_PAGE_SIZE, WORKLIST_VIEW,
    countLabel, deriveWorklist, entityStatusLabel, estadoOptions, isPending, legacyStatusLabel,
    nextStepKey, normalizeWorklistView, sortOptionOf, taskLabel, vistaOf, withVista, type WorklistVista,
} from "../lib/worklist_view";

/** `#1f7a75` — the accessible teal for text on light surfaces (5.12:1 on white). */
const TEAL_INK = "#1f7a75";

const STATUS_CONFIG_TYPE: Record<string, "order" | "sample" | "report"> = { lab_order: "order", sample: "sample", report: "report" };

const primaryCode = (item: WorklistItem) =>
    item.item_type === "sample" ? item.display_id : item.order_code || item.display_id;

function formatRelativeTime(dateStr: string): string | null {
    const diffMins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    if (diffMins < 1) return "ahora";
    if (diffMins < 60) return `hace ${diffMins} min`;
    if (diffHours < 24) return `hace ${diffHours} h`;
    if (diffDays < 7) return `hace ${diffDays} d`;
    return null;
}

const timeOf = (iso: string | null) =>
    iso ? new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) : null;

/** Navy caption text on the Céluma floating fields (the default teal caption is 2.45:1). */
const caption = (text: string) => <span style={{ color: tokens.textPrimary }}>{text}</span>;

function Worklist() {
    usePageTitle();
    const navigate = useNavigate();
    const screens = Grid.useBreakpoint();
    const wide = screens.lg === true; // ≥ 992 px: one column per fact
    const mid = screens.md === true;  // ≥ 768 px: record + state/step columns

    const setViewRef = useRef<(view: ListViewState) => void>(() => undefined);
    const listView = useListView("worklist", WORKLIST_VIEW, (next) => setViewRef.current(next));
    const [initial] = useState(() => normalizeWorklistView(listView.initialView));
    const [view, setView] = useState<ListViewState>(initial.view);
    const [legacyNotice, setLegacyNotice] = useState(initial.legacy);
    setViewRef.current = (next) => {
        const normalized = normalizeWorklistView(next);
        setLegacyNotice(normalized.legacy);
        setView(normalized.view);
    };
    const [noticeOpen, setNoticeOpen] = useState(listView.returned !== null);
    const [filtersOpen, setFiltersOpen] = useState(false);

    // ── Load: one snapshot, newest request wins ──────────────────────────
    const [items, setItems] = useState<WorklistItem[]>([]);
    const [asOf, setAsOf] = useState<string | null>(null);
    const [hasData, setHasData] = useState(false);
    const [loading, setLoading] = useState(true);
    const [settled, setSettled] = useState(false); // the first request has answered (or failed)
    const [failed, setFailed] = useState(false);
    const latest = useRef(0);
    const inFlight = useRef<AbortController | null>(null);

    const load = useCallback(async () => {
        const id = ++latest.current;
        inFlight.current?.abort();
        const controller = new AbortController();
        inFlight.current = controller;
        setLoading(true);
        try {
            const snapshot = await getMyWorklistSnapshot(controller.signal);
            if (id !== latest.current) return;
            setItems(snapshot.items);
            setAsOf(snapshot.asOf);
            setHasData(true);
            setFailed(false);
        } catch (error) {
            if (id !== latest.current || controller.signal.aborted) return;
            console.error("Error cargando lista de trabajo:", error);
            setFailed(true); // rows on screen (if any) stay as they were
        } finally {
            if (id === latest.current) {
                setLoading(false);
                setSettled(true);
            }
        }
    }, []);

    useEffect(() => {
        load();
        return () => inFlight.current?.abort();
    }, [load]);

    // ── View ─────────────────────────────────────────────────────────────
    const vista = vistaOf(view);
    const derived = useMemo(() => deriveWorklist(items, view, WORKLIST_PAGE_SIZE), [items, view]);

    // A page past the end (rows left the view) is clamped once the data is known.
    useEffect(() => {
        if (hasData && view.page > derived.lastPage) setView((v) => ({ ...v, page: derived.lastPage }));
    }, [hasData, view.page, derived.lastPage]);

    const { syncUrl, markReady } = listView;
    useEffect(() => {
        if (settled) syncUrl(view);
    }, [settled, view, syncUrl]);
    useEffect(() => {
        if (settled && !loading) markReady();
    }, [settled, loading, markReady]);

    const changeView = (update: (v: ListViewState) => ListViewState, keepNotice = false) => {
        if (!keepNotice) setNoticeOpen(false);
        setView(update);
    };
    const setFilter = (name: string, values: string[]) =>
        changeView((v) => {
            const filters = { ...v.filters };
            if (values.length) filters[name] = values;
            else delete filters[name];
            return { ...v, filters, page: 1 };
        });
    const onlyVista = (v: ListViewState): Record<string, string[]> => (v.filters.vista ? { vista: v.filters.vista } : {});
    const clearFilters = () => changeView((v) => ({ ...v, q: "", page: 1, filters: onlyVista(v) }));
    const setVista = (next: WorklistVista, keepNotice = false) => changeView((v) => withVista(v, next), keepNotice);
    const setPage = (next: number) => setView((v) => ({ ...v, page: Math.max(1, next) }));

    // ── Where the record the user returned from is now (#66) ────────────
    const returnedPlacement = useMemo((): ReturnedPlacement | null => {
        const returned = listView.returned;
        if (!returned || !hasData) return null;
        const item = items.find((i) => i.id === returned.id);
        if (!item) return { kind: "not_listed" };
        if (vista === "pendientes" && !isPending(item)) {
            return { kind: "not_pending", state: entityStatusLabel(item.item_type, item.entity_status ?? item.item_status) };
        }
        const index = derived.rows.findIndex((i) => i.id === returned.id);
        if (index < 0) return { kind: "no_match" };
        const at = Math.floor(index / WORKLIST_PAGE_SIZE) + 1;
        return at === derived.page ? { kind: "here" } : { kind: "other_page", page: at };
    }, [listView.returned, hasData, items, vista, derived]);

    const openItem = (item: WorklistItem) =>
        listView.openRecord(item.link, { id: item.id, label: primaryCode(item) });

    const onCodeClick = (event: MouseEvent<HTMLAnchorElement>, item: WorklistItem) => {
        event.stopPropagation(); // the row's own click would open it a second time
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return; // new tab/window
        event.preventDefault();
        openItem(item);
    };

    // ── Columns: the same row at every width ─────────────────────────────
    const statusChip = (item: WorklistItem) =>
        renderStatusChip(item.entity_status ?? item.item_status, STATUS_CONFIG_TYPE[item.item_type] ?? "order");
    const dateLine = (item: WorklistItem) => {
        const relative = item.assigned_at ? formatRelativeTime(item.assigned_at) : null;
        return (
            <span style={{ color: tokens.textSecondary, fontSize: 13 }}>
                Asignado {renderDateCell(item.assigned_at)}{relative ? ` · ${relative}` : ""}
            </span>
        );
    };
    const patientLine = (item: WorklistItem) =>
        item.patient_name ? (
            <span style={{ color: tokens.textPrimary, fontSize: 13, overflowWrap: "anywhere" }}>
                {item.patient_name}{item.patient_code ? ` · ${item.patient_code}` : ""}
            </span>
        ) : null;

    const columns: ColumnsType<WorklistItem> = [
        {
            title: "Elemento",
            key: "elemento",
            render: (_, item) => (
                <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
                    <a
                        href={item.link}
                        className="celuma-worklist-link"
                        onClick={(event) => onCodeClick(event, item)}
                        style={{ fontWeight: 700, fontSize: 15, color: tokens.textPrimary, overflowWrap: "anywhere", width: "fit-content" }}
                    >
                        {primaryCode(item)}
                    </a>
                    <span style={{ color: tokens.textSecondary, fontSize: 13 }}>
                        {taskLabel(item)}
                        {item.item_type === "sample" && item.order_code ? ` · Orden ${item.order_code}` : ""}
                    </span>
                    {!wide && patientLine(item)}
                    {!mid && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
                            {renderNextStepChip(nextStepKey(item))}
                            {statusChip(item)}
                        </div>
                    )}
                    {!wide && dateLine(item)}
                </div>
            ),
        },
        {
            title: "Paciente",
            key: "patient",
            responsive: ["lg"],
            render: (_, item) =>
                item.patient_name ? (
                    <PatientCell patientId={item.patient_id || ""} patientName={item.patient_name} patientCode={item.patient_code || undefined} />
                ) : "—",
        },
        {
            title: wide ? "Estado" : "Siguiente paso y estado",
            key: "estado",
            responsive: ["md"],
            render: (_, item) =>
                wide ? statusChip(item) : (
                    <div style={{ display: "grid", gap: 6, justifyItems: "start" }}>
                        {renderNextStepChip(nextStepKey(item))}
                        {statusChip(item)}
                    </div>
                ),
        },
        {
            title: "Siguiente paso",
            key: "next_step",
            responsive: ["lg"],
            render: (_, item) => renderNextStepChip(nextStepKey(item)),
        },
        {
            title: "Asignado",
            key: "assigned_at",
            responsive: ["lg"],
            render: (_, item) => {
                const relative = item.assigned_at ? formatRelativeTime(item.assigned_at) : null;
                return (
                    <div>
                        <div>{renderDateCell(item.assigned_at)}</div>
                        {relative && <div style={{ fontSize: 12, color: tokens.textSecondary }}>{relative}</div>}
                    </div>
                );
            },
        },
    ];

    // ── Toolbar ──────────────────────────────────────────────────────────
    const filterCount = ["kind", "item_type", "estado", "item_status", "patient"].filter((n) => view.filters[n]?.length).length;
    const patientName = (id: string) => items.find((i) => i.patient_id === id)?.patient_name ?? "Paciente seleccionado";
    const chips: Array<{ name: string; text: string }> = [];
    const named = (values: string[] | undefined, options: Array<{ value: string; label: string }>) =>
        (values ?? []).map((v) => options.find((o) => o.value === v)?.label ?? v).join(", ");
    if (view.filters.kind?.length) chips.push({ name: "kind", text: `Tarea: ${named(view.filters.kind, KIND_OPTIONS)}` });
    if (view.filters.item_type?.length) chips.push({ name: "item_type", text: `Tipo: ${named(view.filters.item_type, TYPE_OPTIONS)}` });
    if (view.filters.estado?.length) {
        chips.push({ name: "estado", text: `Estado: ${view.filters.estado.map((s) => entityStatusLabel("", s)).join(", ")}` });
    }
    if (view.filters.item_status?.length) {
        chips.push({ name: "item_status", text: `Estado (vista anterior): ${view.filters.item_status.map(legacyStatusLabel).join(", ")}` });
    }
    if (view.filters.patient?.length) chips.push({ name: "patient", text: `Paciente: ${view.filters.patient.map(patientName).join(", ")}` });

    const estado = estadoOptions(items, vista);
    const selects = (
        <div
            id="worklist-filters"
            role="group"
            aria-label="Filtros y orden"
            className="celuma-worklist-filters"
            style={{ display: "flex", flexWrap: "wrap", gap: tokens.gap }}
        >
            {[
                <FloatingCaptionMultiSelect key="kind" label={caption("Tarea")} ariaLabel="Tarea" options={KIND_OPTIONS}
                    value={view.filters.kind ?? []} onChange={(v) => setFilter("kind", v)} allowClear />,
                <FloatingCaptionMultiSelect key="type" label={caption("Tipo")} ariaLabel="Tipo" options={TYPE_OPTIONS}
                    value={view.filters.item_type ?? []} onChange={(v) => setFilter("item_type", v)} allowClear />,
                <FloatingCaptionMultiSelect key="estado" label={caption("Estado")} ariaLabel="Estado" options={estado}
                    value={view.filters.estado ?? []} onChange={(v) => setFilter("estado", v)} allowClear />,
                <FloatingCaptionSelect key="sort" label={caption("Ordenar")} ariaLabel="Ordenar"
                    options={SORT_OPTIONS.map(({ value, label }) => ({ value, label }))}
                    value={sortOptionOf(view.sort).value}
                    onChange={(value) => {
                        const option = SORT_OPTIONS.find((o) => o.value === value) ?? SORT_OPTIONS[0];
                        changeView((v) => ({ ...v, sort: option.sort, page: 1 }));
                    }} />,
            ].map((field, i) => (
                <div key={i} style={{ flex: mid ? "0 1 220px" : "1 1 100%", minWidth: 0 }}>{field}</div>
            ))}
        </div>
    );

    const summary = loading && !hasData
        ? "Cargando lista de trabajo…"
        : `${countLabel(derived.rows.length, vista)} · ${derived.from}–${derived.to} · Página ${derived.page} de ${derived.lastPage}`;

    const toolbar = (
        <div className="celuma-worklist-toolbar" style={{ display: "grid", gap: tokens.gap, marginBottom: 16 }}>
            {!mid && (
                <div>
                    <CelumaButton
                        size="small"
                        icon={<FilterOutlined aria-hidden="true" />}
                        aria-expanded={filtersOpen}
                        aria-controls="worklist-filters"
                        onClick={() => setFiltersOpen((o) => !o)}
                    >
                        {`Filtros y orden${filterCount ? ` (${filterCount})` : ""}`}
                    </CelumaButton>
                </div>
            )}
            {(mid || filtersOpen) && selects}
            {(chips.length > 0 || view.q.trim()) && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }} aria-label="Filtros activos" role="group">
                    {chips.map((chip) => (
                        <CelumaButton
                            key={chip.name}
                            size="xsmall"
                            aria-label={`Quitar filtro ${chip.text}`}
                            onClick={() => setFilter(chip.name, [])}
                            style={{ maxWidth: "100%", height: "auto", minHeight: 30, whiteSpace: "normal", textAlign: "left", overflowWrap: "anywhere" }}
                        >
                            {chip.text}
                            <CloseOutlined aria-hidden="true" style={{ marginLeft: 6 }} />
                        </CelumaButton>
                    ))}
                    <CelumaButton size="xsmall" onClick={clearFilters}>
                        {view.q.trim() ? "Limpiar búsqueda y filtros" : "Limpiar filtros"}
                    </CelumaButton>
                </div>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
                <div role="status" aria-live="polite" data-testid="worklist-summary" style={{ color: tokens.textSecondary, fontSize: 14 }}>
                    {summary}
                </div>
                <CelumaButton size="xsmall" icon={<ReloadOutlined aria-hidden="true" />} onClick={() => load()}>
                    Actualizar
                </CelumaButton>
            </div>
        </div>
    );

    const emptyContent = !hasData && loading ? (
        <div style={{ minHeight: 120 }} />
    ) : !hasData && failed ? (
        <EmptyState
            color="#e5484d"
            icon={<ExclamationCircleOutlined aria-hidden="true" />}
            title="No se pudo cargar la lista de trabajo"
            description="Revisa tu conexión e inténtalo de nuevo."
            action={<CelumaButton onClick={() => load()}>Reintentar</CelumaButton>}
        />
    ) : derived.filtered ? (
        <EmptyState
            icon={<SearchOutlined aria-hidden="true" style={{ color: TEAL_INK }} />}
            title="Ningún elemento coincide con la búsqueda y los filtros"
            description={vista === "pendientes" ? "Prueba con otros filtros, o busca en Todas." : "Prueba con otros filtros."}
            action={<CelumaButton onClick={clearFilters}>{view.q.trim() ? "Limpiar búsqueda y filtros" : "Limpiar filtros"}</CelumaButton>}
        />
    ) : vista === "pendientes" ? (
        <EmptyState
            icon={<InboxOutlined aria-hidden="true" style={{ color: TEAL_INK }} />}
            title="No tienes pendientes"
            description="Cuando te asignen una orden, muestra, reporte o revisión que requiera tu acción, aparecerá aquí."
            action={derived.counts.todas > 0 ? <CelumaButton onClick={() => setVista("todas")}>Ver todas</CelumaButton> : undefined}
        />
    ) : (
        <EmptyState
            icon={<InboxOutlined aria-hidden="true" style={{ color: TEAL_INK }} />}
            title="Tu lista de trabajo está vacía"
            description="Aquí aparecerán las asignaciones y revisiones que te correspondan."
        />
    );

    const counted = (label: string, n: number) => (hasData ? `${label} · ${n}` : label);

    return (
        <Layout style={{ minHeight: "100vh", padding: 0, margin: 0 }}>
            <SidebarCeluma selectedKey="/worklist" onNavigate={(k) => navigate(k)} logoSrc={logo} />
            <Layout.Content style={{ padding: tokens.contentPadding, background: tokens.bg, fontFamily: tokens.textFont, minWidth: 0 }}>
                <div style={listPageColumnStyle} className="celuma-worklist">
                    <PageHeader title="Mi Lista de Trabajo" subtitle="Tus asignaciones y revisiones" />
                    <Card style={cardStyle}>
                        <div role="group" aria-label="Vista" style={{ marginBottom: 16 }}>
                            <ActionButtonPanel
                                activeInk={TEAL_INK}
                                actions={[
                                    {
                                        label: counted("Pendientes", derived.counts.pendientes),
                                        active: vista === "pendientes",
                                        pressed: vista === "pendientes",
                                        onClick: () => setVista("pendientes"),
                                    },
                                    {
                                        label: counted("Todas", derived.counts.todas),
                                        active: vista === "todas",
                                        pressed: vista === "todas",
                                        onClick: () => setVista("todas"),
                                    },
                                ]}
                            />
                        </div>
                        {legacyNotice && (
                            <div style={{ marginBottom: 12 }}>
                                <CelumaAlert
                                    type="info"
                                    closable
                                    onClose={() => setLegacyNotice(false)}
                                    message="Abrimos esta vista guardada con su filtro de estado anterior."
                                    description="Quita el filtro para ver todas tus tareas, o cambia a Pendientes para ver solo lo que requiere tu acción."
                                />
                            </div>
                        )}
                        {failed && hasData && (
                            <div style={{ marginBottom: 12 }} data-testid="worklist-refresh-error">
                                <CelumaAlert
                                    type="error"
                                    message="No se pudo actualizar la lista de trabajo."
                                    description={
                                        <div style={{ display: "grid", gap: 8, justifyItems: "start" }}>
                                            <span>{timeOf(asOf) ? `Se muestran los datos de las ${timeOf(asOf)}.` : "Se muestran los datos cargados antes."}</span>
                                            <CelumaButton size="small" onClick={() => load()}>Reintentar</CelumaButton>
                                        </div>
                                    }
                                />
                            </div>
                        )}
                        {noticeOpen && listView.returned && returnedPlacement && (
                            <ReturnedRecordNotice
                                subject={`El elemento ${listView.returned.label ?? ""}`.trim()}
                                placement={returnedPlacement}
                                onGoToPage={setPage}
                                onShowAll={() => setVista("todas", true)}
                                onOpen={() => {
                                    const returned = items.find((i) => i.id === listView.returned?.id);
                                    if (returned) openItem(returned);
                                }}
                                onClearFilters={() => {
                                    setNoticeOpen(false);
                                    setView((v) => ({ ...v, q: "", page: 1, filters: onlyVista(v) }));
                                }}
                                onDismiss={() => setNoticeOpen(false)}
                                filtered={derived.filtered}
                            />
                        )}
                        <CelumaTable
                            dataSource={derived.pageRows}
                            columns={columns}
                            rowKey="id"
                            loading={loading}
                            // Fit the card at every width (no inner horizontal scroll): long names wrap.
                            scroll={{}}
                            rowClassName={(r) => (listView.returned && r.id === listView.returned.id ? "celuma-row-returned" : "")}
                            onRowClick={openItem}
                            searchable
                            searchPlaceholder="Buscar por paciente o código"
                            searchRowWrap
                            toolbar={toolbar}
                            emptyContent={emptyContent}
                            pagination={{ pageSize: WORKLIST_PAGE_SIZE }}
                            server={{
                                total: derived.rows.length,
                                page: derived.page,
                                pageSize: WORKLIST_PAGE_SIZE,
                                onPageChange: setPage,
                                search: view.q,
                                onSearchChange: (q) => changeView((v) => ({ ...v, q, page: 1 })),
                                onQueryChange: () => undefined, // no header sorters/filters: the toolbar owns them
                            }}
                        />
                    </Card>
                </div>
            </Layout.Content>
        </Layout>
    );
}

export default Worklist;
