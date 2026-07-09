import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { HolderOutlined } from "@ant-design/icons";
import { tokens } from "../design/tokens";

export interface SortableItem {
    key: string;
}

interface Props<T extends SortableItem> {
    items: T[];
    /** Called with the reordered array when a drag completes on a new position. */
    onReorder: (items: T[]) => void;
    /** Renders the content of a row (everything to the right of the drag handle). */
    renderItem: (item: T, index: number) => ReactNode;
    /** Disable dragging (rows still render, handle is inert). */
    disabled?: boolean;
    /** Vertical gap between rows (px). Default 8. */
    gap?: number;
}

function reorder<T>(list: T[], from: number, to: number): T[] {
    const result = [...list];
    const [moved] = result.splice(from, 1);
    result.splice(to, 0, moved);
    return result;
}

const SETTLE_TRANSITION = "transform .22s cubic-bezier(.22,.9,.32,1), box-shadow .18s, border-color .15s, background .15s";
const FLIP_TRANSITION = "transform .22s cubic-bezier(.22,.9,.32,1)";

interface DragState {
    key: string;
    pointerId: number;
    startClientY: number;
    startOffsetTop: number;
    height: number;
    /** Absolute, container-relative Y the row should currently be drawn at (follows the cursor). */
    desiredTop: number;
}

function dragTransform(offset: number): string {
    return `translateY(${offset}px) scale(1.02) rotate(-.4deg)`;
}

/**
 * CelumaSortableList — the shared drag-to-reorder list for Céluma.
 *
 * Each row carries a teal grab handle on the left; **only the handle initiates a
 * drag**, so checkboxes, inputs, selects and buttons inside a row stay fully
 * interactive (unlike making the whole row `draggable`).
 *
 * Built on raw Pointer Events rather than the native HTML5 Drag & Drop API — the
 * same approach used by dnd-kit / Framer Motion's `Reorder` / Trello: HTML5 DnD
 * only reports position on `drop` and hands the drag ghost to the browser, which
 * reads as laggy and "dead" until release. Here the grabbed row tracks the cursor
 * 1:1 via an un-transitioned `transform` (so it feels instant regardless of how far
 * you drag), the list reorders **live** as you cross a neighboring row's midpoint
 * (closest-center collision, same rule dnd-kit uses), and every displaced row plays
 * a short FLIP slide into its new slot *during* the drag — not after. On release,
 * the grabbed row just eases the last bit of offset back to zero (it's already in
 * its final slot), giving a quick "settle" instead of a second, disconnected
 * animation.
 *
 * `pointermove`/`pointerup`/`pointercancel` are listened to on `window` (capture
 * phase, registered once the drag starts) rather than only on the handle element.
 * Releasing the pointer over anything other than the handle — the modal backdrop,
 * the sidebar, outside the viewport — would otherwise never reach a handler scoped
 * to the handle, leaving the row glued to the cursor until the next click restarted
 * a drag and incidentally "unstuck" the old one. A `blur` listener finalizes the
 * drag defensively too, in case focus leaves the window mid-drag.
 */
export default function CelumaSortableList<T extends SortableItem>({
    items,
    onReorder,
    renderItem,
    disabled = false,
    gap = 8,
}: Props<T>) {
    const [draggingKey, setDraggingKey] = useState<string | null>(null);
    const [, forceRender] = useState(0);

    const orderRef = useRef<string[]>(items.map((i) => i.key));
    const dragStateRef = useRef<DragState | null>(null);
    const rowRefs = useRef(new Map<string, HTMLDivElement>());
    const prevTops = useRef(new Map<string, number>());
    const rafRef = useRef<number | null>(null);

    const itemsByKey = useMemo(() => new Map(items.map((it) => [it.key, it])), [items]);

    // Always-current refs so the window-level drag handlers (created once, below)
    // never close over a stale `items`/`onReorder` from whatever render happened to
    // be active when the drag started.
    const itemsRef = useRef(items);
    const itemsByKeyRef = useRef(itemsByKey);
    const onReorderRef = useRef(onReorder);
    itemsRef.current = items;
    itemsByKeyRef.current = itemsByKey;
    onReorderRef.current = onReorder;

    // Keep the working order in sync with the controlled `items` prop when not
    // actively dragging (rows added/removed/reset from outside).
    useLayoutEffect(() => {
        if (dragStateRef.current) return;
        const keys = items.map((i) => i.key);
        const prev = orderRef.current;
        const same = prev.length === keys.length && prev.every((k, i) => k === keys[i]);
        if (!same) {
            orderRef.current = keys;
            forceRender((n) => n + 1);
        }
    }, [items]);

    const sortedItems = orderRef.current
        .map((k) => itemsByKey.get(k))
        .filter((it): it is T => !!it);

    // FLIP: every time the order changes (including mid-drag, on each swap), animate
    // every *other* row from its previous flow position to its new one so the
    // rearrangement visibly slides instead of jumping.
    //
    // The dragged row is excluded from FLIP — instead, whenever a swap moves it to a
    // new slot, its own base `offsetTop` jumps to that slot's position. If we kept
    // applying the same raw pointer delta on top of that new base, the row would
    // visibly jerk by a whole row's height at every swap (the reported "vibration").
    // So we re-anchor it here: recompute its transform so it still lands exactly on
    // `desiredTop` (the absolute position the cursor wants it at), just measured
    // against its new base — same visual spot, zero jump, no transition needed.
    useLayoutEffect(() => {
        const state = dragStateRef.current;
        const draggingNow = state?.key ?? null;
        const nextTops = new Map<string, number>();
        rowRefs.current.forEach((el, key) => {
            const top = el.offsetTop;
            nextTops.set(key, top);
            if (key === draggingNow) {
                if (state) {
                    el.style.transition = "none";
                    el.style.transform = dragTransform(state.desiredTop - top);
                }
                return;
            }
            const prevTop = prevTops.current.get(key);
            if (prevTop !== undefined && prevTop !== top) {
                const delta = prevTop - top;
                el.style.transition = "none";
                el.style.transform = `translateY(${delta}px)`;
                requestAnimationFrame(() => {
                    el.style.transition = FLIP_TRANSITION;
                    el.style.transform = "translateY(0)";
                });
            }
        });
        prevTops.current = nextTops;
    });

    const processPointerMove = (clientY: number) => {
        const state = dragStateRef.current;
        if (!state) return;
        const rowEl = rowRefs.current.get(state.key);
        if (!rowEl) return;

        const deltaY = clientY - state.startClientY;
        const desiredTop = state.startOffsetTop + deltaY;
        state.desiredTop = desiredTop;
        rowEl.style.transition = "none";
        rowEl.style.transform = dragTransform(desiredTop - rowEl.offsetTop);

        // Closest-center collision: move the dragged row into whichever slot's
        // *resting* center (its `offsetTop`, ignoring any transform) its live ghost
        // center is nearest to. This must use the same formula for every row,
        // including the dragged one — comparing against the dragged row's own
        // resting slot is what lets a neighbor "win" once the ghost has moved far
        // enough away from it. (Comparing the ghost to itself instead — i.e. using
        // its live position as its own reference point — makes the distance zero by
        // construction, so it always "wins" and no swap can ever happen.)
        const draggedCenter = desiredTop + state.height / 2;
        const order = orderRef.current;
        const currentIndex = order.indexOf(state.key);
        let nearestIndex = currentIndex;
        let nearestDistance = Infinity;
        order.forEach((key, idx) => {
            const el = rowRefs.current.get(key);
            if (!el) return;
            const center = el.offsetTop + el.offsetHeight / 2;
            const distance = Math.abs(center - draggedCenter);
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestIndex = idx;
            }
        });

        if (nearestIndex !== currentIndex) {
            orderRef.current = reorder(order, currentIndex, nearestIndex);
            forceRender((n) => n + 1);
        }
    };

    // Ends the current drag no matter how it was triggered (a real drop, a
    // pointercancel, or a defensive window blur) and, if the order actually
    // changed, commits it via onReorder.
    const finalizeDrag = () => {
        const state = dragStateRef.current;
        if (!state) return;
        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
        const rowEl = rowRefs.current.get(state.key);

        dragStateRef.current = null;
        setDraggingKey(null);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";

        const handlers = handlersRef.current;
        if (handlers) {
            window.removeEventListener("pointermove", handlers.move, true);
            window.removeEventListener("pointerup", handlers.up, true);
            window.removeEventListener("pointercancel", handlers.up, true);
            window.removeEventListener("blur", handlers.blur, true);
        }

        if (rowEl) {
            // The row is already in its final flow slot; just ease the pointer
            // offset back to zero for a quick "settle" instead of a hard snap.
            rowEl.style.transition = SETTLE_TRANSITION;
            rowEl.style.transform = "translateY(0) scale(1) rotate(0deg)";
            const clear = () => {
                rowEl.style.transition = "";
                rowEl.style.transform = "";
                rowEl.removeEventListener("transitionend", clear);
            };
            rowEl.addEventListener("transitionend", clear);
        }

        const finalOrder = orderRef.current;
        const originalOrder = itemsRef.current.map((i) => i.key);
        const changed = finalOrder.length !== originalOrder.length || finalOrder.some((k, i) => k !== originalOrder[i]);
        if (changed) {
            const byKey = itemsByKeyRef.current;
            onReorderRef.current(finalOrder.map((k) => byKey.get(k)).filter((it): it is T => !!it));
        }
    };

    // Created once and reused for the lifetime of the component so add/removeEventListener
    // always refer to the same function identity. Everything inside reads from refs /
    // stable setters, so it never goes stale even though it's "frozen" at first render.
    const handlersRef = useRef<{
        move: (e: PointerEvent) => void;
        up: (e: PointerEvent) => void;
        blur: () => void;
    } | null>(null);
    if (!handlersRef.current) {
        handlersRef.current = {
            move: (e: PointerEvent) => {
                const state = dragStateRef.current;
                if (!state || e.pointerId !== state.pointerId) return;
                const clientY = e.clientY;
                // Batch to animation frames so DOM reads (offsetTop) stay in sync
                // with the last committed reorder instead of racing ahead of React's render.
                if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
                rafRef.current = requestAnimationFrame(() => {
                    rafRef.current = null;
                    processPointerMove(clientY);
                });
            },
            up: (e: PointerEvent) => {
                const state = dragStateRef.current;
                if (!state || e.pointerId !== state.pointerId) return;
                finalizeDrag();
            },
            blur: () => {
                if (dragStateRef.current) finalizeDrag();
            },
        };
    }

    // Defensive cleanup if the list unmounts mid-drag (e.g. the modal is closed
    // while a row is being dragged).
    useEffect(() => {
        return () => {
            const handlers = handlersRef.current;
            if (handlers) {
                window.removeEventListener("pointermove", handlers.move, true);
                window.removeEventListener("pointerup", handlers.up, true);
                window.removeEventListener("pointercancel", handlers.up, true);
                window.removeEventListener("blur", handlers.blur, true);
            }
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
        };
    }, []);

    const handlePointerDown = (e: ReactPointerEvent, item: T) => {
        if (disabled) return;
        e.preventDefault();
        const rowEl = rowRefs.current.get(item.key);
        if (!rowEl) return;
        dragStateRef.current = {
            key: item.key,
            pointerId: e.pointerId,
            startClientY: e.clientY,
            startOffsetTop: rowEl.offsetTop,
            height: rowEl.offsetHeight,
            desiredTop: rowEl.offsetTop,
        };
        setDraggingKey(item.key);
        document.body.style.cursor = "grabbing";
        document.body.style.userSelect = "none";

        const handlers = handlersRef.current!;
        window.addEventListener("pointermove", handlers.move, true);
        window.addEventListener("pointerup", handlers.up, true);
        window.addEventListener("pointercancel", handlers.up, true);
        window.addEventListener("blur", handlers.blur, true);
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap, position: "relative", width: "100%" }}>
            {sortedItems.map((item, idx) => {
                const isDragging = draggingKey === item.key;

                return (
                    <div
                        key={item.key}
                        ref={(el) => {
                            if (el) rowRefs.current.set(item.key, el);
                            else rowRefs.current.delete(item.key);
                        }}
                        style={{
                            position: "relative",
                            width: "100%",
                            boxSizing: "border-box",
                            zIndex: isDragging ? 5 : 1,
                            willChange: "transform",
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                width: "100%",
                                boxSizing: "border-box",
                                padding: "10px 14px",
                                borderRadius: tokens.radius,
                                background: isDragging ? `${tokens.primary}0f` : tokens.cardBg,
                                border: `2px solid ${isDragging ? tokens.primary : "#e5e7eb"}`,
                                boxShadow: isDragging
                                    ? `0 14px 28px rgba(0,0,0,.16), 0 0 0 3px ${tokens.primary}33`
                                    : "0 1px 2px rgba(16,24,32,.03)",
                                fontFamily: tokens.textFont,
                            }}
                        >
                            <span
                                onPointerDown={(e) => handlePointerDown(e, item)}
                                aria-label="Arrastrar para reordenar"
                                style={{
                                    cursor: disabled ? "default" : isDragging ? "grabbing" : "grab",
                                    color: isDragging ? tokens.primary : "#b0b8c0",
                                    fontSize: 16,
                                    lineHeight: 1,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    padding: "3px 3px",
                                    borderRadius: 6,
                                    flexShrink: 0,
                                    touchAction: "none",
                                    transform: isDragging ? "scale(1.15)" : "scale(1)",
                                    transition: "color .15s, transform .15s ease",
                                }}
                                onMouseEnter={(e) => { if (!disabled) (e.currentTarget as HTMLElement).style.color = tokens.primary; }}
                                onMouseLeave={(e) => { if (!disabled && !isDragging) (e.currentTarget as HTMLElement).style.color = "#b0b8c0"; }}
                            >
                                <HolderOutlined />
                            </span>
                            <div style={{ flex: 1, minWidth: 0, width: "100%" }}>
                                {renderItem(item, idx)}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
