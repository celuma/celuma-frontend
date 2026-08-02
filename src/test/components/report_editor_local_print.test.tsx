/**
 * Cuarta remediación post-Fase 2 (Observación 1) — la impresión local
 * vuelve a la barra de acciones del reporte, y vuelve DIFERENCIADA.
 *
 * Estas pruebas cubren la superficie de producto que el brief exige:
 * qué acción se ofrece en cada estado, con qué rótulo, con qué permiso, y
 * que "Descargar PDF oficial" e "Imprimir copia local" son dos acciones
 * distintas que nunca se sustituyen entre sí.
 *
 * La causa raíz de la desaparición fue el commit c0b73aa ("unified
 * sign-and-publish, remove local print copy"), que junto con la unificación
 * de firma+publicación borró el botón y el hook de todas las pantallas.
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

describe("ReportEditor — la impresión local existe otra vez", () => {
    it.each<[ReportStatus]>([["DRAFT"], ["IN_REVIEW"], ["APPROVED"]])(
        "en %s ofrece \"Imprimir borrador\"",
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

    it("en PUBLISHED ofrece \"Imprimir copia local\" JUNTO a \"Descargar PDF oficial\"", async () => {
        withPermissions(["reports:read"]);
        mockReport("PUBLISHED");
        mockRestOfTheEditor();

        renderEditor();

        await waitFor(() => {
            expect(screen.getByRole("button", { name: /Descargar PDF oficial/i })).toBeTruthy();
        });
        // Coexisten: la copia local nunca reemplaza al documento oficial.
        expect(screen.getByRole("button", { name: /Imprimir copia local/i })).toBeTruthy();
    });

    it("en RETRACTED ofrece \"Imprimir copia local\"", async () => {
        withPermissions(["reports:read"]);
        mockReport("RETRACTED");
        mockRestOfTheEditor();

        renderEditor();

        await waitFor(() => {
            expect(screen.getByRole("button", { name: /Imprimir copia local/i })).toBeTruthy();
        });
    });
});

describe("ReportEditor — la copia local se distingue del PDF oficial", () => {
    it("avisa de la marca BORRADOR mientras el reporte no está publicado", async () => {
        withPermissions(["reports:read"]);
        mockReport("APPROVED");
        mockRestOfTheEditor();

        renderEditor();

        await waitFor(() => {
            expect(screen.getByText(/BORRADOR — DOCUMENTO NO OFICIAL/)).toBeTruthy();
        });
        expect(screen.getByText(/no genera ni reemplaza el PDF oficial/i)).toBeTruthy();
    });

    it("avisa de la marca RETRACTADO en un reporte retractado", async () => {
        withPermissions(["reports:read"]);
        mockReport("RETRACTED");
        mockRestOfTheEditor();

        renderEditor();

        await waitFor(() => {
            expect(screen.getByText(/marcada como RETRACTADO/i)).toBeTruthy();
        });
    });

    it("en PUBLISHED no aparece ninguna advertencia de borrador", async () => {
        withPermissions(["reports:read"]);
        mockReport("PUBLISHED");
        mockRestOfTheEditor();

        renderEditor();

        await waitFor(() => {
            expect(screen.getByRole("button", { name: /Descargar PDF oficial/i })).toBeTruthy();
        });
        expect(screen.queryByText(/BORRADOR — DOCUMENTO NO OFICIAL/)).toBeNull();
    });

    it("imprimir NO pide la URL de descarga del PDF oficial", async () => {
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

describe("ReportEditor — permisos de la impresión local", () => {
    it("basta reports:read — no exige reports:sign ni reports:generate_pdf", async () => {
        withPermissions(["reports:read"]);
        mockReport("APPROVED");
        mockRestOfTheEditor();

        renderEditor();

        await waitFor(() => {
            expect(screen.getByRole("button", { name: /Imprimir borrador/i })).toBeTruthy();
        });
        // Sin reports:sign, "Firmar y publicar" no debe estar — y aun así
        // imprimir sigue disponible.
        expect(screen.queryByRole("button", { name: /Firmar y publicar/i })).toBeNull();
    });

    it("sin reports:read no se ofrece imprimir", async () => {
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
