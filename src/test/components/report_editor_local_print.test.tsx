/**
 * Fourth post-Phase 2 remediation (Observation 1) — local printing
 * returns to the report's action bar, and returns DIFERENCIADA.
 *
 * These tests cover the product surface that the brief requires:
 * what action is offered in each state, with what label, with what permission, and
 * that "Download official PDF" and "Print local copy" are two actions
 * different ones that never replace each other.
 *
 * The root cause of the disappearance was commit c0b73aa ("unified
 * sign-and-publish, remove local print copy"), which together with the unification
 * signature+publishing deleted the button and hook from all screens.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ReportEditor from "../../components/report/report_editor";
import * as reportService from "../../services/report_service";
import * as letterheadService from "../../services/report_letterhead_service";
import { useUserProfile } from "../../hooks/use_user_profile";
import type { ReportStatus } from "../../models/report";

vi.mock("../../hooks/use_user_profile");
const mockedUseUserProfile = vi.mocked(useUserProfile);

const REPORT_ID = "00000000-0000-0000-0000-0000000000d1";
const ORDER_ID = "00000000-0000-0000-0000-0000000000aa";

const CONTENT = {
    base: {
        order_code: { is_visible: true, label: "Código de orden", value: "ORD-1" },
        patient: { is_visible: true, label: "Paciente", value: "Paciente Sintético" },
    },
    sections: {
        section_macroscopic: {
            is_visible: true, label: "Macroscópica", type: "richtext",
            content: "<p>Contenido sintético.</p>",
        },
    },
    base_order: ["order_code", "patient"],
    section_order: ["section_macroscopic"],
};

function withPermissions(granted: string[]) {
    mockedUseUserProfile.mockReturnValue({
        profile: null, loading: false, authStatus: "authenticated", sessionExpired: false,
        error: null, canManageUsers: false, canManageBranches: false, canManageCatalog: false,
        canManageTenant: false,
        hasPermission: (p: string) => granted.includes(p),
        hasRole: () => false,
    } as unknown as ReturnType<typeof useUserProfile>);
}

function mockReport(status: ReportStatus) {
    vi.spyOn(reportService, "getReportFull").mockResolvedValue({
        order: {
            id: ORDER_ID, order_code: "ORD-1", status: "IN_PROGRESS",
            patient_id: "p1", tenant_id: "t1", branch_id: "b1",
        },
        patient: { id: "p1", tenant_id: "t1", branch_id: "b1", patient_code: "PAT-1" },
        samples: [],
        report: {
            id: REPORT_ID, order_id: ORDER_ID, tenant_id: "t1", branch_id: "b1",
            created_by: "u1", version_no: 1, status,
            title: "Reporte de prueba", published_at: null,
            signed_by: null, signed_at: null,
            template: { base: CONTENT.base, sections: CONTENT.sections, base_order: CONTENT.base_order, section_order: CONTENT.section_order },
            report: CONTENT,
        },
    } as never);
}

function mockRestOfTheEditor() {
    vi.spyOn(letterheadService, "listReportLetterheads").mockResolvedValue({ letterheads: [] });
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        const body = url.includes("/tenants/") ? { reports_v2_enabled: false } : {};
        return Promise.resolve({
            ok: true, status: 200,
            text: () => Promise.resolve(JSON.stringify(body)),
            json: () => Promise.resolve(body),
        } as Response);
    });
}

function renderEditor() {
    return render(
        <MemoryRouter initialEntries={[`/reports/${REPORT_ID}`]}>
            <Routes>
                <Route path="/reports/:reportId" element={<ReportEditor />} />
            </Routes>
        </MemoryRouter>
    );
}

beforeEach(() => {
    localStorage.setItem("tenant_id", "t1");
    localStorage.setItem("branch_id", "b1");
});

afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
});

describe("ReportEditor — local printing exists again", () => {
    it.each<[ReportStatus]>([["DRAFT"], ["IN_REVIEW"], ["APPROVED"]])(
        "in %s ofrece \"Print draft\"",
        async (status) => {
            withPermissions(["reports:read"]);
            mockReport(status);
            mockRestOfTheEditor();

            renderEditor();

            await waitFor(() => {
                expect(screen.getByRole("button", { name: /Imprimir borrador/i })).toBeTruthy();
            });
        },
    );

    it("en PUBLISHED ofrece \"Print local copy\" JUNTO a \"Download official PDF\"", async () => {
        withPermissions(["reports:read"]);
        mockReport("PUBLISHED");
        mockRestOfTheEditor();

        renderEditor();

        await waitFor(() => {
            expect(screen.getByRole("button", { name: /Descargar PDF oficial/i })).toBeTruthy();
        });
        // They coexist: the local copy never replaces the official document.
        expect(screen.getByRole("button", { name: /Imprimir copia local/i })).toBeTruthy();
    });

    it("en RETRACTED ofrece \"Print local copy\"", async () => {
        withPermissions(["reports:read"]);
        mockReport("RETRACTED");
        mockRestOfTheEditor();

        renderEditor();

        await waitFor(() => {
            expect(screen.getByRole("button", { name: /Imprimir copia local/i })).toBeTruthy();
        });
    });
});

describe("ReportEditor — local copy is distinguished from official PDF", () => {
    it("notifies the brand draft while the report is not published", async () => {
        withPermissions(["reports:read"]);
        mockReport("APPROVED");
        mockRestOfTheEditor();

        renderEditor();

        await waitFor(() => {
            expect(screen.getByText(/BORRADOR — DOCUMENTO NO OFICIAL/)).toBeTruthy();
        });
        expect(screen.getByText(/no genera ni reemplaza el PDF oficial/i)).toBeTruthy();
    });

    it("warns of the RETRACTADO brand in a retracted report", async () => {
        withPermissions(["reports:read"]);
        mockReport("RETRACTED");
        mockRestOfTheEditor();

        renderEditor();

        await waitFor(() => {
            expect(screen.getByText(/marcada como RETRACTADO/i)).toBeTruthy();
        });
    });

    it("in PUBLISHED no draft warning appears", async () => {
        withPermissions(["reports:read"]);
        mockReport("PUBLISHED");
        mockRestOfTheEditor();

        renderEditor();

        await waitFor(() => {
            expect(screen.getByRole("button", { name: /Descargar PDF oficial/i })).toBeTruthy();
        });
        expect(screen.queryByText(/BORRADOR — DOCUMENTO NO OFICIAL/)).toBeNull();
    });

    it("print DOES NOT ask for the URL download from the official PDF", async () => {
        withPermissions(["reports:read"]);
        mockReport("PUBLISHED");
        mockRestOfTheEditor();
        const downloadSpy = vi.spyOn(reportService, "getOfficialPdfDownloadUrl");

        renderEditor();
        await waitFor(() => {
            expect(screen.getByRole("button", { name: /Imprimir copia local/i })).toBeTruthy();
        });
        await userEvent.click(screen.getByRole("button", { name: /Imprimir copia local/i }));

        expect(downloadSpy).not.toHaveBeenCalled();
    });
});

describe("ReportEditor — local printing permissions", () => {
    it("reports:read is enough — does not require reports:sign or reports:generate_pdf", async () => {
        withPermissions(["reports:read"]);
        mockReport("APPROVED");
        mockRestOfTheEditor();

        renderEditor();

        await waitFor(() => {
            expect(screen.getByRole("button", { name: /Imprimir borrador/i })).toBeTruthy();
        });
        // Without reports:sign, "sign and publish" must not be there — and even so
        // printing remains available.
        expect(screen.queryByRole("button", { name: /Firmar y publicar/i })).toBeNull();
    });

    it("without reports:read printing is not offered", async () => {
        withPermissions([]);
        mockReport("APPROVED");
        mockRestOfTheEditor();

        renderEditor();

        await waitFor(() => {
            expect(screen.getByDisplayValue("Reporte de prueba")).toBeTruthy();
        });
        expect(screen.queryByRole("button", { name: /Imprimir/i })).toBeNull();
    });
});
