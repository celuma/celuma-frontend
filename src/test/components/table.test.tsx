import { describe, expect, it, vi } from "vitest";
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

    it("does not apply a search over the limits and says so (Céluma 1.4)", async () => {
        const user = userEvent.setup();
        renderTable();
        await user.type(screen.getByPlaceholderText("Buscar tipos de estudio"), "histo a b c d e f g h");
        // Nine terms: nothing is filtered — the first page is the unfiltered one —
        // and the warning states the search was not applied.
        expect(screen.getByRole("alert")).toHaveTextContent("Búsqueda no aplicada: admite hasta 8 palabras y tiene 9.");
        expect(screen.getByText("Citología Exfoliativa")).toBeInTheDocument();
        await user.keyboard("{Backspace}{Backspace}");
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
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

// Céluma 1.4 (#6): server-driven mode. The API already searched, filtered,
// sorted and paged; the table must render the rows it is given, untouched,
// and report every interaction instead of acting on it locally.
describe("CelumaTable — server mode", () => {
    const pageRows: StudyRow[] = [
        { id: "9", code: "ZZZZ", name: "Zoonosis" },
        { id: "1", code: "AAAA", name: "Anatomía" },
    ];

    function renderServerTable(overrides: Partial<Parameters<typeof CelumaTable<StudyRow>>[0]["server"] & object> = {}) {
        const server = {
            total: 45,
            page: 2,
            pageSize: 10,
            onPageChange: vi.fn(),
            search: "",
            onSearchChange: vi.fn(),
            onQueryChange: vi.fn(),
            ...overrides,
        };
        render(
            <CelumaTable<StudyRow>
                dataSource={pageRows}
                rowKey="id"
                searchable
                searchPlaceholder="Buscar tipos de estudio"
                pagination={{ pageSize: 10 }}
                server={server}
                columns={[
                    { title: "Código", dataIndex: "code", key: "code", sorter: true },
                    { title: "Nombre", dataIndex: "name", key: "name", filters: [{ text: "Z", value: "z" }] },
                ]}
            />,
        );
        return server;
    }

    it("renders the given page in the given order, with the server's total", () => {
        renderServerTable();
        const bodyRows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
        expect(bodyRows.map((r) => within(r).getAllByRole("cell")[0].textContent)).toEqual(["ZZZZ", "AAAA"]);
        // 45 rows / 10 per page → page 5 exists although only two rows were given.
        expect(screen.getByRole("button", { name: "Página 5" })).toBeInTheDocument();
    });

    it("reports search typing instead of filtering locally", async () => {
        const user = userEvent.setup();
        const server = renderServerTable();
        await user.type(screen.getByPlaceholderText("Buscar tipos de estudio"), "x");
        expect(server.onSearchChange).toHaveBeenLastCalledWith("x");
        expect(screen.getByText("Zoonosis")).toBeInTheDocument();
    });

    it("warns when the server search is over the limits", () => {
        renderServerTable({ search: "x".repeat(201) });
        expect(screen.getByRole("alert")).toHaveTextContent("admite hasta 200 caracteres y tiene 201");
    });

    it("reports page changes and header sorting", async () => {
        const user = userEvent.setup();
        const server = renderServerTable();
        await user.click(screen.getByRole("button", { name: "Página 3" }));
        expect(server.onPageChange).toHaveBeenCalledWith(3);

        await user.click(screen.getByText("Código"));
        expect(server.onQueryChange).toHaveBeenLastCalledWith({ sort: { field: "code", order: "asc" }, filters: {} });
        const bodyRows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
        expect(bodyRows.map((r) => within(r).getAllByRole("cell")[0].textContent)).toEqual(["ZZZZ", "AAAA"]);
    });
});
