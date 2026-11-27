/**
 * Céluma 1.5 (#90) — the author decides, per report, whether a template table is printed.
 *
 * jsdom covers the rule, the shared V2 renderer (the same component draws the editor preview,
 * the local print copy and the official PDF route) and the editor toggle/save round trip. It
 * cannot establish geometry (no gap, page boundaries): that is the real-browser suite's job.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import LegacyReportRendererV1, {
    type LegacyReportRendererV1Ref,
} from "../../components/report/legacy/legacy_report_renderer_v1";
import VersionedReportRendererV2, {
    type VersionedReportRendererV2Ref,
} from "../../components/report/versioned/versioned_report_renderer_v2";
import ReportEditor from "../../components/report/report_editor";
import * as reportService from "../../services/report_service";
import * as letterheadService from "../../services/report_letterhead_service";
import { useUserProfile } from "../../hooks/use_user_profile";
import { isSectionIncludedInReport } from "../../models/report";
import type { ReportContent, ReportEnvelope, ReportStatus, ReportTemplateJSON } from "../../models/report";
import type { ReportRenderingSnapshotV2 } from "../../components/report/versioned/versioned_report_types";

vi.mock("../../hooks/use_user_profile");
const mockedUseUserProfile = vi.mocked(useUserProfile);

const TABLE_MD = "| Marcador | Resultado |\n| --- | --- |\n| CK7 | Positivo |";

const TEMPLATE_SECTIONS = {
    section_macroscopic: { is_visible: true, label: "Descripción macroscópica", type: "richtext", content: "" },
    tabla_ihq: { is_visible: true, label: "Inmunohistoquímica", type: "table", content: "" },
    section_diagnosis: { is_visible: true, label: "Diagnóstico", type: "richtext", content: "" },
};
const SECTION_ORDER = ["section_macroscopic", "tabla_ihq", "section_diagnosis"];

function content(tableExtra: Record<string, unknown> = {}): ReportContent {
    return {
        base: { order_code: { is_visible: true, label: "Código de orden", value: "ORD-90" } },
        sections: {
            section_macroscopic: { ...TEMPLATE_SECTIONS.section_macroscopic, content: "<p>Macro sintética.</p>" },
            tabla_ihq: { ...TEMPLATE_SECTIONS.tabla_ihq, content: TABLE_MD, ...tableExtra },
            section_diagnosis: { ...TEMPLATE_SECTIONS.section_diagnosis, content: "<p>Diagnóstico sintético.</p>" },
        },
        base_order: ["order_code"],
        section_order: [...SECTION_ORDER],
        signatureMetadata: { show_signature_section: false, require_digital_signature: false },
    } as ReportContent;
}

const TEMPLATE = {
    base: { order_code: { is_visible: true, label: "Código de orden", value: "" } },
    sections: TEMPLATE_SECTIONS,
    base_order: ["order_code"],
    section_order: SECTION_ORDER,
} as unknown as ReportTemplateJSON;

const ENVELOPE_BASE = {
    order_id: "00000000-0000-0000-0000-000000000903",
    tenant_id: "00000000-0000-0000-0000-000000000901",
    branch_id: "00000000-0000-0000-0000-000000000902",
    created_by: "00000000-0000-0000-0000-000000000999",
    version_no: 1,
    status: "PUBLISHED" as const,
    title: "Reporte sintético 90",
    published_at: "2026-11-26T12:00:00Z",
    signed_by: null,
    signed_at: null,
};

function v2Envelope(c: ReportContent): ReportEnvelope {
    const snapshot: ReportRenderingSnapshotV2 = {
        schema_version: 2,
        template: TEMPLATE as never,
        presentation: {
            paper: { size: "LETTER", orientation: "PORTRAIT", margins_cm: { top: 1, right: 1, bottom: 1, left: 1 } },
            header: {
                enabled: true, logo_storage_id: null, institution_name: "Laboratorio 90",
                subtitle: null, address: null, phone: null, email: null,
            },
            footer: { enabled: true, custom_text: null, show_page_number: true },
            style: { primary_color: "#4A4A4A" },
            signer: null,
        },
    };
    return {
        ...ENVELOPE_BASE,
        id: "r90-v2",
        template: TEMPLATE,
        report: { ...c, schema_version: 2, rendering_snapshot: snapshot },
        schema_version: 2,
        template_version_id: "00000000-0000-0000-0000-0000000ab090",
        generated_by_renderer_version: "fixture/1.0.0",
    } as ReportEnvelope;
}

function renderV2(report: ReportEnvelope) {
    const ref = createRef<VersionedReportRendererV2Ref>();
    const view = render(<VersionedReportRendererV2 report={report} ref={ref} />);
    const pages = ref.current?.getPages() ?? [];
    return {
        text: pages.map((p) => p.textContent).join("\n"),
        tables: pages.reduce((n, p) => n + p.querySelectorAll("table").length, 0),
        unmount: view.unmount,
    };
}

describe("isSectionIncludedInReport (#90)", () => {
    it("includes a table unless it is explicitly excluded", () => {
        expect(isSectionIncludedInReport({ type: "table" }, undefined)).toBe(true);
        expect(isSectionIncludedInReport({ type: "table" }, {})).toBe(true);
        expect(isSectionIncludedInReport({ type: "table" }, { include_in_report: true })).toBe(true);
        expect(isSectionIncludedInReport({ type: "table" }, { include_in_report: "false" })).toBe(true);
        expect(isSectionIncludedInReport({ type: "table" }, { include_in_report: false })).toBe(false);
    });

    it("never excludes a section that is not a table", () => {
        for (const type of ["text", "richtext", "numeric", "images"]) {
            expect(isSectionIncludedInReport({ type }, { include_in_report: false })).toBe(true);
        }
    });
});

describe("V2 renderer — excluded template tables (#90)", () => {
    it("draws an included table (default, no flag) with its heading", () => {
        const { text, tables, unmount } = renderV2(v2Envelope(content()));
        expect(text).toContain("Inmunohistoquímica");
        expect(text).toContain("CK7");
        expect(tables).toBe(1);
        unmount();
    });

    it("omits the heading and table of an excluded table and keeps its neighbours", () => {
        const { text, tables, unmount } = renderV2(v2Envelope(content({ include_in_report: false })));
        expect(text).not.toContain("Inmunohistoquímica");
        expect(text).not.toContain("CK7");
        expect(tables).toBe(0);
        expect(text).toContain("Macro sintética.");
        expect(text).toContain("Diagnóstico sintético.");
        expect(text.indexOf("Macro sintética.")).toBeLessThan(text.indexOf("Diagnóstico sintético."));
        unmount();
    });

    it("leaves the frozen Legacy renderer untouched", () => {
        const c = content({ include_in_report: false });
        const ref = createRef<LegacyReportRendererV1Ref>();
        const view = render(
            <LegacyReportRendererV1
                report={{ ...ENVELOPE_BASE, id: "r90-legacy", template: TEMPLATE, report: c } as ReportEnvelope}
                ref={ref}
            />,
        );
        const text = (ref.current?.getPages() ?? []).map((p) => p.textContent).join("\n");
        expect(text).toContain("CK7");
        view.unmount();
    });
});

// ── Editor toggle ────────────────────────────────────────────────────────────

const REPORT_ID = "00000000-0000-0000-0000-0000000009f1";

function asAuthor() {
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
}

function mockReport(status: ReportStatus, tableExtra: Record<string, unknown> = {}) {
    vi.spyOn(reportService, "getReportFull").mockResolvedValue({
        order: { id: ENVELOPE_BASE.order_id, order_code: "ORD-90", status: "IN_PROGRESS", patient_id: "p1", tenant_id: "t1", branch_id: "b1" },
        patient: { id: "p1", tenant_id: "t1", branch_id: "b1", patient_code: "PAT-90" },
        samples: [],
        report: {
            ...ENVELOPE_BASE, id: REPORT_ID, tenant_id: "t1", branch_id: "b1", status, schema_version: 2,
            published_at: null, template: TEMPLATE, report: { ...content(tableExtra), schema_version: 2 },
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

const tableSwitch = () => document.getElementById("include-table-tabla_ihq") as HTMLButtonElement | null;

beforeEach(() => {
    localStorage.setItem("tenant_id", "t1");
    localStorage.setItem("branch_id", "b1");
    asAuthor();
});
afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
});

describe("ReportEditor — include a template table in the report (#90)", () => {
    it("defaults to included and saves an exclusion that keeps the table content", async () => {
        mockReport("DRAFT");
        const save = vi.spyOn(reportService, "saveReportVersion").mockResolvedValue(undefined);
        renderEditor();
        await waitFor(() => expect(tableSwitch()).not.toBeNull());
        expect(tableSwitch()!.getAttribute("aria-checked")).toBe("true");
        expect(screen.getByLabelText("Incluir en el reporte")).toBe(tableSwitch());

        fireEvent.click(tableSwitch()!);
        expect(tableSwitch()!.getAttribute("aria-checked")).toBe("false");
        expect(screen.getByText(/no aparecerá en la vista previa/)).toBeTruthy();

        fireEvent.click(screen.getByTestId("report-save-top"));
        await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
        const saved = save.mock.calls[0][0].report!.sections.tabla_ihq as { content: string; include_in_report?: boolean };
        expect(saved.include_in_report).toBe(false);
        expect(saved.content).toBe(TABLE_MD);
    });

    it("reopens an excluded table as excluded and including it again drops the flag", async () => {
        mockReport("DRAFT", { include_in_report: false });
        const save = vi.spyOn(reportService, "saveReportVersion").mockResolvedValue(undefined);
        renderEditor();
        await waitFor(() => expect(tableSwitch()).not.toBeNull());
        expect(tableSwitch()!.getAttribute("aria-checked")).toBe("false");

        fireEvent.click(tableSwitch()!);
        fireEvent.click(screen.getByTestId("report-save-top"));
        await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
        const saved = save.mock.calls[0][0].report!.sections.tabla_ihq as { content: string; include_in_report?: boolean };
        expect("include_in_report" in saved).toBe(false);
        expect(saved.content).toBe(TABLE_MD);
    });

    it.each<ReportStatus>(["IN_REVIEW", "APPROVED", "PUBLISHED"])("shows the choice read-only in %s", async (status) => {
        mockReport(status, { include_in_report: false });
        renderEditor();
        await waitFor(() => expect(tableSwitch()).not.toBeNull());
        expect(tableSwitch()!.getAttribute("aria-checked")).toBe("false");
        expect(tableSwitch()!.disabled).toBe(true);
    });
});
