/**
 * A list's view (search, filters, sort, page) as URL query parameters (Céluma 1.5, #66).
 *
 * Contract: `celuma-engineering/specs/lists/search-and-pagination.md` ("Returning to a
 * list"). The list writes its view into its own URL with `replace` (no history entry per
 * keystroke), so browser Back, the in-app return and a reload all reopen the same view.
 * Filter parameters use the API's names (`status`, `patient_id`, …), and both repeated
 * (`?status=A&status=B`) and comma-separated (`?status=A,B`, used by the dashboard links)
 * values are read. Unknown parameters, sort fields or values are ignored rather than sent:
 * a stale or hand-edited URL opens the default view instead of an API error.
 */
import type { ListSort } from "../services/list_service";

export interface ListViewState {
    q: string;
    page: number;
    sort: ListSort | null;
    /** Filter name → selected values. A name present with no values means "explicitly none". */
    filters: Record<string, string[]>;
}

export interface ListViewSpec {
    /** API sort fields this list accepts. */
    sortFields: readonly string[];
    defaultSort: ListSort | null;
    /** Filter parameter names this list accepts. */
    filterNames: readonly string[];
}

const SORT = "sort";
const ORDER = "order";
const PAGE = "page";
const QUERY = "q";

function splitValues(values: string[]): string[] {
    const out: string[] = [];
    for (const value of values) {
        for (const part of value.split(",")) {
            const trimmed = part.trim();
            if (trimmed && !out.includes(trimmed)) out.push(trimmed);
        }
    }
    return out;
}

export function parseListView(search: string, spec: ListViewSpec): ListViewState {
    const params = new URLSearchParams(search);
    const pageRaw = Number(params.get(PAGE));
    const page = Number.isInteger(pageRaw) && pageRaw >= 1 ? pageRaw : 1;
    const sortField = params.get(SORT);
    const order = params.get(ORDER) === "desc" ? "desc" : "asc";
    // `sort=none` is a sort the user cleared; anything unknown falls back to the default.
    const sort = sortField === "none" ? null
        : sortField && spec.sortFields.includes(sortField) ? { field: sortField, order } as ListSort
            : spec.defaultSort;
    const filters: Record<string, string[]> = {};
    for (const name of spec.filterNames) {
        if (params.has(name)) filters[name] = splitValues(params.getAll(name));
    }
    return { q: params.get(QUERY) ?? "", page, sort, filters };
}

/**
 * The query string of `state` (without "?"), omitting defaults so an untouched list keeps
 * a bare URL. Filters keep a present-but-empty entry (`status=`) so "explicitly none" survives.
 */
export function serializeListView(state: ListViewState, spec: ListViewSpec): string {
    const params = new URLSearchParams();
    if (state.q) params.set(QUERY, state.q);
    const isDefaultSort = state.sort?.field === spec.defaultSort?.field && state.sort?.order === spec.defaultSort?.order;
    if (state.sort && !isDefaultSort) {
        params.set(SORT, state.sort.field);
        params.set(ORDER, state.sort.order);
    } else if (!state.sort && spec.defaultSort) {
        params.set(SORT, "none");
    }
    for (const name of Object.keys(state.filters).sort()) {
        if (!spec.filterNames.includes(name)) continue;
        const values = state.filters[name] ?? [];
        if (values.length === 0) params.append(name, "");
        for (const value of values) params.append(name, value);
    }
    if (state.page > 1) params.set(PAGE, String(state.page));
    return params.toString();
}

/** Filters without the "explicitly none" markers (what the API and the table receive). */
export function activeFilters(filters: Record<string, string[]>): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const [name, values] of Object.entries(filters)) if (values.length) out[name] = values;
    return out;
}
