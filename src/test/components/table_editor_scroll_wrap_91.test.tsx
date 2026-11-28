/**
 * Céluma 1.5 (#91) — the table editor scrolls when the table is too large and
 * wraps long text inside the cell.
 *
 * jsdom covers the structure (scroll area, fixed column widths, sticky header,
 * wrapping textareas) and the single-line rule of a markdown cell. It cannot
 * establish real scrolling or wrapping geometry: that is the real-browser check.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TableEditor } from "../../components/report/table_editor";
import {
    TABLE_EDITOR_ACTION_WIDTH,
    TABLE_EDITOR_COLUMN_WIDTH,
    flattenCellText,
    parseMarkdownTable,
} from "../../components/report/table_utils";

function wideTable(cols: number, rows: number): string {
    const header = `|${Array.from({ length: cols }, (_, i) => ` H${i + 1} `).join("|")}|`;
    const sep = `|${Array.from({ length: cols }, () => " --- ").join("|")}|`;
    const body = Array.from({ length: rows }, (_, r) =>
        `|${Array.from({ length: cols }, (_, c) => ` r${r + 1}c${c + 1} `).join("|")}|`,
    );
    return [header, sep, ...body].join("\n");
}

describe("TableEditor scroll area (#91)", () => {
    it("puts the table in an area that scrolls both ways with a capped height", () => {
        render(<TableEditor value={wideTable(8, 40)} onChange={() => {}} />);
        const scroller = screen.getByTestId("table-editor-scroll");
        expect(scroller.style.overflow).toBe("auto");
        expect(scroller.style.maxHeight).not.toBe("");
        expect(scroller.querySelector("table")).not.toBeNull();
    });

    it("keeps a minimum width per column instead of squeezing many columns", () => {
        render(<TableEditor value={wideTable(8, 2)} onChange={() => {}} />);
        const table = screen.getByTestId("table-editor-scroll").querySelector("table")!;
        expect(table.style.tableLayout).toBe("fixed");
        expect(table.style.minWidth).toBe(`${8 * TABLE_EDITOR_COLUMN_WIDTH + TABLE_EDITOR_ACTION_WIDTH}px`);
        expect(table.querySelectorAll("col")).toHaveLength(9);
    });

    it("keeps the header row sticky and the add-row button outside the scroll area", () => {
        render(<TableEditor value={wideTable(3, 30)} onChange={() => {}} />);
        const scroller = screen.getByTestId("table-editor-scroll");
        for (const th of Array.from(scroller.querySelectorAll("th"))) {
            expect(th.style.position).toBe("sticky");
            expect(th.style.top).toBe("0px");
        }
        const addRow = screen.getByRole("button", { name: /Añadir fila/ });
        expect(scroller.contains(addRow)).toBe(false);
    });
});

describe("TableEditor cell wrapping (#91)", () => {
    it("edits every header and cell in a wrapping textarea with a Spanish name", () => {
        render(<TableEditor value={wideTable(2, 2)} onChange={() => {}} />);
        const cell = screen.getByRole("textbox", { name: "Fila 2, columna 1" }) as HTMLTextAreaElement;
        expect(cell.tagName).toBe("TEXTAREA");
        expect(cell.style.whiteSpace).toBe("pre-wrap");
        expect(cell.style.overflowWrap).toBe("break-word");
        expect(screen.getByRole("textbox", { name: "Encabezado 2" }).tagName).toBe("TEXTAREA");
    });

    it("stores long text whole in its cell", () => {
        const onChange = vi.fn();
        render(<TableEditor value={wideTable(2, 1)} onChange={onChange} />);
        const long = "Infiltración difusa por células neoplásicas con patrón sólido y áreas de necrosis";
        fireEvent.change(screen.getByRole("textbox", { name: "Fila 1, columna 2" }), { target: { value: long } });
        const saved = parseMarkdownTable(onChange.mock.calls.at(-1)![0]);
        expect(saved.rows[0]).toEqual(["r1c1", long]);
        expect(saved.rows).toHaveLength(1);
    });

    it("never stores a line break: pasted breaks become spaces and Enter inserts nothing", () => {
        const onChange = vi.fn();
        render(<TableEditor value={wideTable(2, 1)} onChange={onChange} />);
        const cell = screen.getByRole("textbox", { name: "Fila 1, columna 1" });
        fireEvent.change(cell, { target: { value: "uno\ndos\r\ntres" } });
        const md = onChange.mock.calls.at(-1)![0] as string;
        expect(parseMarkdownTable(md).rows).toEqual([["uno dos tres", "r1c2"]]);
        expect(md.split("\n")).toHaveLength(3);

        const enter = fireEvent.keyDown(cell, { key: "Enter" });
        expect(enter).toBe(false); // default prevented
    });

    it("flattens every kind of line break to one space", () => {
        expect(flattenCellText("a\nb\r\nc\rd")).toBe("a b c d");
        expect(flattenCellText("sin saltos")).toBe("sin saltos");
    });
});
