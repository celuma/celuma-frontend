import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { markAt, markIndexFromCaret, rebaseMarks } from "../../lib/spelling/marks";
import type { SpellingMark, SpellingSession } from "../../lib/spelling/session";
import {
    useSpellingApi,
    type ApplyOutcome,
    type PopoverMode,
    type SpellingFieldController,
    type SpellingFieldOptions,
} from "./spelling_context";

/** Quiet period after the last edit before a field is re-checked. */
export const CHECK_DEBOUNCE_MS = 300;

/** The control-specific half of a field controller (plain input/textarea or Quill). */
export interface SpellingFieldAdapter {
    isEditable(): boolean;
    getAnchorRect(mark: SpellingMark): DOMRect | null;
    reveal(mark: SpellingMark): void;
    refusal(mark: SpellingMark, replacement: string): string | null;
    apply(mark: SpellingMark, replacement: string): ApplyOutcome;
    focus(): void;
    contains(node: Node): boolean;
}

interface CheckedRevision {
    session: SpellingSession | null;
    text: string;
    marks: SpellingMark[];
    partial: boolean;
}

const EMPTY: CheckedRevision = { session: null, text: "", marks: [], partial: false };

/**
 * Checks one field's text while it is editable and keeps its marks aligned
 * with what is on screen.
 *
 * - Debounced; deferred while an IME composition is in progress.
 * - Every run is versioned by its text: a result for older text, another
 *   session (report) or a field that stopped being editable is discarded.
 * - Between checks, marks are rebased onto the current text; marks touched by
 *   an edit disappear until the next check instead of drifting.
 */
export function useSpellingField(
    options: SpellingFieldOptions | undefined,
    text: string,
    editable: boolean,
    composing: boolean,
    adapter: SpellingFieldAdapter,
) {
    const api = useSpellingApi();
    const session = api?.session ?? null;
    // A status change (e.g. "Reintentar" after a failure) re-runs the check. While the
    // engine is unavailable the field shows no indications at all, only the editor's
    // notice: stale marks from before the failure are not presented as current.
    const engineStatus = api?.status;
    const active = Boolean(options && api?.enabled && session && editable && engineStatus !== "unavailable");
    const [checked, setChecked] = useState<CheckedRevision>(EMPTY);
    const [ignoreRevision, setIgnoreRevision] = useState(0);
    const lastRun = useRef<{ session: SpellingSession | null; ignoreRevision: number }>({ session: null, ignoreRevision: 0 });

    useEffect(() => {
        if (!session) return;
        return session.subscribe(() => setIgnoreRevision(session.ignoreRevision));
    }, [session]);

    useEffect(() => {
        if (!active || composing || !session) return;
        const controller = new AbortController();
        // First check of a session and re-filtering after "Ignorar" run at once; edits are debounced.
        const immediate = lastRun.current.session !== session || lastRun.current.ignoreRevision !== ignoreRevision;
        const timer = setTimeout(() => {
            session.checkText(text, controller.signal).then(
                (result) => {
                    if (controller.signal.aborted) return;
                    lastRun.current = { session, ignoreRevision };
                    setChecked({ session, text, marks: result.marks, partial: result.partial });
                },
                () => {
                    // Aborted, or the engine is unavailable: the provider shows that state.
                },
            );
        }, immediate ? 0 : CHECK_DEBOUNCE_MS);
        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [active, composing, session, text, ignoreRevision, engineStatus]);

    // An "Ignorar" re-runs the check at once (cache hit), which drops the word everywhere.
    const marks = useMemo(() => {
        if (!active || composing || checked.session !== session || !session) return [];
        return checked.text === text ? checked.marks : rebaseMarks(checked.marks, checked.text, text);
    }, [active, composing, checked, session, text]);
    const partial = active && checked.session === session && checked.partial;

    const latest = useRef({ adapter, marks });
    useLayoutEffect(() => {
        latest.current = { adapter, marks };
    });

    const fieldId = options?.fieldId;
    const groupId = options?.groupId ?? fieldId;
    const order = options?.order ?? 0;
    const label = options?.label ?? "";
    const registry = api?.registry;
    useEffect(() => {
        if (!registry || !fieldId || !groupId) return;
        const controller: SpellingFieldController = {
            fieldId,
            groupId,
            order,
            label,
            isEditable: () => latest.current.adapter.isEditable(),
            getAnchorRect: (mark) => latest.current.adapter.getAnchorRect(mark),
            reveal: (mark) => latest.current.adapter.reveal(mark),
            refusal: (mark, replacement) => latest.current.adapter.refusal(mark, replacement),
            apply: (mark, replacement) => latest.current.adapter.apply(mark, replacement),
            focus: () => latest.current.adapter.focus(),
            contains: (node) => latest.current.adapter.contains(node),
        };
        return registry.register(controller);
    }, [registry, fieldId, groupId, order, label]);

    useEffect(() => {
        if (registry && fieldId) registry.update(fieldId, marks, partial);
    }, [registry, fieldId, marks, partial]);

    /** Opens the suggestion dialog from a caret position; returns whether it opened. */
    const openFromCaret = (caret: number | null, mode: PopoverMode): boolean => {
        if (!api || !fieldId || !active) return false;
        const mark = mode === "passive" ? (caret == null ? null : markAt(marks, caret)) : marks[markIndexFromCaret(marks, caret)];
        if (!mark) return false;
        api.open(fieldId, mark, mode, "field");
        return true;
    };

    /**
     * Keyboard entry points shared by every covered control: Alt+Enter opens
     * the suggestions for the word at (or after) the caret; Escape closes an
     * open dialog of this field without letting an enclosing modal close.
     */
    const handleKeyDown = (event: KeyboardEvent | ReactKeyboardEvent, caret: number | null): boolean => {
        if (event.key === "Enter" && event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
            if (openFromCaret(caret, "active")) {
                event.preventDefault();
                event.stopPropagation();
                return true;
            }
            return false;
        }
        if (event.key === "Escape" && fieldId && api?.isOpenFor(fieldId)) {
            api.close(false);
            event.preventDefault();
            event.stopPropagation();
            return true;
        }
        return false;
    };

    /** Closes a pointer-opened dialog once the caret leaves its word. */
    const handleCaretMove = (caret: number | null) => {
        if (!api || !fieldId || api.openMode(fieldId) !== "passive") return;
        if (caret == null || !markAt(marks, caret)) api.close(false);
    };

    return { marks, partial, active, openFromCaret, handleKeyDown, handleCaretMove };
}
