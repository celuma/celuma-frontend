/**
 * Céluma 1.5 (#91) — the report editor's table card shows only the first two
 * columns and rows; the stored table, the edit modal and every report render
 * keep the whole table.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ReportEditor from "../../components/report/report_editor";
import * as reportService from "../../services/report_service";
import * as letterheadService from "../../services/report_letterhead_service";
import { useUserProfile } from "../../hooks/use_user_profile";
import { parseMarkdownTable, previewMarkdownTable } from "../../components/report/table_utils";
import type { ReportContent, ReportStatus, ReportTemplateJSON } from "../../models/report";

vi.mock("../../hooks/use_user_profile");
const mockedUseUserProfile = vi.mocked(useUserProfile);

const BIG_TABLE =
    "| Marcador | Resultado | Clon | Control |\n| --- | --- | --- | --- |\n" +
    "| CK7 | Positivo | OV-TL | Externo |\n| CK20 | Negativo | Ks20.8 | Interno |\n| TTF-1 | Positivo | 8G7G3 | Externo |";
const SMALL_TABLE = "| Marcador | Resultado |\n| --- | --- |\n| CK7 | Positivo |";

describe("previewMarkdownTable (#91)", () => {
    it("keeps the first two columns and body rows and reports the totals", () => {
        const p = previewMarkdownTable(BIG_TABLE);
        expect(parseMarkdownTable(p.md)).toEqual({
            headers: ["Marcador", "Resultado"],
            rows: [["CK7", "Positivo"], ["CK20", "Negativo"]],
        });
        expect(p).toMatchObject({ totalCols: 4, totalRows: 3, truncated: true });
    });

    it("leaves a table that already fits untouched", () => {
        const p = previewMarkdownTable(SMALL_TABLE);
        expect(parseMarkdownTable(p.md)).toEqual(parseMarkdownTable(SMALL_TABLE));
        expect(p.truncated).toBe(false);
    });
});

// ── Editor card ──────────────────────────────────────────────────────────────

const REPORT_ID = "00000000-0000-0000-0000-0000000009f2";
const SECTIONS = {
    section_diagnosis: { is_visible: true, label: "Diagnóstico", type: "richtext", content: "" },
    tabla_ihq: { is_visible: true, label: "Inmunohistoquímica", type: "table", content: "" },
};
const TEMPLATE = {
    base: { order_code: { is_visible: true, label: "Código de orden", value: "" } },
    sections: SECTIONS,
    base_order: ["order_code"],
    section_order: ["section_diagnosis", "tabla_ihq"],
} as unknown as ReportTemplateJSON;

function content(table: string): ReportContent {
    return {
        base: { order_code: { is_visible: true, label: "Código de orden", value: "ORD-91" } },
        sections: {
            section_diagnosis: { ...SECTIONS.section_diagnosis, content: "<p>Diagnóstico sintético.</p>" },
            tabla_ihq: { ...SECTIONS.tabla_ihq, content: table },
        },
        base_order: ["order_code"],
        section_order: ["section_diagnosis", "tabla_ihq"],
        signatureMetadata: { show_signature_section: false, require_digital_signature: false },
    } as ReportContent;
}

function mockReport(status: ReportStatus, table: string) {
    vi.spyOn(reportService, "getReportFull").mockResolvedValue({
        order: { id: "o91", order_code: "ORD-91", status: "IN_PROGRESS", patient_id: "p1", tenant_id: "t1", branch_id: "b1" },
        patient: { id: "p1", tenant_id: "t1", branch_id: "b1", patient_code: "PAT-91" },
        samples: [],
        report: {
            id: REPORT_ID, order_id: "o91", tenant_id: "t1", branch_id: "b1", created_by: "u1", version_no: 1,
            status, title: "Reporte sintético 91", published_at: null, signed_by: null, signed_at: null,
            schema_version: 2, template: TEMPLATE, report: { ...content(table), schema_version: 2 },
        },
    } as never);
    vi.spyOn(letterheadService, "listReportLetterheads").mockResolvedValue({ letterheads: [] });
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
        const body = String(input).includes("/tenants/") ? { reports_v2_enabled: true } : {};
        return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(body)), json: () => Promise.resolve(body) } as Response);
    });
}

function renderEditor() {
    return render(
        <MemoryRouter initialEntries={[`/reports/${REPORT_ID}`]}>
            <Routes><Route path="/reports/:reportId" element={<ReportEditor />} /></Routes>
        </MemoryRouter>,
    );
}

const card = () => screen.queryByTestId("table-card-preview-tabla_ihq");

beforeEach(() => {
    localStorage.setItem("tenant_id", "t1");
    localStorage.setItem("branch_id", "b1");
    mockedUseUserProfile.mockReturnValue({
        profile: null, loading: false, authStatus: "authenticated", sessionExpired: false,
        error: null, canManageUsers: false, canManageBranches: false, canManageCatalog: false,
        canManageTenant: false,
        hasPermission: (p: string) => ["reports:read", "reports:write", "reports:edit"].includes(p),
        hasRole: () => false,
        canActAsReviewer: () => false,
        canReopenApprovedReport: () => false,
        isAssignedReviewer: () => false,
    } as unknown as ReturnType<typeof useUserProfile>);
});
afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
});

describe("ReportEditor — table card preview (#91)", () => {
    it("shows the first two columns and rows, says what is hidden, and the modal and save keep everything", async () => {
        mockReport("DRAFT", BIG_TABLE);
        const save = vi.spyOn(reportService, "saveReportVersion").mockResolvedValue(undefined);
        renderEditor();
        await waitFor(() => expect(card()).not.toBeNull());
        const c = card()!;
        expect(c.querySelectorAll("th")).toHaveLength(2);
        expect(c.querySelectorAll("tr")).toHaveLength(3); // header + 2 rows
        expect(c.textContent).toContain("CK20");
        expect(c.textContent).not.toContain("TTF-1");
        expect(c.textContent).not.toContain("Clon");
        expect(within(c).getByText(/Se muestran 2 de 4 columnas y 2 de 3 filas/)).toBeTruthy();
        expect(c.textContent).toContain("Editar tabla");

        fireEvent.click(screen.getByRole("button", { name: /Editar tabla/ }));
        await waitFor(() => expect(screen.getByRole("textbox", { name: "Fila 3, columna 4" })).toBeTruthy());
        expect(screen.getByRole("textbox", { name: "Encabezado 3" })).toHaveProperty("value", "Clon");

        fireEvent.click(screen.getByTestId("report-save-top"));
        await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
        const saved = save.mock.calls[0][0].report!.sections.tabla_ihq as { content: string };
        expect(saved.content).toBe(BIG_TABLE);
    }, 20_000);

    it("shows a small table whole, without a note", async () => {
        mockReport("DRAFT", SMALL_TABLE);
        renderEditor();
        await waitFor(() => expect(card()).not.toBeNull());
        expect(card()!.textContent).toContain("CK7");
        expect(card()!.textContent).not.toContain("Se muestran");
    }, 20_000);

    it("points read-only states to the report preview for the whole table", async () => {
        mockReport("PUBLISHED", BIG_TABLE);
        renderEditor();
        await waitFor(() => expect(card()).not.toBeNull());
        expect(card()!.textContent).toContain("La tabla completa aparece en la vista previa del reporte.");
        expect(screen.queryByRole("button", { name: /Editar tabla/ })).toBeNull();
    }, 20_000);
});
