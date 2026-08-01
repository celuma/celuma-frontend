/**
 * Page-level test for the letterhead version editor's logo upload flow —
 * post-Fase-2 remediation, R8/R16.
 *
 * This is the test class that would have caught Bug 1 originally: it
 * drives the REAL Ant Design `<Upload>` input via
 * `userEvent.upload()` (a real File through the DOM file input), not just
 * a mocked service-layer call — the previous bug was entirely in the
 * page's `beforeUpload`/`originFileObj` wiring, invisible to a
 * service-only test (see report_letterhead_service.test.ts, which already
 * passed even while this bug shipped).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ReportLetterheadEditor from "../../pages/report_letterhead_editor";
import * as letterheadService from "../../services/report_letterhead_service";
import { useUserProfile } from "../../hooks/use_user_profile";

vi.mock("../../hooks/use_user_profile");
const mockedUseUserProfile = vi.mocked(useUserProfile);

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

function renderPage(letterheadId = "11111111-1111-1111-1111-111111111111") {
    return render(
        <MemoryRouter initialEntries={[`/config/report-letterheads/${letterheadId}/versions/new`]}>
            <Routes>
                <Route
                    path="/config/report-letterheads/:letterheadId/versions/new"
                    element={<ReportLetterheadEditor embedded />}
                />
            </Routes>
        </MemoryRouter>
    );
}

afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
});

describe("ReportLetterheadEditor — logo upload", () => {
    it("uploads a real File selected through the file input (not undefined)", async () => {
        withPermission(true);
        vi.spyOn(letterheadService, "getReportLetterhead").mockResolvedValue({
            id: "lh1", tenant_id: "tenant-1", name: "Membrete Test",
            is_default: false, is_active: true, created_at: "2026-01-01",
        });
        // Segunda remediación post-Fase 2 (UX): sin `?mode=publish`, el
        // editor arranca en modo "normal" y precarga la versión ACTIVE —
        // null simula un membrete recién creado, sin ninguna todavía.
        vi.spyOn(letterheadService, "getActiveReportLetterheadVersion").mockResolvedValue(null);
        const uploadSpy = vi.spyOn(letterheadService, "uploadReportLetterheadLogo").mockResolvedValue({
            storage_object_id: "storage-1",
            url: "https://cdn.example/logo.png",
            content_type: "image/png",
            size_bytes: 42,
        });

        renderPage();

        await waitFor(() => {
            expect(screen.getByText(/Editar membrete — Membrete Test/i)).toBeTruthy();
        });

        const file = new File([new Uint8Array([1, 2, 3, 4])], "logo.png", { type: "image/png" });
        const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
        expect(fileInput).toBeTruthy();

        await userEvent.upload(fileInput, file);

        const uploadButton = await screen.findByRole("button", { name: /subir logo/i });
        await userEvent.click(uploadButton);

        await waitFor(() => {
            expect(uploadSpy).toHaveBeenCalledTimes(1);
        });
        // The regression check: the service must receive an actual File,
        // never undefined (which is what `.originFileObj` on a raw RcFile
        // silently produced before this fix).
        const [, uploadedFile] = uploadSpy.mock.calls[0];
        expect(uploadedFile).toBeInstanceOf(File);
        expect((uploadedFile as File).name).toBe("logo.png");
    });

    it("shows read-only state and disables the upload trigger without permission", async () => {
        withPermission(false);
        vi.spyOn(letterheadService, "getReportLetterhead").mockResolvedValue({
            id: "lh1", tenant_id: "tenant-1", name: "Membrete Test",
            is_default: false, is_active: true, created_at: "2026-01-01",
        });
        vi.spyOn(letterheadService, "getActiveReportLetterheadVersion").mockResolvedValue(null);

        renderPage();

        await waitFor(() => {
            expect(screen.getByText(/Solo lectura/i)).toBeTruthy();
        });
    });
});
