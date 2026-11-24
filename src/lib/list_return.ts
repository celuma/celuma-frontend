/**
 * Returning from a record to the list it was opened from (Céluma 1.5, #66).
 *
 * Contract: `celuma-engineering/specs/lists/search-and-pagination.md` ("Returning to a
 * list"). Two pieces travel with a visit:
 *
 *  - a **snapshot** per list in `sessionStorage` (this tab only, cleared when it closes):
 *    the list URL that was on screen, its scroll position and the record that was opened.
 *    It holds the record's id and code, never patient data.
 *  - a **return context** in the router's history state of the record page (so it survives
 *    a reload of that page): which list to go back to, its URL and its label.
 *
 * The list's search, filters, sort and page themselves live in its URL (`list_view_state`).
 */

export type ListKey = "orders" | "samples" | "worklist";

export interface ListSnapshot {
    /** `pathname + search` of the list when it was left. */
    url: string;
    scrollY: number;
    /** The record opened from the list, when the exit was a row click. */
    openedId?: string;
    /** Its code (e.g. "CU-07"), for the "no longer matches" notice. */
    openedLabel?: string;
}

export interface ListReturn {
    listKey: ListKey;
    /** `pathname + search` to return to. */
    url: string;
    /** "Órdenes", "Muestras", "Lista de trabajo". */
    label: string;
    /** React Router's history index of the list entry, to return with a real Back when it is the previous one. */
    fromIdx?: number;
}

/** History state carried by a record page opened from a list. */
export interface ReturnState {
    celumaReturn?: ListReturn;
}

/** History state the in-app return puts on the list entry: restore it as on Back. */
export interface RestoreState {
    celumaRestore?: ListKey;
}

export const LIST_LABELS: Record<ListKey, string> = {
    orders: "Órdenes",
    samples: "Muestras",
    worklist: "Lista de trabajo",
};

const storageKey = (listKey: ListKey) => `celuma:list-return:${listKey}`;

export function saveListSnapshot(listKey: ListKey, snapshot: ListSnapshot): void {
    try {
        sessionStorage.setItem(storageKey(listKey), JSON.stringify(snapshot));
    } catch {
        // Storage full or disabled: the URL still restores the view; only the scroll position is lost.
    }
}

export function readListSnapshot(listKey: ListKey): ListSnapshot | null {
    try {
        const raw = sessionStorage.getItem(storageKey(listKey));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<ListSnapshot>;
        if (typeof parsed.url !== "string" || typeof parsed.scrollY !== "number") return null;
        return {
            url: parsed.url,
            scrollY: parsed.scrollY,
            openedId: typeof parsed.openedId === "string" ? parsed.openedId : undefined,
            openedLabel: typeof parsed.openedLabel === "string" ? parsed.openedLabel : undefined,
        };
    } catch {
        return null;
    }
}

/** React Router (v6/v7 BrowserRouter) keeps `{ usr, key, idx }` in `history.state`. */
export function currentHistoryIdx(): number | undefined {
    const idx = (window.history.state as { idx?: unknown } | null)?.idx;
    return typeof idx === "number" ? idx : undefined;
}

/** The return context of the current record page, if it was opened from a list. */
export function returnFromState(state: unknown): ListReturn | null {
    const value = (state as ReturnState | null)?.celumaReturn;
    if (!value || typeof value.url !== "string" || typeof value.label !== "string") return null;
    if (!(value.listKey in LIST_LABELS)) return null;
    return value;
}

/** The list a page was returned to by the in-app link, if any. */
export function restoreFromState(state: unknown): ListKey | null {
    const value = (state as RestoreState | null)?.celumaRestore;
    return value && value in LIST_LABELS ? value : null;
}

/**
 * Where the record the user just returned from stands in the restored list.
 *
 *  - `here`: on the page shown — the row is highlighted, no notice.
 *  - `other_page`: still matches, but this ordering now puts it on another page.
 *  - `no_match`: no longer matches the kept search and filters (its status changed, it was
 *    removed, …). The view is kept as it was; the user decides what to do.
 *  - `not_listed`: (worklist) no longer one of the user's pending items.
 */
export type ReturnedPlacement =
    | { kind: "here" }
    | { kind: "other_page"; page: number }
    | { kind: "no_match" }
    | { kind: "not_listed" };

/** Placement from the API's `located` answer (server-paginated lists). */
export function placementOf(
    returned: { id: string } | null,
    located: { matches: boolean; page?: number | null } | null,
    currentPage: number,
): ReturnedPlacement | null {
    if (!returned || !located) return null;
    if (!located.matches) return { kind: "no_match" };
    if (located.page && located.page !== currentPage) return { kind: "other_page", page: located.page };
    return { kind: "here" };
}
