import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { getSpellingClient, type SpellingClient } from "../../lib/spelling/client";
import { markId } from "../../lib/spelling/marks";
import { SpellingSession, type SpellingMark } from "../../lib/spelling/session";
import SpellingPopover, { type SuggestionState } from "./spelling_popover";
import {
    SpellingContext,
    SpellingRegistry,
    type PopoverMode,
    type PopoverOrigin,
    type SpellingApi,
} from "./spelling_context";

type Props = {
    /**
     * Whether the current user may edit this report's clinical content right
     * now (lifecycle AND `reports:edit`). Presentation-only reviewer authority
     * does not count. When false no field is checked, no worker request is
     * made and no suggestion can be opened or applied.
     */
    enabled: boolean;
    /** Identifies the report being edited; a new value starts a fresh session (no carried-over ignores). */
    scopeKey: string;
    /** Injected in tests; the app uses the tab-wide worker client. */
    client?: SpellingClient;
    children: ReactNode;
};

interface OpenState {
    fieldId: string;
    mark: SpellingMark;
    mode: PopoverMode;
    origin: PopoverOrigin;
    /** Where focus goes back on close (the field, or the summary button that opened the review). */
    returnFocus: HTMLElement | null;
}

interface PendingAdvance {
    fieldId: string;
    groupId: string;
    order: number;
    start: number;
    handledId: string;
    returnFocus: HTMLElement | null;
    deadline: number;
}

const visuallyHidden: CSSProperties = {
    position: "absolute",
    width: 1,
    height: 1,
    margin: -1,
    padding: 0,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
    border: 0,
};

/**
 * Céluma 1.4 (#29) — report-editor spelling assistance.
 *
 * Owns the per-report `SpellingSession` (caches + ignore list, disposed when
 * the report changes or the editor unmounts), the registry of covered fields
 * and the single suggestion dialog. Checking is local (bundled worker and
 * dictionary); no text leaves the device through this feature, and a checker
 * failure leaves editing, saving and every clinical action untouched.
 */
export default function SpellingProvider({ enabled, scopeKey, client, children }: Props) {
    const spellingClient = useMemo(() => client ?? getSpellingClient(), [client]);
    const status = useSyncExternalStore(spellingClient.subscribe, spellingClient.getStatus);
    const [registry] = useState(() => new SpellingRegistry());
    const registryVersion = useSyncExternalStore(registry.subscribe, registry.getVersion);

    const [session, setSession] = useState<SpellingSession | null>(null);
    useEffect(() => {
        const next = new SpellingSession(spellingClient);
        setSession(next);
        return () => next.dispose();
    }, [spellingClient, scopeKey]);

    const [openState, setOpenState] = useState<OpenState | null>(null);
    const openRef = useRef<OpenState | null>(null);
    openRef.current = openState;
    const enabledRef = useRef(enabled);
    enabledRef.current = enabled;
    const popoverRef = useRef<HTMLDivElement | null>(null);
    const [pendingAdvance, setPendingAdvance] = useState<PendingAdvance | null>(null);

    const [announcement, setAnnouncement] = useState("");
    const announce = useCallback((text: string) => {
        setAnnouncement("");
        setTimeout(() => setAnnouncement(text), 30);
    }, []);

    // Hold the worker only while this editor may use it (it is released when idle).
    useEffect(() => {
        if (!enabled) return;
        return spellingClient.acquire();
    }, [enabled, spellingClient]);

    // Read-only transition (submit, sign…) or lost edit capability: stop everything in flight.
    useEffect(() => {
        if (enabled) return;
        session?.cancelPending();
        setOpenState(null);
        setPendingAdvance(null);
    }, [enabled, session]);

    const restoreFocus = useCallback(
        (state: OpenState) => {
            const controller = registry.controller(state.fieldId);
            const target = state.returnFocus;
            if (target && target.isConnected && !controller?.contains(target)) target.focus();
            else controller?.focus();
        },
        [registry],
    );

    const open = useCallback(
        (
            fieldId: string,
            mark: SpellingMark,
            mode: PopoverMode,
            origin: PopoverOrigin = "field",
            returnTo?: HTMLElement | null,
        ) => {
            if (!enabledRef.current) return;
            const controller = registry.controller(fieldId);
            if (!controller || !controller.isEditable()) return;
            if (mode === "active") controller.reveal(mark);
            const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            // Moving between indications keeps the element that started the review.
            const returnFocus = returnTo !== undefined
                ? returnTo
                : openRef.current?.returnFocus ?? (focused && !popoverRef.current?.contains(focused) ? focused : null);
            const next = { fieldId, mark, mode, origin, returnFocus };
            openRef.current = next;
            setOpenState(next);
        },
        [registry],
    );

    const close = useCallback(
        (shouldRestoreFocus = false) => {
            const previous = openRef.current;
            openRef.current = null;
            setOpenState(null);
            if (previous && shouldRestoreFocus && previous.mode === "active") restoreFocus(previous);
        },
        [restoreFocus],
    );

    const openGroup = useCallback(
        (groupId: string) => {
            const first = registry.group(groupId)[0];
            if (first) open(first.controller.fieldId, first.mark, "active", "summary");
        },
        [registry, open],
    );

    // The dialog only lives while its word is still indicated in an editable field.
    useEffect(() => {
        if (!openState) return;
        const controller = registry.controller(openState.fieldId);
        const id = markId(openState.mark);
        const present = registry.marks(openState.fieldId).some((m) => markId(m) === id);
        if (!controller || !present || !controller.isEditable()) {
            openRef.current = null;
            setOpenState(null);
        }
    }, [registryVersion, openState, registry]);

    // After a correction/ignore started from a summary, continue with the next indication.
    useEffect(() => {
        if (!pendingAdvance) return;
        const stillShown = registry.marks(pendingAdvance.fieldId).some((m) => markId(m) === pendingAdvance.handledId);
        if (stillShown && Date.now() < pendingAdvance.deadline) {
            const retry = setTimeout(() => setPendingAdvance((p) => (p ? { ...p } : p)), 50);
            return () => clearTimeout(retry);
        }
        setPendingAdvance(null);
        const entries = registry.group(pendingAdvance.groupId);
        const next = entries.find(
            (e) =>
                e.controller.order > pendingAdvance.order ||
                (e.controller.order === pendingAdvance.order && e.mark.start >= pendingAdvance.start &&
                    !(e.controller.fieldId === pendingAdvance.fieldId && markId(e.mark) === pendingAdvance.handledId)),
        ) ?? entries[0];
        if (next) {
            open(next.controller.fieldId, next.mark, "active", "summary", pendingAdvance.returnFocus);
        } else if (pendingAdvance.returnFocus?.isConnected) {
            const controller = registry.controller(pendingAdvance.fieldId);
            if (!controller?.contains(pendingAdvance.returnFocus)) pendingAdvance.returnFocus.focus();
        }
    }, [pendingAdvance, registryVersion, registry, open]);

    // Pointer outside the dialog closes it; a click inside the field is left to the field (passive mode).
    useEffect(() => {
        if (!openState) return;
        const onPointerDown = (event: PointerEvent) => {
            const target = event.target as Node;
            if (popoverRef.current?.contains(target)) return;
            if (openRef.current?.mode === "passive" && registry.controller(openState.fieldId)?.contains(target)) return;
            close(false);
        };
        document.addEventListener("pointerdown", onPointerDown, true);
        return () => document.removeEventListener("pointerdown", onPointerDown, true);
    }, [openState, registry, close]);

    const [suggestions, setSuggestions] = useState<SuggestionState>({ status: "loading" });
    const suggestionKey = openState ? `${openState.fieldId}|${markId(openState.mark)}` : null;
    // Why the last chosen suggestion was not applied, shown inside the dialog.
    const [applyNotice, setApplyNotice] = useState<{ key: string; text: string } | null>(null);
    useEffect(() => {
        if (!openState) setApplyNotice(null);
    }, [openState]);
    const openWord = openState?.mark.word;
    useEffect(() => {
        if (!suggestionKey || !openWord || !session) return;
        const controller = new AbortController();
        setSuggestions({ status: "loading" });
        session.suggest(openWord, controller.signal).then(
            (items) => {
                if (!controller.signal.aborted) setSuggestions({ status: "ready", items });
            },
            () => {
                if (!controller.signal.aborted) setSuggestions({ status: "error" });
            },
        );
        return () => controller.abort();
    }, [suggestionKey, openWord, session]);

    const handled = (state: OpenState) => {
        const controller = registry.controller(state.fieldId);
        if (state.origin === "summary" && controller) {
            setPendingAdvance({
                fieldId: state.fieldId,
                groupId: controller.groupId,
                order: controller.order,
                start: state.mark.start,
                handledId: markId(state.mark),
                returnFocus: state.returnFocus,
                deadline: Date.now() + 1000,
            });
            openRef.current = null;
            setOpenState(null);
        } else {
            close(state.mode === "active");
        }
    };

    const onApply = (replacement: string) => {
        const state = openRef.current;
        if (!state) return;
        const controller = registry.controller(state.fieldId);
        if (!enabledRef.current || !controller || !controller.isEditable()) {
            announce("La revisión ortográfica ya no está disponible para este campo.");
            close(false);
            return;
        }
        const reason = controller.refusal(state.mark, replacement);
        if (reason) {
            announce(`No se aplicó la sugerencia: ${reason}.`);
            return;
        }
        const outcome = controller.apply(state.mark, replacement);
        if (outcome === "unsupported") {
            // Nothing changed in the field. Keep the dialog so the author sees why and can
            // correct the word by hand, ignore it or close; focus goes back to the dialog.
            const text = "Este navegador no permitió aplicar la sugerencia de forma que se pueda deshacer, así que no se cambió nada. Corrige la palabra manualmente si lo necesitas.";
            setApplyNotice({ key: `${state.fieldId}|${markId(state.mark)}`, text });
            announce(text);
            if (state.mode === "active") popoverRef.current?.focus({ preventScroll: true });
            return;
        }
        if (outcome !== "applied") {
            announce(outcome === "stale"
                ? "El texto cambió; no se aplicó la sugerencia. Vuelve a revisar la palabra."
                : outcome === "mismatch"
                    ? "El navegador modificó el campo de forma distinta a la sugerencia. Revisa el texto; puedes deshacerlo con Ctrl+Z."
                    : "No se pudo aplicar la sugerencia en este campo.");
            close(false);
            return;
        }
        announce(`Se reemplazó «${state.mark.word}» por «${replacement}».`);
        // The field already has focus and the caret after the corrected word.
        handled({ ...state, mode: "passive" });
    };

    const onIgnore = () => {
        const state = openRef.current;
        if (!state || !session) return;
        session.ignore(state.mark.word);
        announce(`Se ignorará «${state.mark.word}» en este reporte.`);
        handled(state);
    };

    const step = (delta: 1 | -1) => {
        const state = openRef.current;
        const controller = state && registry.controller(state.fieldId);
        if (!state || !controller) return;
        const entries = registry.group(controller.groupId);
        const index = entries.findIndex((e) => e.controller.fieldId === state.fieldId && markId(e.mark) === markId(state.mark));
        const next = entries[(index + delta + entries.length) % entries.length];
        if (next) open(next.controller.fieldId, next.mark, "active", state.origin === "summary" ? "summary" : "field");
    };

    const activeController = openState ? registry.controller(openState.fieldId) : null;
    const activeMark = openState?.mark ?? null;
    const getAnchorRect = useCallback(
        () => (activeController && activeMark ? activeController.getAnchorRect(activeMark) : null),
        [activeController, activeMark],
    );
    const position = (() => {
        if (!openState || !activeController) return { index: 0, total: 0 };
        const entries = registry.group(activeController.groupId);
        const index = entries.findIndex((e) => e.controller.fieldId === openState.fieldId && markId(e.mark) === markId(openState.mark));
        return { index: Math.max(index, 0), total: entries.length };
    })();

    const api = useMemo<SpellingApi>(
        () => ({
            enabled,
            session,
            status,
            registry,
            retry: () => spellingClient.retry(),
            open,
            openGroup,
            close,
            isOpenFor: (fieldId) => openRef.current?.fieldId === fieldId,
            openMode: (fieldId) => (openRef.current?.fieldId === fieldId ? openRef.current.mode : null),
        }),
        [enabled, session, status, registry, spellingClient, open, openGroup, close],
    );

    return (
        <SpellingContext.Provider value={api}>
            {children}
            <style>{`
                .celuma-spelling-option:focus-visible { outline: 2px solid #49b6ad; outline-offset: 2px; }
                .celuma-spelling-summary button:focus-visible { outline: 2px solid #49b6ad; outline-offset: 2px; border-radius: 6px; }
                @media print {
                    .celuma-spelling-layer, .celuma-spelling-popover, .celuma-spelling-summary { display: none !important; }
                }
            `}</style>
            {openState && activeController && (
                <SpellingPopover
                    mode={openState.mode}
                    fieldLabel={activeController.label}
                    word={openState.mark.word}
                    suggestions={suggestions}
                    refusal={(replacement) => activeController.refusal(openState.mark, replacement)}
                    notice={applyNotice && applyNotice.key === suggestionKey ? applyNotice.text : null}
                    getAnchorRect={getAnchorRect}
                    position={position}
                    onApply={onApply}
                    onIgnore={onIgnore}
                    onClose={() => close(true)}
                    onPrevious={() => step(-1)}
                    onNext={() => step(1)}
                    containerRef={popoverRef}
                />
            )}
            <div role="status" aria-live="polite" style={visuallyHidden} data-testid="spelling-announcer">
                {announcement}
            </div>
        </SpellingContext.Provider>
    );
}
