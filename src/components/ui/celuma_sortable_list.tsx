import { useState, type ReactNode } from "react";
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

/**
 * CelumaSortableList — the shared drag-to-reorder list for Céluma.
 *
 * Each row carries a teal grab handle on the left; **only the handle initiates a
 * drag**, so checkboxes, inputs, selects and buttons inside a row stay fully
 * interactive (unlike making the whole row `draggable`). While dragging, the
 * lifted row dims with a teal ring and a teal indicator marks the drop position,
 * matching the rest of the Céluma component language (soft tint + teal accent).
 */
export default function CelumaSortableList<T extends SortableItem>({
    items,
    onReorder,
    renderItem,
    disabled = false,
    gap = 8,
}: Props<T>) {
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const [overIndex, setOverIndex] = useState<number | null>(null);

    const finishDrag = () => {
        if (dragIndex !== null && overIndex !== null && dragIndex !== overIndex) {
            onReorder(reorder(items, dragIndex, overIndex));
        }
        setDragIndex(null);
        setOverIndex(null);
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap }}>
            {items.map((item, idx) => {
                const isDragging = dragIndex === idx;
                const isOver = overIndex === idx && dragIndex !== null && dragIndex !== idx;
                // Indicator sits above the row when dropping before it, below when after.
                const indicatorBelow = isOver && dragIndex !== null && dragIndex < idx;

                return (
                    <div
                        key={item.key}
                        onDragEnter={() => { if (dragIndex !== null) setOverIndex(idx); }}
                        onDragOver={(e) => { if (dragIndex !== null) e.preventDefault(); }}
                        onDrop={(e) => { e.preventDefault(); finishDrag(); }}
                        style={{ position: "relative" }}
                    >
                        {/* Drop-position indicator */}
                        {isOver && (
                            <div
                                style={{
                                    position: "absolute",
                                    left: 0,
                                    right: 0,
                                    [indicatorBelow ? "bottom" : "top"]: -Math.ceil(gap / 2),
                                    height: 2,
                                    borderRadius: 2,
                                    background: tokens.primary,
                                    boxShadow: `0 0 0 2px ${tokens.primary}33`,
                                    zIndex: 2,
                                } as React.CSSProperties}
                            />
                        )}
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "6px 10px",
                                borderRadius: 10,
                                background: isDragging ? tokens.primary + "0f" : "#fafbfc",
                                border: `1.5px solid ${isDragging ? tokens.primary : "#eef1f0"}`,
                                boxShadow: isDragging ? `0 8px 18px rgba(0,0,0,.10), 0 0 0 3px ${tokens.primary}22` : "none",
                                opacity: isDragging ? 0.85 : 1,
                                transition: "background .15s, border-color .15s, box-shadow .15s",
                            }}
                        >
                            <span
                                draggable={!disabled}
                                onDragStart={(e) => {
                                    if (disabled) return;
                                    setDragIndex(idx);
                                    setOverIndex(idx);
                                    e.dataTransfer.effectAllowed = "move";
                                    // Firefox needs data set for a drag to start.
                                    e.dataTransfer.setData("text/plain", item.key);
                                }}
                                onDragEnd={finishDrag}
                                aria-label="Arrastrar para reordenar"
                                style={{
                                    cursor: disabled ? "default" : "grab",
                                    color: isDragging ? tokens.primary : "#9aa4ae",
                                    fontSize: 15,
                                    lineHeight: 1,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    padding: "2px 2px",
                                    borderRadius: 6,
                                    flexShrink: 0,
                                    touchAction: "none",
                                }}
                                onMouseEnter={(e) => { if (!disabled) (e.currentTarget as HTMLElement).style.color = tokens.primary; }}
                                onMouseLeave={(e) => { if (!disabled && !isDragging) (e.currentTarget as HTMLElement).style.color = "#9aa4ae"; }}
                            >
                                <HolderOutlined />
                            </span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                {renderItem(item, idx)}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
