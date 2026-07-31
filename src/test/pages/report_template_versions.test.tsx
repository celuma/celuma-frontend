import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ReportTemplateVersions from "../../pages/report_template_versions";
import * as reportService from "../../services/report_service";
import { useUserProfile } from "../../hooks/use_user_profile";

// Céluma 1.3 Fase 2, Bloque D, Historia D4/D14 — administration list:
// states (empty/loaded/active chip), and read-only gating by permission.

vi.mock("../../hooks/use_user_profile");

const mockedUseUserProfile = vi.mocked(useUserProfile);

function renderPage(templateId = "11111111-1111-1111-1111-111111111111") {
    return render(
        <MemoryRouter initialEntries={[`/config/report-templates/${templateId}/versions`]}>
            <Routes>
                <Route path="/config/report-templates/:templateId/versions" element={<ReportTemplateVersions embedded />} />
            </Routes>
        </MemoryRouter>
    );
}

function withPermission(canManage: boolean) {
    mockedUseUserProfile.mockReturnValue({
        profile: null,
        loading: false,
        authStatus: "authenticated",
        sessionExpired: false,
        error: null,
        canManageUsers: false,
        canManageBranches: false,
        canManageCatalog: false,
        canManageTenant: false,
        hasPermission: () => canManage,
        hasRole: () => false,
    } as unknown as ReturnType<typeof useUserProfile>);
}

afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = undefined as unknown as typeof fetch;
});

describe("ReportTemplateVersions — empty state", () => {
    it("shows an empty-state message when the template has no versions", async () => {
        withPermission(true);
        vi.spyOn(reportService, "getReportTemplateById").mockResolvedValue({
            id: "t1", tenant_id: "tenant-1", name: "Plantilla X", is_active: true, created_at: "2026-01-01",
            template_json: { base: {}, sections: {}, base_order: [], section_order: [] }, created_by: "u1",
        });
        vi.spyOn(reportService, "listReportTemplateVersions").mockResolvedValue({ versions: [] });
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 })));

        renderPage();

        await waitFor(() => {
            expect(screen.getByText(/aún no tiene versiones publicadas/i)).toBeTruthy();
        });
    });
});

describe("ReportTemplateVersions — loaded state", () => {
    it("renders a version row and the active-version chip", async () => {
        withPermission(true);
        vi.spyOn(reportService, "getReportTemplateById").mockResolvedValue({
            id: "t1", tenant_id: "tenant-1", name: "Plantilla X", is_active: true, created_at: "2026-01-01",
            template_json: { base: {}, sections: {}, base_order: [], section_order: [] }, created_by: "u1",
        });
        vi.spyOn(reportService, "listReportTemplateVersions").mockResolvedValue({
            versions: [
                {
                    id: "v1", tenant_id: "tenant-1", report_template_id: "t1", version_number: 1,
                    schema_version: 2, status: "ACTIVE", created_by: "u1",
                    published_at: "2026-01-01T00:00:00Z", activated_at: "2026-01-02T00:00:00Z", archived_at: null,
                },
            ],
        });
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 })));

        renderPage();

        await waitFor(() => {
            expect(screen.getByText("#1")).toBeTruthy();
        });
        expect(screen.getByText(/Versión activa: #1/i)).toBeTruthy();
        // Active version must never offer "Archivar" (backend rejects it with 409).
        expect(screen.queryByText("Archivar")).toBeNull();
    });
});

describe("ReportTemplateVersions — permission gating", () => {
    it("shows a read-only notice and disables actions when the user lacks reports:manage_templates", async () => {
        withPermission(false);
        vi.spyOn(reportService, "getReportTemplateById").mockResolvedValue({
            id: "t1", tenant_id: "tenant-1", name: "Plantilla X", is_active: true, created_at: "2026-01-01",
            template_json: { base: {}, sections: {}, base_order: [], section_order: [] }, created_by: "u1",
        });
        vi.spyOn(reportService, "listReportTemplateVersions").mockResolvedValue({ versions: [] });
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 })));

        renderPage();

        await waitFor(() => {
            expect(screen.getByText(/Solo lectura/i)).toBeTruthy();
        });
    });
});

describe("ReportTemplateVersions — error handling", () => {
    it("does not crash when the versions request fails", async () => {
        withPermission(true);
        vi.spyOn(reportService, "getReportTemplateById").mockResolvedValue({
            id: "t1", tenant_id: "tenant-1", name: "Plantilla X", is_active: true, created_at: "2026-01-01",
            template_json: { base: {}, sections: {}, base_order: [], section_order: [] }, created_by: "u1",
        });
        vi.spyOn(reportService, "listReportTemplateVersions").mockRejectedValue(new Error("Error de red"));
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 })));

        renderPage();

        await waitFor(() => {
            expect(screen.getByText(/aún no tiene versiones publicadas/i)).toBeTruthy();
        });
    });
});
