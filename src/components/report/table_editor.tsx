import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { tokens } from "../design/tokens";
import CelumaButton from "../ui/button";
import ActionButtonPanel from "../ui/action_button_panel";
import {
    TABLE_EDITOR_ACTION_WIDTH,
    TABLE_EDITOR_COLUMN_WIDTH,
    TABLE_EDITOR_MAX_HEIGHT,
    flattenCellText,
    parseMarkdownTable,
    serializeMarkdownTable,
} from "./table_utils";
import { usePlainSpelling } from "../spelling/plain_spelling";
import { SpellingSummary } from "../spelling/spelling_summary";
import type { SpellingFieldOptions } from "../spelling/spelling_context";

export type { TableEditorProps };

interface TableEditorProps {
    value: string;
    onChange: (md: string) => void;
    readOnly?: boolean;
    /**
     * Opt-in local spelling assistance for header and cell text (report
     * authoring only, Céluma 1.4 #29). Every cell is reviewed as one group;
     * whole numeric/code cells are skipped by the tokenizer, and the markdown
     * serialization is unchanged.
     */
    spelling?: { groupId: string; label: string };
}

/** Sets a textarea to the height of its wrapped content. */
function fitHeight(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
}

/**
 * One header/cell field. A single-line value shown in a textarea so long text
 * wraps inside the cell and the cell grows with it; with spelling options it
 * carries the editor-only mirror layer.
 */
function CellInput({
    value,
    onChange,
    disabled,
    placeholder,
    ariaLabel,
    style,
    spelling,
}: {
    value: string;
    onChange: (value: string) => void;
    disabled: boolean;
    placeholder?: string;
    ariaLabel: string;
    style: React.CSSProperties;
    spelling?: SpellingFieldOptions;
}) {
    const ref = useRef<HTMLTextAreaElement | null>(null);
    const assist = usePlainSpelling({
        spelling,
        elementRef: ref,
        value,
        disabled,
        multiline: true,
        normalize: flattenCellText,
    });

    // Grow with the wrapped text (no inner scrollbar): measure after each value change.
    useLayoutEffect(() => {
        if (ref.current) fitHeight(ref.current);
    }, [value]);

    // Measure again when the cell's width changes: the modal mounts hidden (nothing
    // to measure yet), and a column can change width after the first render.
    useEffect(() => {
        const el = ref.current;
        if (!el || typeof ResizeObserver === "undefined") return;
        let width = -1; // the first notification (on observe) always measures
        const observer = new ResizeObserver(() => {
            if (el.offsetWidth === width) return;
            width = el.offsetWidth;
            fitHeight(el);
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    const input = (
        <textarea
            {...assist.controlProps}
            ref={ref}
            rows={1}
            value={value}
            disabled={disabled}
            aria-label={ariaLabel}
            placeholder={placeholder}
            onChange={(e) => {
                const el = e.target;
                const raw = el.value;
                const next = flattenCellText(raw);
                if (next !== raw) {
                    // Keep the caret where the paste ended, not at the end of the cell.
                    const caret = flattenCellText(raw.slice(0, el.selectionStart ?? raw.length)).length;
                    queueMicrotask(() => {
                        if (document.activeElement === el && el.value === next) el.setSelectionRange(caret, caret);
                    });
                }
                onChange(next);
            }}
            onKeyDown={(e) => {
                if (spelling && assist.handleKeyDown(e)) return;
                if (e.key === "Enter") e.preventDefault();
            }}
            style={{
                display: "block",
                width: "100%",
                boxSizing: "border-box",
                margin: 0,
                padding: "4px 7px",
                border: "1px solid transparent",
                borderRadius: 6,
                background: "transparent",
                resize: "none",
                overflow: "hidden",
                fontFamily: "inherit",
                fontSize: 13,
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
                overflowWrap: "break-word",
                ...style,
                ...(spelling ? { position: "relative" as const, zIndex: 1 } : null),
            }}
        />
    );
    if (!spelling) return input;
    return (
        <div style={{ position: "relative", flex: style.flex, minWidth: 0 }}>
            {input}
            {assist.layer}
            {assist.description}
        </div>
    );
}

export function TableEditor({ value, onChange, readOnly = false, spelling }: TableEditorProps) {
    const initial = useRef(parseMarkdownTable(value));
    const [headers, setHeaders] = useState<string[]>(initial.current.headers);
    const [rows, setRows] = useState<string[][]>(
        initial.current.rows.map((r) => {
            const padded = [...r];
            while (padded.length < initial.current.headers.length) padded.push("");
            return padded;
        })
    );
    const scrollerRef = useRef<HTMLDivElement | null>(null);
    // After adding a row or column, bring it into view inside the scroll area.
    const pendingReveal = useRef<"row" | "col" | null>(null);

    useLayoutEffect(() => {
        const reveal = pendingReveal.current;
        const scroller = scrollerRef.current;
        if (!reveal || !scroller) return;
        pendingReveal.current = null;
        if (reveal === "row") scroller.scrollTop = scroller.scrollHeight;
        else scroller.scrollLeft = scroller.scrollWidth;
    }, [headers.length, rows.length]);

    const emit = useCallback(
        (h: string[], r: string[][]) => onChange(serializeMarkdownTable(h, r)),
        [onChange]
    );

    const setHeader = (ci: number, val: string) => {
        const next = headers.map((h, i) => (i === ci ? val : h));
        setHeaders(next);
        emit(next, rows);
    };

    const setCell = (ri: number, ci: number, val: string) => {
        const next = rows.map((row, r) =>
            r === ri ? row.map((c, i) => (i === ci ? val : c)) : row
        );
        setRows(next);
        emit(headers, next);
    };

    const addCol = () => {
        const h = [...headers, `Col ${headers.length + 1}`];
        const r = rows.map((row) => [...row, ""]);
        pendingReveal.current = "col";
        setHeaders(h); setRows(r); emit(h, r);
    };

    const delCol = (ci: number) => {
        if (headers.length <= 1) return;
        const h = headers.filter((_, i) => i !== ci);
        const r = rows.map((row) => row.filter((_, i) => i !== ci));
        setHeaders(h); setRows(r); emit(h, r);
    };

    const addRow = () => {
        const r = [...rows, headers.map(() => "")];
        pendingReveal.current = "row";
        setRows(r); emit(headers, r);
    };

    const delRow = (ri: number) => {
        if (rows.length <= 1) return;
        const r = rows.filter((_, i) => i !== ri);
        setRows(r); emit(headers, r);
    };

    const borderCell: React.CSSProperties = { border: "1px solid #eef1f0", padding: "3px 5px", verticalAlign: "top" };
    // The header row stays visible while the rows scroll under it.
    const headerCell: React.CSSProperties = {
        ...borderCell,
        background: "#fafbfc",
        position: "sticky",
        top: 0,
        zIndex: 2,
        boxShadow: "inset 0 -1px 0 #e5e7eb",
    };
    const cellInput: React.CSSProperties = { color: tokens.textPrimary };
    const actionWidth = readOnly ? 0 : TABLE_EDITOR_ACTION_WIDTH;
    const minTableWidth = headers.length * TABLE_EDITOR_COLUMN_WIDTH + actionWidth;

    return (
        <div style={{ border: "2px solid #e5e7eb", borderRadius: 12, padding: 6 }}>
            <div
                ref={scrollerRef}
                data-testid="table-editor-scroll"
                style={{ overflow: "auto", maxHeight: TABLE_EDITOR_MAX_HEIGHT, overscrollBehavior: "contain" }}
            >
                <table
                    style={{
                        borderCollapse: "separate",
                        borderSpacing: 0,
                        tableLayout: "fixed",
                        width: "100%",
                        minWidth: minTableWidth,
                        fontSize: 13,
                    }}
                >
                    <colgroup>
                        {headers.map((_, ci) => (
                            <col key={ci} style={{ width: TABLE_EDITOR_COLUMN_WIDTH }} />
                        ))}
                        {!readOnly && <col style={{ width: TABLE_EDITOR_ACTION_WIDTH }} />}
                    </colgroup>
                    <thead>
                        <tr>
                            {headers.map((h, ci) => (
                                <th key={ci} style={headerCell}>
                                    <div style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
                                        <CellInput
                                            value={h}
                                            disabled={readOnly}
                                            onChange={(v) => setHeader(ci, v)}
                                            placeholder={`Col ${ci + 1}`}
                                            ariaLabel={`Encabezado ${ci + 1}`}
                                            style={{ ...cellInput, fontWeight: 700, flex: 1, minWidth: 0 }}
                                            spelling={spelling && {
                                                fieldId: `${spelling.groupId}:h${ci}`,
                                                groupId: spelling.groupId,
                                                order: ci,
                                                label: `${spelling.label} — encabezado ${ci + 1}`,
                                            }}
                                        />
                                        {!readOnly && headers.length > 1 && (
                                            <ActionButtonPanel
                                                size="xxsmall"
                                                actions={[{ icon: <DeleteOutlined />, tooltip: "Eliminar columna", ariaLabel: "Eliminar columna", danger: true, onClick: () => delCol(ci) }]}
                                            />
                                        )}
                                    </div>
                                </th>
                            ))}
                            {!readOnly && (
                                <th style={{ ...headerCell, textAlign: "center" }}>
                                    <ActionButtonPanel
                                        size="xxsmall"
                                        actions={[{ icon: <PlusOutlined />, tooltip: "Añadir columna", ariaLabel: "Añadir columna", onClick: addCol }]}
                                    />
                                </th>
                            )}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, ri) => (
                            <tr key={ri}>
                                {headers.map((_, ci) => (
                                    <td key={ci} style={borderCell}>
                                        <CellInput
                                            value={row[ci] ?? ""}
                                            disabled={readOnly}
                                            onChange={(v) => setCell(ri, ci, v)}
                                            ariaLabel={`Fila ${ri + 1}, columna ${ci + 1}`}
                                            style={cellInput}
                                            spelling={spelling && {
                                                fieldId: `${spelling.groupId}:r${ri}c${ci}`,
                                                groupId: spelling.groupId,
                                                order: (ri + 1) * 10_000 + ci,
                                                label: `${spelling.label} — fila ${ri + 1}, columna ${ci + 1}`,
                                            }}
                                        />
                                    </td>
                                ))}
                                {!readOnly && (
                                    <td style={{ ...borderCell, textAlign: "center" }}>
                                        {rows.length > 1 && (
                                            <ActionButtonPanel
                                                size="xxsmall"
                                                actions={[{ icon: <DeleteOutlined />, tooltip: "Eliminar fila", ariaLabel: "Eliminar fila", danger: true, onClick: () => delRow(ri) }]}
                                            />
                                        )}
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {!readOnly && (
                <div style={{ padding: "6px 0 0" }}>
                    <CelumaButton
                        size="small"
                        fullWidth
                        icon={<PlusOutlined />}
                        onClick={addRow}
                    >
                        Añadir fila
                    </CelumaButton>
                </div>
            )}
            {spelling && <SpellingSummary groupId={spelling.groupId} style={{ margin: "8px 4px 2px" }} />}
        </div>
    );
}
