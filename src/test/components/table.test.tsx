import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CelumaTable } from "../../components/ui/table";
import { matchesQuery } from "../../lib/search";

// Regression coverage for Céluma 1.3 Phase 1 (Workstream 2). CelumaTable is the
// shared table used by Estudios (study_types.tsx) and list de precios
// (price_catalog.tsx), among others — this exercises it with the same
// searchFilter/sorter pattern those pages use, so it stands in as concrete
// evidence for both screens without needing a live backend.

interface StudyRow {
    id: string;
    code: string;
    name: string;
}

// Intentionally unsorted, includes accented Spanish names, mirrors a "Estudios"/
// "list de precios" style dataset large enough to force pagination (default pageSize 10).
const rows: StudyRow[] = [
    { id: "1", code: "HIST", name: "Histopatología" },
    { id: "2", code: "CITO", name: "Citología Exfoliativa" },
    { id: "3", code: "INMU", name: "Inmunohistoquímica" },
    { id: "4", code: "NEFR", name: "Nefropatología" },
    { id: "5", code: "ANAT", name: "Anatomía Patológica" },
    { id: "6", code: "BIOP", name: "Biopsia" },
    { id: "7", code: "AUTO", name: "Autopsia" },
    { id: "8", code: "DERM", name: "Dermatopatología" },
    { id: "9", code: "HEMO", name: "Hematología" },
    { id: "10", code: "MICR", name: "Microbiología" },
    { id: "11", code: "URIN", name: "Urianálisis" },
    { id: "12", code: "ZZZZ", name: "Zoonosis" },
];

function renderTable() {
    return render(
        <CelumaTable<StudyRow>
            dataSource={rows}
            rowKey="id"
            searchable
            searchPlaceholder="Buscar tipos de estudio"
            searchFilter={(r, q) => matchesQuery([r.code, r.name], q)}
            columns={[
                { title: "Código", dataIndex: "code", sorter: (a, b) => a.code.localeCompare(b.code) },
                { title: "Nombre", dataIndex: "name", sorter: (a, b) => a.name.localeCompare(b.name) },
            ]}
        />
    );
}

describe("CelumaTable — search behavior (Studies / price list pattern)", () => {
    it("shows all rows (first page) with no search applied", () => {
        renderTable();
        expect(screen.getByText("Histopatología")).toBeInTheDocument();
        // pageSize defaults to 10, so row 12 (Zoonosis) is on page 2, not visible yet.
        expect(screen.queryByText("Zoonosis")).not.toBeInTheDocument();
    });

    it("filters by free text, case- and accent-insensitively", async () => {
        const user = userEvent.setup();
        renderTable();
        const input = screen.getByPlaceholderText("Buscar tipos de estudio");
        await user.type(input, "histopatologia");

        expect(screen.getByText("Histopatología")).toBeInTheDocument();
        expect(screen.queryByText("Citología Exfoliativa")).not.toBeInTheDocument();
    });

    it("matches partial values", async () => {
        const user = userEvent.setup();
        renderTable();
        await user.type(screen.getByPlaceholderText("Buscar tipos de estudio"), "patolog");

        // "Histopathology", "Nephropathology", "Pathological Anatomy", "Dermatopathology"
        expect(screen.getByText("Histopatología")).toBeInTheDocument();
        expect(screen.getByText("Nefropatología")).toBeInTheDocument();
        expect(screen.getByText("Anatomía Patológica")).toBeInTheDocument();
        expect(screen.getByText("Dermatopatología")).toBeInTheDocument();
        expect(screen.queryByText("Biopsia")).not.toBeInTheDocument();
    });

    it("can be cleared back to the full result set", async () => {
        const user = userEvent.setup();
        renderTable();
        const input = screen.getByPlaceholderText("Buscar tipos de estudio");
        await user.type(input, "histo");
        expect(screen.queryByText("Citología Exfoliativa")).not.toBeInTheDocument();

        await user.clear(input);
        expect(screen.getByText("Citología Exfoliativa")).toBeInTheDocument();
    });

    it("shows the illustrated empty state when nothing matches", async () => {
        const user = userEvent.setup();
        renderTable();
        await user.type(screen.getByPlaceholderText("Buscar tipos de estudio"), "xyzxyzxyz");
        expect(screen.getByText("Sin datos")).toBeInTheDocument();
    });

    it("resets pagination to page 1 when the search query changes", async () => {
        const user = userEvent.setup();
        renderTable();

        // Go to page 2 first (CelumaPagination renders page buttons labeled "page N").
        const page2 = screen.getByRole("button", { name: "Página 2" });
        await user.click(page2);
        expect(screen.getByText("Zoonosis")).toBeInTheDocument();
        expect(screen.queryByText("Histopatología")).not.toBeInTheDocument();

        // Now search — the table must snap back to page 1, not stay on a now-invalid page.
        await user.type(screen.getByPlaceholderText("Buscar tipos de estudio"), "patolog");
        expect(screen.getByText("Histopatología")).toBeInTheDocument();
    });
});

describe("CelumaTable — sorting (localeCompare-based, accented Spanish names)", () => {
    it("sorts ascending by name using localeCompare when the column header is clicked", async () => {
        const user = userEvent.setup();
        renderTable();

        const nameHeader = screen.getByText("Nombre");
        await user.click(nameHeader);

        const table = screen.getByRole("table");
        const bodyRows = within(table).getAllByRole("row").slice(1); // drop header row
        const firstColumnText = bodyRows.map((r) => within(r).getAllByRole("cell")[1].textContent);

        // Expected alphabetical order per plain JS localeCompare (no explicit locale arg,
        // matching the exact pattern used in price_catalog.tsx/study_types.tsx today).
        const expected = [...rows].map((r) => r.name).sort((a, b) => a.localeCompare(b));
        expect(firstColumnText).toEqual(expected.slice(0, 10));
    });

    it("does not produce duplicate rows as a side effect of sorting", async () => {
        const user = userEvent.setup();
        renderTable();
        await user.click(screen.getByText("Código"));

        const table = screen.getByRole("table");
        const bodyRows = within(table).getAllByRole("row").slice(1);
        const codes = bodyRows.map((r) => within(r).getAllByRole("cell")[0].textContent);
        expect(new Set(codes).size).toBe(codes.length);
    });
});
