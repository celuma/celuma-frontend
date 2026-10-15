import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useServerList } from "../../hooks/use_server_list";
import type { ListPage, ListQuery } from "../../services/list_service";

// Céluma 1.4 (#6): the state machine behind every server-paginated list.
// Contract: celuma-engineering/specs/lists/search-and-pagination.md.

type Row = { id: string };

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((r) => { resolve = r; });
    return { promise, resolve };
}

const page = (ids: string[], total: number): ListPage<Row> => ({ items: ids.map((id) => ({ id })), total });

type FetchPage = (query: ListQuery, signal: AbortSignal) => Promise<ListPage<Row>>;

describe("useServerList", () => {
    it("loads the first page with the initial sort and filters", async () => {
        const fetchPage = vi.fn<FetchPage>(async () => page(["a"], 1));
        const { result } = renderHook(() => useServerList<Row>({
            fetchPage, pageSize: 10, initialSort: { field: "sample_code", order: "asc" },
            initialFilters: { status: ["RECEIVED"] },
        }));
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(fetchPage).toHaveBeenLastCalledWith(
            { page: 1, pageSize: 10, q: "", sort: { field: "sample_code", order: "asc" }, filters: { status: ["RECEIVED"] } },
            expect.any(AbortSignal),
        );
        expect(result.current.rows).toEqual([{ id: "a" }]);
    });

    it("debounces the search and restarts at page 1", async () => {
        const fetchPage = vi.fn<FetchPage>(async () => page(["a"], 100));
        const { result } = renderHook(() => useServerList<Row>({ fetchPage, pageSize: 10, debounceMs: 20 }));
        await waitFor(() => expect(result.current.loading).toBe(false));
        act(() => result.current.setPage(4));
        await waitFor(() => expect(fetchPage).toHaveBeenLastCalledWith(expect.objectContaining({ page: 4 }), expect.anything()));

        act(() => {
            result.current.setSearch("C");
            result.current.setSearch("CU276262");
        });
        // The box shows the text at once; the request waits for the pause.
        expect(result.current.search).toBe("CU276262");
        await waitFor(() => expect(fetchPage).toHaveBeenLastCalledWith(
            expect.objectContaining({ q: "CU276262", page: 1 }), expect.anything()));
        expect(fetchPage.mock.calls.filter(([q]) => q.q === "C")).toHaveLength(0);
    });

    it("never lets an older response replace a newer one, and aborts it", async () => {
        const requests: Array<{ query: ListQuery; signal: AbortSignal; d: ReturnType<typeof deferred<ListPage<Row>>> }> = [];
        const fetchPage = vi.fn((query: ListQuery, signal: AbortSignal) => {
            const d = deferred<ListPage<Row>>();
            requests.push({ query, signal, d });
            return d.promise;
        });
        const { result } = renderHook(() => useServerList<Row>({ fetchPage, pageSize: 10 }));
        await act(async () => requests[0].d.resolve(page(["p1"], 100)));

        act(() => result.current.setPage(2));
        act(() => result.current.setPage(3));
        const [second, third] = requests.slice(-2);
        expect(second.signal.aborted).toBe(true);
        expect(third.signal.aborted).toBe(false);

        // The newest answer first, then the stale one arrives late.
        await act(async () => third.d.resolve(page(["p3"], 100)));
        await act(async () => second.d.resolve(page(["p2"], 100)));

        expect(result.current.page).toBe(3);
        expect(result.current.rows).toEqual([{ id: "p3" }]);
        expect(result.current.loading).toBe(false);
    });

    it("resets to page 1 only when sort or filters actually change", async () => {
        const fetchPage = vi.fn<FetchPage>(async () => page(["a"], 100));
        const { result } = renderHook(() => useServerList<Row>({
            fetchPage, pageSize: 10, initialSort: { field: "order_code", order: "asc" },
        }));
        await waitFor(() => expect(result.current.loading).toBe(false));
        act(() => result.current.setPage(5));
        await waitFor(() => expect(result.current.loading).toBe(false));
        const calls = fetchPage.mock.calls.length;

        act(() => result.current.setQuery({ sort: { field: "order_code", order: "asc" }, filters: {} }));
        expect(result.current.page).toBe(5);
        expect(fetchPage.mock.calls.length).toBe(calls);

        act(() => result.current.setQuery({ filters: { state: ["READY", "READY"] } }));
        await waitFor(() => expect(fetchPage).toHaveBeenLastCalledWith(
            expect.objectContaining({ page: 1, filters: { state: ["READY"] } }), expect.anything()));
    });

    it("clamps a page past the end and fetches the last real page", async () => {
        const fetchPage = vi.fn(async (q: ListQuery) => page(q.page === 3 ? ["last"] : [], 25));
        const { result } = renderHook(() => useServerList<Row>({ fetchPage, pageSize: 10 }));
        await waitFor(() => expect(result.current.loading).toBe(false));
        act(() => result.current.setPage(9));
        await waitFor(() => expect(result.current.page).toBe(3));
        await waitFor(() => expect(result.current.rows).toEqual([{ id: "last" }]));
        expect(result.current.total).toBe(25);
    });

    it("surfaces an error without keeping the spinner", async () => {
        const fetchPage = vi.fn(async () => { throw new Error("500 Internal Server Error"); });
        const { result } = renderHook(() => useServerList<Row>({ fetchPage }));
        await waitFor(() => expect(result.current.error).toBe("500 Internal Server Error"));
        expect(result.current.loading).toBe(false);
    });
});
