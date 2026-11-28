import { createRoot } from "react-dom/client";
import { useState } from "react";
import CelumaModal from "../../src/components/ui/celuma_modal";
import { TableEditor } from "../../src/components/report/table_editor";
import SpellingProvider from "../../src/components/spelling/spelling_provider";

/**
 * Céluma 1.5 (#91) — real-browser harness for the report table editor modal.
 * Mounts the unmodified TableEditor inside the same CelumaModal (720 px) the
 * report editor uses, with synthetic tables. No API, no backend. Never bundled
 * into the production app. `harness-md` exposes the markdown that would be saved.
 *
 * Usage: /table_editor.html?table=narrow|wide|long
 */
function build(cols: number, rows: number, longText: boolean): string {
    const header = `|${Array.from({ length: cols }, (_, i) => ` Encabezado de la columna ${i + 1} `).join("|")}|`;
    const sep = `|${Array.from({ length: cols }, () => " --- ").join("|")}|`;
    const body = Array.from({ length: rows }, (_, r) =>
        `|${Array.from({ length: cols }, (_, c) =>
            longText && c === 1
                ? ` Infiltración difusa por células neoplásicas con patrón sólido, fila ${r + 1} `
                : ` F${r + 1}C${c + 1} `,
        ).join("|")}|`,
    );
    return [header, sep, ...body].join("\n");
}

const TABLES: Record<string, string> = {
    narrow: build(2, 4, true),
    wide: build(9, 6, true),
    long: build(4, 60, true),
};

const params = new URLSearchParams(window.location.search);
const key = params.get("table") ?? "wide";
// `spelling=1` mounts the real local spelling checker (#29) around the editor.
const withSpelling = params.get("spelling") === "1";

function Harness() {
    const [md, setMd] = useState(TABLES[key] ?? TABLES.wide);
    const editor = (
        <TableEditor
            value={md}
            onChange={setMd}
            spelling={withSpelling ? { groupId: "table:harness", label: "Sintética" } : undefined}
        />
    );
    return (
        <>
            <CelumaModal title="Editar tabla — Sintética" open width={720} footer={null} onCancel={() => {}}>
                {withSpelling ? <SpellingProvider enabled scopeKey="harness">{editor}</SpellingProvider> : editor}
            </CelumaModal>
            <pre data-testid="harness-md" style={{ display: "none" }}>{md}</pre>
        </>
    );
}

createRoot(document.getElementById("root")!).render(<Harness />);
