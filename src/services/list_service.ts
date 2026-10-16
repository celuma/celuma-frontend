/**
 * Server-paginated list requests (Céluma 1.4, issues #6/#7).
 *
 * Contract: `celuma-engineering/specs/lists/search-and-pagination.md`. A list
 * request carries `page`/`page_size`, an optional search `q`, an optional
 * `sort` + `order` and repeated filter parameters; the API applies search,
 * filters and ordering to the whole authorized collection and answers with one
 * page plus `total`.
 */

function getApiBase(): string {
    return import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL || "/api");
}

export async function getJSON<TRes>(path: string, signal?: AbortSignal): Promise<TRes> {
    const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
    const headers: Record<string, string> = { accept: "application/json" };
    if (token) headers["Authorization"] = token;
    const res = await fetch(`${getApiBase()}${path}`, { method: "GET", headers, credentials: "include", signal });
    const text = await res.text();
    let parsed: unknown = undefined;
    try { parsed = text ? JSON.parse(text) : undefined; } catch { /* ignore */ }
    if (!res.ok) {
        const message = (parsed as { message?: string } | undefined)?.message ?? `${res.status} ${res.statusText}`;
        throw new Error(message);
    }
    return parsed as TRes;
}

export interface ListSort {
    /** API sort field (e.g. "sample_code"). */
    field: string;
    order: "asc" | "desc";
}

export interface ListQuery {
    page: number;
    pageSize: number;
    /** Raw search text; the API normalizes it (see `lib/search.ts`). */
    q: string;
    sort: ListSort | null;
    /** API filter name → selected values (OR within a filter, AND across filters). */
    filters: Record<string, string[]>;
}

export interface ListPage<T> {
    items: T[];
    total: number;
}

export function listQueryParams(query: ListQuery): URLSearchParams {
    const params = new URLSearchParams();
    params.set("page", String(query.page));
    params.set("page_size", String(query.pageSize));
    const q = query.q.trim();
    if (q) params.set("q", q);
    if (query.sort) {
        params.set("sort", query.sort.field);
        params.set("order", query.sort.order);
    }
    for (const [name, values] of Object.entries(query.filters)) {
        for (const value of values) params.append(name, value);
    }
    return params;
}

/**
 * Fetch one page of `path` (e.g. "/v1/laboratory/samples/"), whose response
 * carries its rows under `key` and the match count under `total`.
 */
export async function fetchListPage<T>(
    path: string,
    key: string,
    query: ListQuery,
    signal?: AbortSignal,
): Promise<ListPage<T>> {
    const body = await getJSON<Record<string, unknown>>(`${path}?${listQueryParams(query).toString()}`, signal);
    const items = (body?.[key] as T[] | undefined) ?? [];
    const total = typeof body?.total === "number" ? body.total : items.length;
    return { items, total };
}

/** One choice of a column filter, as the `filter-options` endpoints return it. */
export interface FilterOption {
    value: string;
    text: string;
    color?: string | null;
}

/** How a page's table columns map to its API's sort fields and filter parameters. */
export interface ColumnQueryMap {
    /** Column key → API sort field. */
    sort: Record<string, string>;
    /** Column key → API filter parameter. */
    filters: Record<string, string>;
    /**
     * Column keys whose filter is a yes/no choice: the API takes one boolean,
     * so it is sent only when exactly one of the two values is selected.
     */
    booleanFilters?: string[];
}

/** Translate a `CelumaTable` header interaction into the API's sort + filters. */
export function columnQueryToList(
    next: { sort: { field: string; order: "asc" | "desc" } | null; filters: Record<string, string[]> },
    map: ColumnQueryMap,
): { sort: ListSort | null; filters: Record<string, string[]> } {
    const sortField = next.sort ? map.sort[next.sort.field] : undefined;
    const filters: Record<string, string[]> = {};
    for (const [columnKey, values] of Object.entries(next.filters)) {
        const param = map.filters[columnKey];
        if (!param || !values.length) continue;
        if (map.booleanFilters?.includes(columnKey)) {
            const unique = Array.from(new Set(values));
            if (unique.length === 1) filters[param] = unique;
            continue;
        }
        filters[param] = values;
    }
    return { sort: sortField && next.sort ? { field: sortField, order: next.sort.order } : null, filters };
}
