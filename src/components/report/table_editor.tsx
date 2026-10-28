import React, { useCallback, useMemo, useRef, useState } from "react";
import { Input, type InputRef } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { tokens } from "../design/tokens";
import CelumaButton from "../ui/button";
import ActionButtonPanel from "../ui/action_button_panel";
import { parseMarkdownTable, serializeMarkdownTable } from "./table_utils";
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

/** One header/cell input; with spelling options it carries the editor-only mirror layer. */
function CellInput({
    value,
    onChange,
    disabled,
    placeholder,
    style,
    spelling,
}: {
    value: string;
    onChange: (value: string) => void;
    disabled: boolean;
    placeholder?: string;
    style: React.CSSProperties;
    spelling?: SpellingFieldOptions;
}) {
    const antInputRef = useRef<InputRef | null>(null);
    const elementRef = useMemo(() => ({
        get current() {
            return antInputRef.current?.input ?? null;
        },
    }), []);
    const assist = usePlainSpelling({ spelling, elementRef, value, disabled, multiline: false });
    const input = (
        <Input
            {...assist.controlProps}
            {...(spelling ? { ref: antInputRef } : null)}
            size="small"
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={spelling ? (e) => { assist.handleKeyDown(e); } : undefined}
            placeholder={placeholder}
            style={spelling ? { ...style, position: "relative", zIndex: 1 } : style}
        />
    );
    if (!spelling) return input;
    return (
        <div style={{ position: "relative", flex: style.flex }}>
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
        setRows(r); emit(headers, r);
    };

    const delRow = (ri: number) => {
        if (rows.length <= 1) return;
        const r = rows.filter((_, i) => i !== ri);
        setRows(r); emit(headers, r);
    };

    const borderCell: React.CSSProperties = { border: "1px solid #eef1f0", padding: "3px 5px" };
    const headerCell: React.CSSProperties = { ...borderCell, background: "#fafbfc", minWidth: 90 };
    const cellInput: React.CSSProperties = { borderColor: "transparent", boxShadow: "none", background: "transparent" };

    return (
        <div style={{ overflowX: "auto", border: "2px solid #e5e7eb", borderRadius: 12, padding: 6 }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
                <thead>
                    <tr>
                        {headers.map((h, ci) => (
                            <th key={ci} style={headerCell}>
                                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                    <CellInput
                                        value={h}
                                        disabled={readOnly}
                                        onChange={(v) => setHeader(ci, v)}
                                        placeholder={`Col ${ci + 1}`}
                                        style={{ ...cellInput, fontWeight: 700, flex: 1, color: tokens.textPrimary }}
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
                            <th style={{ ...headerCell, width: 40, minWidth: 40, textAlign: "center" }}>
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
                                        style={{ ...cellInput, color: tokens.textPrimary }}
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
                                <td style={{ ...borderCell, width: 40, textAlign: "center" }}>
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
                    {!readOnly && (
                        <tr>
                            <td colSpan={headers.length + 1} style={{ padding: 6 }}>
                                <CelumaButton
                                    size="small"
                                    fullWidth
                                    icon={<PlusOutlined />}
                                    onClick={addRow}
                                >
                                    Añadir fila
                                </CelumaButton>
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
            {spelling && <SpellingSummary groupId={spelling.groupId} style={{ margin: "8px 4px 2px" }} />}
        </div>
    );
}
