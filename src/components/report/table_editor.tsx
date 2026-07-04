import React, { useCallback, useRef, useState } from "react";
import { Input } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { tokens } from "../design/tokens";
import CelumaButton from "../ui/button";
import ActionButtonPanel from "../ui/action_button_panel";
import { parseMarkdownTable, serializeMarkdownTable } from "./table_utils";

export type { TableEditorProps };

interface TableEditorProps {
    value: string;
    onChange: (md: string) => void;
    readOnly?: boolean;
}

export function TableEditor({ value, onChange, readOnly = false }: TableEditorProps) {
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
                                    <Input
                                        size="small"
                                        value={h}
                                        disabled={readOnly}
                                        onChange={(e) => setHeader(ci, e.target.value)}
                                        placeholder={`Col ${ci + 1}`}
                                        style={{ ...cellInput, fontWeight: 700, flex: 1, color: tokens.textPrimary }}
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
                                    <Input
                                        size="small"
                                        value={row[ci] ?? ""}
                                        disabled={readOnly}
                                        onChange={(e) => setCell(ri, ci, e.target.value)}
                                        style={{ ...cellInput, color: tokens.textPrimary }}
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
        </div>
    );
}
