/**
 * Mi Lista de Trabajo — what a view of the worklist shows (Céluma 1.5, #85).
 *
 * Contract: celuma-engineering/specs/lists/search-and-pagination.md ("Mi Lista de Trabajo").
 * The page loads the user's whole worklist in one API snapshot and derives everything on screen
 * — membership, filters, search, order, count, range and page — from that one collection here,
 * so the count, the range and the page can never disagree.
 *
 *  - "Pendientes" (default, bare URL): rows whose `next_step` is set (the API's `actionable`).
 *  - "Todas" (`vista=todas`): every row still in the user's worklist, actionable or not. It is
 *    not an audit history: unassigned items and removed reviewer rows are not in it.
 *  - Legacy links: before 1.5 the list kept its status filter in `item_status` (the review
 *    decision for review rows, the record status otherwise) and first loads wrote a computed
 *    default there with the same syntax as a user's choice. A URL with `item_status` and no
 *    `vista` therefore opens "Todas" with that same filter applied and shown as a removable
 *    chip — exactly the rows it showed before — instead of guessing which filters were defaults.
 */
import type { ListSort } from "../services/list_service";
import type { WorklistItem } from "../services/worklist_service";
import type { ListViewSpec, ListViewState } from "./list_view_state";
import { matchesQuery, validateSearchQuery } from "./search";
import { ORDER_STATUS_CONFIG, REPORT_STATUS_CONFIG, SAMPLE_STATE_CONFIG } from "../components/ui/status_configs";

export const WORKLIST_PAGE_SIZE = 20;

export type WorklistVista = "pendientes" | "todas";

/** Filter parameter names. `item_status` and `patient` are read from older links, never offered. */
export const WORKLIST_FILTERS = ["vista", "kind", "item_type", "estado", "item_status", "patient"] as const;

export const DEFAULT_WORKLIST_SORT: ListSort = { field: "assigned_at", order: "desc" };

export const WORKLIST_VIEW: ListViewSpec = {
    sortFields: ["assigned_at", "patient"],
    defaultSort: DEFAULT_WORKLIST_SORT,
    filterNames: WORKLIST_FILTERS,
};

export const vistaOf = (view: ListViewState): WorklistVista =>
    view.filters.vista?.[0] === "todas" ? "todas" : "pendientes";

/**
 * Normalize a view read from a URL. Returns whether it came from a pre-1.5 link (status filter
 * without `vista`), which the page announces once.
 */
export function normalizeWorklistView(view: ListViewState): { view: ListViewState; legacy: boolean } {
    const filters: Record<string, string[]> = {};
    for (const [name, values] of Object.entries(view.filters)) filters[name] = [...values];
    let legacy = false;
    if (filters.vista === undefined && filters.item_status !== undefined) {
        legacy = true;
        filters.vista = ["todas"];
    }
    if (filters.vista && !["todas", "pendientes"].includes(filters.vista[0] ?? "")) delete filters.vista;
    if (filters.vista?.[0] === "pendientes") delete filters.vista; // the default: bare URL
    else if (filters.vista) filters.vista = ["todas"];
    // An empty filter means "none" now that no default is ever written into the URL.
    for (const name of Object.keys(filters)) if (name !== "vista" && filters[name].length === 0) delete filters[name];
    // `sort=none` (a cleared sort before 1.5) showed the API order, which is the default order.
    const sort = view.sort ?? DEFAULT_WORKLIST_SORT;
    return { view: { ...view, filters, sort }, legacy };
}

export const withVista = (view: ListViewState, vista: WorklistVista): ListViewState => {
    const filters = { ...view.filters };
    if (vista === "todas") filters.vista = ["todas"];
    else delete filters.vista;
    return { ...view, filters, page: 1 };
};

const assignedTime = (item: WorklistItem) => (item.assigned_at ? new Date(item.assigned_at).getTime() : 0);
const patientName = (item: WorklistItem) => item.patient_name || item.patient_code || "";
const byNewest = (a: WorklistItem, b: WorklistItem) =>
    assignedTime(b) - assignedTime(a) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

/** Same order as the API: newest first, the id breaking ties, so equal timestamps never swap. */
export function compareWorklist(sort: ListSort | null): (a: WorklistItem, b: WorklistItem) => number {
    const s = sort ?? DEFAULT_WORKLIST_SORT;
    const dir = s.order === "desc" ? -1 : 1;
    if (s.field === "patient") {
        return (a, b) => dir * patientName(a).localeCompare(patientName(b), "es", { sensitivity: "base" }) || byNewest(a, b);
    }
    return (a, b) => (s.order === "asc" ? -byNewest(a, b) : byNewest(a, b));
}

const FIELD: Record<string, (item: WorklistItem) => string | null | undefined> = {
    kind: (i) => i.kind,
    item_type: (i) => i.item_type,
    estado: (i) => i.entity_status ?? i.item_status,
    item_status: (i) => i.item_status,
    patient: (i) => i.patient_id,
};

export const isPending = (item: WorklistItem) => item.actionable === true;

export interface WorklistPage {
    /** Every row of the view (filters, search and order applied), before paging. */
    rows: WorklistItem[];
    /** The rows of the shown page. */
    pageRows: WorklistItem[];
    /** Rows in each view before filters and search (the toggle's counts). */
    counts: Record<WorklistVista, number>;
    page: number;
    lastPage: number;
    /** 1-based range of the shown page; 0–0 when empty. */
    from: number;
    to: number;
    /** Whether search or filters (other than the view) are applied. */
    filtered: boolean;
}

export function deriveWorklist(items: WorklistItem[], view: ListViewState, pageSize = WORKLIST_PAGE_SIZE): WorklistPage {
    const vista = vistaOf(view);
    const counts = { pendientes: items.filter(isPending).length, todas: items.length };
    let rows = vista === "pendientes" ? items.filter(isPending) : [...items];
    let filtered = false;
    for (const [name, values] of Object.entries(view.filters)) {
        const field = FIELD[name];
        if (!field || values.length === 0) continue;
        filtered = true;
        rows = rows.filter((item) => values.includes(String(field(item) ?? "")));
    }
    const q = view.q.trim();
    if (q && !validateSearchQuery(q)) {
        filtered = true;
        rows = rows.filter((item) => matchesQuery([item.display_id, item.patient_name, item.patient_code, item.order_code, item.tags], q));
    }
    rows.sort(compareWorklist(view.sort));
    const lastPage = Math.max(1, Math.ceil(rows.length / pageSize));
    const page = Math.min(Math.max(1, view.page), lastPage);
    const start = (page - 1) * pageSize;
    const pageRows = rows.slice(start, start + pageSize);
    return {
        rows, pageRows, counts, page, lastPage, filtered,
        from: pageRows.length ? start + 1 : 0,
        to: start + pageRows.length,
    };
}

// ── Labels (Spanish UI copy) ─────────────────────────────────────────────

export const KIND_OPTIONS = [
    { value: "assignment", label: "Asignaciones" },
    { value: "review", label: "Revisiones" },
];

export const TYPE_OPTIONS = [
    { value: "lab_order", label: "Órdenes" },
    { value: "sample", label: "Muestras" },
    { value: "report", label: "Reportes" },
];

export const SORT_OPTIONS: Array<{ value: string; label: string; sort: ListSort }> = [
    { value: "recientes", label: "Más recientes primero", sort: { field: "assigned_at", order: "desc" } },
    { value: "antiguos", label: "Más antiguos primero", sort: { field: "assigned_at", order: "asc" } },
    { value: "paciente", label: "Paciente (A–Z)", sort: { field: "patient", order: "asc" } },
    { value: "paciente_desc", label: "Paciente (Z–A)", sort: { field: "patient", order: "desc" } },
];

export const sortOptionOf = (sort: ListSort | null) =>
    SORT_OPTIONS.find((o) => o.sort.field === (sort ?? DEFAULT_WORKLIST_SORT).field && o.sort.order === (sort ?? DEFAULT_WORKLIST_SORT).order)
    ?? SORT_OPTIONS[0];

const STATUS_BY_TYPE: Record<string, Record<string, { label: string }>> = {
    lab_order: ORDER_STATUS_CONFIG,
    sample: SAMPLE_STATE_CONFIG,
    report: REPORT_STATUS_CONFIG,
};

/** The record's state in words ("En Revisión"), for chips and filter options. */
export function entityStatusLabel(itemType: string, status: string | null | undefined): string {
    if (!status) return "—";
    return STATUS_BY_TYPE[itemType]?.[status]?.label ?? ORDER_STATUS_CONFIG[status]?.label
        ?? SAMPLE_STATE_CONFIG[status]?.label ?? REPORT_STATUS_CONFIG[status]?.label ?? status;
}

/** Pre-1.5 `item_status` values, as the old status column named them. */
export function legacyStatusLabel(status: string): string {
    return REPORT_STATUS_CONFIG[status]?.label ?? ORDER_STATUS_CONFIG[status]?.label ?? SAMPLE_STATE_CONFIG[status]?.label ?? status;
}

const TYPE_NOUN: Record<string, string> = { lab_order: "orden", sample: "muestra", report: "reporte" };

/** "Revisión de reporte", "Asignación de orden". */
export function taskLabel(item: WorklistItem): string {
    return `${item.kind === "review" ? "Revisión" : "Asignación"} de ${TYPE_NOUN[item.item_type] ?? "elemento"}`;
}

export type NextStepKey = "review" | "sign" | "work" | "write" | "waiting_review" | "waiting_signature" | "none";

export function nextStepKey(item: WorklistItem): NextStepKey {
    if (item.next_step === "review") return "review";
    if (item.next_step === "sign") return "sign";
    if (item.next_step === "work") return item.item_type === "report" ? "write" : "work";
    if (item.waiting_on === "review") return "waiting_review";
    if (item.waiting_on === "signature") return "waiting_signature";
    return "none";
}

/** Options of the "Estado" filter: the record states present in the view's membership. */
export function estadoOptions(items: WorklistItem[], vista: WorklistVista) {
    const seen = new Map<string, string>();
    for (const item of vista === "pendientes" ? items.filter(isPending) : items) {
        const status = item.entity_status ?? item.item_status;
        if (status && !seen.has(status)) seen.set(status, entityStatusLabel(item.item_type, status));
    }
    return Array.from(seen, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, "es"));
}

export function countLabel(n: number, vista: WorklistVista): string {
    if (vista === "pendientes") return `${n} ${n === 1 ? "pendiente" : "pendientes"}`;
    return `${n} ${n === 1 ? "tarea" : "tareas"}`;
}
