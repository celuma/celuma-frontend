import { useCallback, useEffect, useRef, useState } from "react";
import { validateSearchQuery } from "../lib/search";
import type { ListLocation, ListPage, ListQuery, ListSort } from "../services/list_service";

/**
 * State for a server-paginated `CelumaTable` (Céluma 1.4, issue #6).
 *
 * Guarantees, per `celuma-engineering/specs/lists/search-and-pagination.md`:
 *  - Any change of search, sort or filters restarts at page 1.
 *  - Typing is debounced; the input itself updates immediately.
 *  - Only the newest request may update the table: an older response that
 *    arrives late is discarded (and its request is aborted when possible).
 *  - A page past the end (e.g. rows were removed meanwhile) is clamped to the
 *    last page and fetched again rather than shown empty.
 *  - A search over the shared limits (`validateSearchQuery`) is not sent and
 *    not applied — the list shows no search, and `CelumaTable` says why —
 *    instead of being shortened or rejected by the API with a 422.
 *
 * Céluma 1.5 (#66): the list can START from a restored view (search, page,
 * sort, filters — e.g. read from its URL) without resetting to page 1, can ask
 * the API once where a returned record now is (`locate`), and can be moved to
 * another whole view at once (`replaceView`, when the URL changes under it).
 */
export interface UseServerListOptions<T> {
    fetchPage: (query: ListQuery, signal: AbortSignal) => Promise<ListPage<T>>;
    pageSize?: number;
    initialSort?: ListSort | null;
    initialFilters?: Record<string, string[]>;
    /** Restored search text; applied by the first request without a debounce (Céluma 1.5). */
    initialSearch?: string;
    /** Restored page; kept by the first request (clamped like any page past the end). */
    initialPage?: number;
    /** Record id the FIRST request asks the API to locate (`locate`); its answer is `located`. */
    locate?: string;
    /** Delay between the last keystroke and the request, in ms (default 300). */
    debounceMs?: number;
}

export interface ServerListView {
    search: string;
    page: number;
    sort: ListSort | null;
    filters: Record<string, string[]>;
}

export interface ServerListState<T> {
    rows: T[];
    total: number;
    loading: boolean;
    error: string | null;
    page: number;
    pageSize: number;
    /** The search box value (applied to the request after the debounce). */
    search: string;
    sort: ListSort | null;
    filters: Record<string, string[]>;
    setSearch: (q: string) => void;
    setPage: (page: number) => void;
    /** Apply a new sort and/or filter set; resets to page 1 when anything changed. */
    setQuery: (next: { sort?: ListSort | null; filters?: Record<string, string[]> }) => void;
    /** Move to another whole view at once (no debounce, page kept as given). */
    replaceView: (view: ServerListView) => void;
    reload: () => void;
    /** The API's answer to `locate` (first request only); null when not asked or not answered yet. */
    located: ListLocation | null;
}

function normalizeFilters(filters: Record<string, string[] | null | undefined>): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const name of Object.keys(filters).sort()) {
        const values = Array.from(new Set((filters[name] ?? []).map(String)));
        if (values.length) out[name] = values;
    }
    return out;
}

const sortId = (sort: ListSort | null) => (sort ? `${sort.field}:${sort.order}` : "");

export function useServerList<T>({
    fetchPage,
    pageSize = 20,
    initialSort = null,
    initialFilters = {},
    initialSearch = "",
    initialPage = 1,
    locate,
    debounceMs = 300,
}: UseServerListOptions<T>): ServerListState<T> {
    const fetchRef = useRef(fetchPage);
    fetchRef.current = fetchPage;

    const [search, setSearch] = useState(initialSearch);
    const [appliedSearch, setAppliedSearch] = useState(() => (validateSearchQuery(initialSearch) ? "" : initialSearch));
    const [page, setPageState] = useState(() => Math.max(1, Math.floor(initialPage) || 1));
    const [sort, setSort] = useState<ListSort | null>(initialSort);
    const [filters, setFilters] = useState<Record<string, string[]>>(() => normalizeFilters(initialFilters));
    const [reloadToken, setReloadToken] = useState(0);

    const [rows, setRows] = useState<T[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [located, setLocated] = useState<ListLocation | null>(null);
    // Only the first request carries `locate`; later ones (user changes) do not ask again.
    const pendingLocate = useRef<string | undefined>(locate);

    const current = useRef({ sort, filters });
    current.current = { sort, filters };
    const latestRequest = useRef(0);

    // Debounced search: a new query starts again at page 1. A query over the
    // limits applies no search at all rather than a shortened one.
    const effectiveSearch = validateSearchQuery(search) ? "" : search;
    useEffect(() => {
        if (effectiveSearch === appliedSearch) return;
        const timer = setTimeout(() => {
            setAppliedSearch(effectiveSearch);
            setPageState(1);
        }, debounceMs);
        return () => clearTimeout(timer);
    }, [effectiveSearch, appliedSearch, debounceMs]);

    useEffect(() => {
        const requestId = ++latestRequest.current;
        const controller = new AbortController();
        setLoading(true);
        const askLocate = pendingLocate.current;
        fetchRef.current({ page, pageSize, q: appliedSearch, sort, filters, ...(askLocate ? { locate: askLocate } : {}) }, controller.signal)
            .then((result) => {
                if (requestId !== latestRequest.current) return; // superseded by a newer request
                if (askLocate && pendingLocate.current === askLocate) {
                    pendingLocate.current = undefined;
                    setLocated(result.located ?? null);
                }
                const lastPage = Math.max(1, Math.ceil(result.total / pageSize));
                if (page > lastPage) {
                    setPageState(lastPage);
                    return;
                }
                setRows(result.items);
                setTotal(result.total);
                setError(null);
                setLoading(false);
            })
            .catch((err: unknown) => {
                if (requestId !== latestRequest.current || controller.signal.aborted) return;
                setError(err instanceof Error ? err.message : "Ocurrió un error inesperado.");
                setLoading(false);
            });
        return () => controller.abort();
    }, [page, pageSize, appliedSearch, sort, filters, reloadToken]);

    const setQuery = useCallback((next: { sort?: ListSort | null; filters?: Record<string, string[]> }) => {
        let changed = false;
        if (next.sort !== undefined && sortId(next.sort) !== sortId(current.current.sort)) {
            setSort(next.sort);
            changed = true;
        }
        if (next.filters !== undefined) {
            const normalized = normalizeFilters(next.filters);
            if (JSON.stringify(normalized) !== JSON.stringify(current.current.filters)) {
                setFilters(normalized);
                changed = true;
            }
        }
        if (changed) setPageState(1);
    }, []);

    const setPage = useCallback((next: number) => setPageState(Math.max(1, next)), []);
    const reload = useCallback(() => setReloadToken((t) => t + 1), []);
    const replaceView = useCallback((view: ServerListView) => {
        setSearch(view.search);
        setAppliedSearch(validateSearchQuery(view.search) ? "" : view.search);
        setSort(view.sort);
        setFilters(normalizeFilters(view.filters));
        setPageState(Math.max(1, Math.floor(view.page) || 1));
    }, []);

    return {
        rows, total, loading, error, page, pageSize, search, sort, filters,
        setSearch, setPage, setQuery, replaceView, reload, located,
    };
}
