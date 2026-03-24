import React, { useCallback, useRef, useState } from "react";
import { Button, Input, Tooltip } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { tokens } from "../design/tokens";
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

    const borderCell: React.CSSProperties = { border: "1px solid #e8e8e8", padding: "2px 4px" };
    const headerCell: React.CSSProperties = { ...borderCell, background: "#f5f5f5", minWidth: 90 };

    return (
        <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
                <thead>
                    <tr>
                        {headers.map((h, ci) => (
                            <th key={ci} style={headerCell}>
                                <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                                    <Input
                                        size="small"
                                        value={h}
                                        disabled={readOnly}
                                        onChange={(e) => setHeader(ci, e.target.value)}
                                        placeholder={`Col ${ci + 1}`}
                                        style={{
                                            fontWeight: 600,
                                            flex: 1,
                                            borderColor: "transparent",
                                            boxShadow: "none",
                                            background: "transparent",
                                        }}
                                    />
                                    {!readOnly && headers.length > 1 && (
                                        <Tooltip title="Eliminar columna">
                                            <Button
                                                type="text"
                                                size="small"
                                                danger
                                                icon={<DeleteOutlined />}
                                                onClick={() => delCol(ci)}
                                                style={{ flexShrink: 0, fontSize: 11 }}
                                            />
                                        </Tooltip>
                                    )}
                                </div>
                            </th>
                        ))}
                        {!readOnly && (
                            <th style={{ ...borderCell, background: "#f5f5f5", width: 36, textAlign: "center" }}>
                                <Tooltip title="Añadir columna">
                                    <Button
                                        type="text"
                                        size="small"
                                        icon={<PlusOutlined />}
                                        onClick={addCol}
                                        style={{ color: tokens.primary }}
                                    />
                                </Tooltip>
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
                                        style={{
                                            borderColor: "transparent",
                                            boxShadow: "none",
                                            background: "transparent",
                                        }}
                                    />
                                </td>
                            ))}
                            {!readOnly && (
                                <td style={{ ...borderCell, width: 36, textAlign: "center" }}>
                                    {rows.length > 1 && (
                                        <Tooltip title="Eliminar fila">
                                            <Button
                                                type="text"
                                                size="small"
                                                danger
                                                icon={<DeleteOutlined />}
                                                onClick={() => delRow(ri)}
                                            />
                                        </Tooltip>
                                    )}
                                </td>
                            )}
                        </tr>
                    ))}
                    {!readOnly && (
                        <tr>
                            <td colSpan={headers.length + 1} style={{ padding: 6 }}>
                                <Button
                                    type="dashed"
                                    size="small"
                                    icon={<PlusOutlined />}
                                    onClick={addRow}
                                    style={{ width: "100%" }}
                                >
                                    Añadir fila
                                </Button>
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}
