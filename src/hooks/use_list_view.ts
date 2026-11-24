import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { parseListView, serializeListView, type ListViewSpec, type ListViewState } from "../lib/list_view_state";
import {
    currentHistoryIdx,
    LIST_LABELS,
    readListSnapshot,
    restoreFromState,
    saveListSnapshot,
    type ListKey,
    type ListSnapshot,
    type ReturnState,
} from "../lib/list_return";

/**
 * A list page's restorable view (Céluma 1.5, #66). Contract:
 * `celuma-engineering/specs/lists/search-and-pagination.md` ("Returning to a list").
 *
 *  - The initial view (search, filters, sort, page) is read from the URL, and `syncUrl`
 *    writes every later view back with `replace`, so browser Back, the in-app return and a
 *    reload reopen it. A navigation that changes the URL under a mounted list (the sidebar,
 *    a dashboard link) is reported through `onExternalView`.
 *  - On leaving, the list stores a per-tab snapshot: its URL, its scroll position and the
 *    record opened (`openRecord`). When the list is reopened by browser Back/Forward, a
 *    reload or the in-app return AND its URL is the one of the snapshot, the scroll position
 *    is restored once the first page is on screen (`markReady`) and `returned` names the
 *    record that was open, so the page can say whether it still matches.
 *  - Opening the list from the sidebar or a link starts fresh: no scroll restore, no notice.
 */
export interface ListViewController {
    initialView: ListViewState;
    /** The record that was open when the list was left, when this visit restores it. */
    returned: { id: string; label?: string } | null;
    /** Write `view` into the URL (replace) when it differs from what is there. */
    syncUrl: (view: ListViewState) => void;
    /** Call when the first page of the restored view is rendered: restores the scroll position. */
    markReady: () => void;
    /**
     * Navigate to a record of this list, remembering it and passing the return context.
     * Without `record` (a related record, e.g. a sample row's order link) only the return
     * context travels: the restored list then has no record to locate.
     */
    openRecord: (path: string, record?: { id: string; label?: string }) => void;
}

export function useListView(
    listKey: ListKey,
    spec: ListViewSpec,
    onExternalView?: (view: ListViewState) => void,
): ListViewController {
    const location = useLocation();
    const navigationType = useNavigationType();
    const navigate = useNavigate();

    const [initial] = useState(() => {
        const url = location.pathname + location.search;
        const snapshot = readListSnapshot(listKey);
        const restoring = navigationType === "POP" || restoreFromState(location.state) === listKey;
        return {
            view: parseListView(location.search, spec),
            snapshot: restoring && snapshot && snapshot.url === url ? snapshot : null,
        };
    });

    // What this list last put in (or found in) its URL, normalized. The snapshot and the return
    // context use THIS (the view on screen), not a location that a pending `replace` may not have
    // reached yet, so they always name the history entry the user will come back to.
    const written = useRef(serializeListView(initial.view, spec));
    const pathname = location.pathname;
    const urlOf = () => pathname + (written.current ? `?${written.current}` : "");
    const urlRef = useRef(urlOf());
    const scrollY = useRef(initial.snapshot?.scrollY ?? window.scrollY);
    // While a restore is pending, scroll events come from the list being rebuilt, not the user.
    const recording = useRef(initial.snapshot === null);
    const opened = useRef<{ id: string; label?: string } | null>(null);
    const restored = useRef(false);

    useEffect(() => {
        const normalized = serializeListView(parseListView(location.search, spec), spec);
        if (normalized !== written.current) {
            written.current = normalized;
            urlRef.current = urlOf();
            onExternalView?.(parseListView(location.search, spec));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- reacts to URL changes only
    }, [location.search]);

    useEffect(() => {
        const onScroll = () => {
            if (recording.current) scrollY.current = window.scrollY;
        };
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => {
            window.removeEventListener("scroll", onScroll);
            const snapshot: ListSnapshot = { url: urlRef.current, scrollY: scrollY.current };
            if (opened.current) {
                snapshot.openedId = opened.current.id;
                snapshot.openedLabel = opened.current.label;
            }
            saveListSnapshot(listKey, snapshot);
        };
    }, [listKey]);

    const syncUrl = useCallback((view: ListViewState) => {
        const next = serializeListView(view, spec);
        if (next === written.current) return;
        written.current = next;
        urlRef.current = urlOf();
        navigate({ pathname: location.pathname, search: next ? `?${next}` : "" }, { replace: true, state: location.state });
        // eslint-disable-next-line react-hooks/exhaustive-deps -- spec is a module constant
    }, [navigate, location.pathname, location.state]);

    const markReady = useCallback(() => {
        if (restored.current) return;
        restored.current = true;
        const target = initial.snapshot?.scrollY;
        if (target === undefined) {
            recording.current = true;
            return;
        }
        // After the rows are painted, so the document is tall enough to scroll that far.
        requestAnimationFrame(() => {
            window.scrollTo({ top: target, left: 0, behavior: "auto" });
            scrollY.current = window.scrollY;
            recording.current = true;
        });
    }, [initial.snapshot]);

    const openRecord = useCallback((path: string, record?: { id: string; label?: string }) => {
        opened.current = record ?? null;
        scrollY.current = window.scrollY;
        const state: ReturnState = {
            celumaReturn: { listKey, url: urlRef.current, label: LIST_LABELS[listKey], fromIdx: currentHistoryIdx() },
        };
        navigate(path, { state });
    }, [listKey, navigate]);

    const snapshot = initial.snapshot;
    return {
        initialView: initial.view,
        returned: snapshot?.openedId ? { id: snapshot.openedId, label: snapshot.openedLabel } : null,
        syncUrl,
        markReady,
        openRecord,
    };
}
