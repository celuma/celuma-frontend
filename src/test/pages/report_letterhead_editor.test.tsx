/**
 * Page-level tests for the letterhead editor's logo flow.
 *
 * Post-Phase-2 remediation R8/R16 (bug 1: `originFileObj` on a raw RcFile) and
 * Third remediation (issues B and C: the logo was uploaded but did not persist
 * visually when reopening, and the footer logo never appeared on the
 * preview).
 *
 * The actual `<Upload>` is driven by Ant Design with `userEvent.upload()` (a
 * Real `File` through the DOM input), not a mocked call
 * service: the three bugs that this class covers lived precisely in the
 * page wiring, invisible for service testing (see
 * report_letterhead_service.test.ts, which passed while the bugs
 *shipped).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ReportLetterheadEditor from "../../pages/report_letterhead_editor";
import * as letterheadService from "../../services/report_letterhead_service";
import { useUserProfile } from "../../hooks/use_user_profile";
import type { ReportPresentationSnapshotV2 } from "../../components/report/versioned/versioned_report_types";

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

const DIVIDER = {
    enabled: true,
    style: "SINGLE" as const,
    primary_width_px: 1,
    secondary_width_px: 1,
    gap_mm: 1,
    color: null,
};

function presentationWith(
    overrides: Partial<ReportPresentationSnapshotV2> = {}
): ReportPresentationSnapshotV2 {
    return {
        paper: {
            size: "LETTER",
            orientation: "PORTRAIT",
            margins_cm: { top: 2, right: 2, bottom: 2, left: 2 },
        },
        header: {
            enabled: true,
            logo_storage_id: null,
            institution_name: "Laboratorio Test",
            subtitle: null,
            address: null,
            phone: null,
            email: null,
            logo_position: "LEFT",
            content_alignment: "CENTER",
            height_mm: null,
            divider: DIVIDER,
        },
        footer: {
            enabled: true,
            custom_text: "Pie de prueba",
            show_page_number: true,
            logo_storage_id: null,
            logo_position: "LEFT",
            content_alignment: "CENTER",
            height_mm: null,
            divider: DIVIDER,
        },
        style: { primary_color: "#123456", secondary_color: null },
        signer: null,
        ...overrides,
    };
}

function mockLetterhead() {
    vi.spyOn(letterheadService, "getReportLetterhead").mockResolvedValue({
        id: "lh1", tenant_id: "tenant-1", name: "Membrete Test",
        is_default: false, is_active: true, created_at: "2026-01-01",
    });
}

function mockActiveVersion(
    configuration: ReportPresentationSnapshotV2,
    resolved_resources?: { header_logo_url?: string | null; footer_logo_url?: string | null } | null
) {
    vi.spyOn(letterheadService, "getActiveReportLetterheadVersion").mockResolvedValue({
        id: "v1",
        tenant_id: "tenant-1",
        report_letterhead_id: "lh1",
        version_number: 1,
        schema_version: 2,
        status: "ACTIVE",
        created_by: null,
        published_at: "2026-01-01",
        activated_at: "2026-01-01",
        archived_at: null,
        configuration,
        resolved_resources,
    });
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

function fileInputs(): HTMLInputElement[] {
    return Array.from(document.querySelectorAll('input[type="file"]'));
}

afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
});

describe("ReportLetterheadEditor — logo uploads", () => {
    it("uploads to actual File selected by the input, without intermediate steps", async () => {
        withPermission(true);
        mockLetterhead();
        vi.spyOn(letterheadService, "getActiveReportLetterheadVersion").mockResolvedValue(null);
        const uploadSpy = vi
            .spyOn(letterheadService, "uploadReportLetterheadLogo")
            .mockResolvedValue({
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
        await userEvent.upload(fileInputs()[0], file);

        // Third remedy: the upload starts when the file is selected.
        // before pressing the second "upload logo" button was missing, which
        // left the drag-and-drop with no visible effect and allowed clicking
        // "save" losing the logo silently.
        await waitFor(() => expect(uploadSpy).toHaveBeenCalledTimes(1));

        const [, uploadedFile] = uploadSpy.mock.calls[0];
        expect(uploadedFile).toBeInstanceOf(File);
        expect((uploadedFile as File).name).toBe("logo.png");
    });

    it("shows the newly uploaded logo in the preview immediately", async () => {
        withPermission(true);
        mockLetterhead();
        vi.spyOn(letterheadService, "getActiveReportLetterheadVersion").mockResolvedValue(null);
        vi.spyOn(letterheadService, "uploadReportLetterheadLogo").mockResolvedValue({
            storage_object_id: "storage-1",
            url: "https://cdn.example/recien-subido.png",
            content_type: "image/png",
            size_bytes: 42,
        });

        renderPage();
        await waitFor(() => {
            expect(screen.getByText(/Editar membrete/i)).toBeTruthy();
        });

        await userEvent.upload(
            fileInputs()[0],
            new File([new Uint8Array([1])], "logo.png", { type: "image/png" })
        );

        await waitFor(() => {
            const imgs = Array.from(document.querySelectorAll("img"));
            expect(imgs.some((i) => i.getAttribute("src") === "https://cdn.example/recien-subido.png")).toBe(true);
        });
    });

    it("upload the footer logo through its own input, without touching the header", async () => {
        withPermission(true);
        mockLetterhead();
        vi.spyOn(letterheadService, "getActiveReportLetterheadVersion").mockResolvedValue(null);
        vi.spyOn(letterheadService, "uploadReportLetterheadLogo").mockResolvedValue({
            storage_object_id: "storage-footer",
            url: "https://cdn.example/footer.png",
            content_type: "image/png",
            size_bytes: 42,
        });
        const saveSpy = vi
            .spyOn(letterheadService, "saveCurrentReportLetterheadVersion")
            .mockResolvedValue({
                id: "v2", tenant_id: "t", report_letterhead_id: "lh1", version_number: 2,
                schema_version: 2, status: "ACTIVE", created_by: null,
                published_at: "2026-01-01", activated_at: "2026-01-01", archived_at: null,
                configuration: presentationWith(),
            });

        renderPage();
        await waitFor(() => {
            expect(screen.getByText(/Editar membrete/i)).toBeTruthy();
        });

        // [0] = header, [1] = footer.
        await userEvent.upload(
            fileInputs()[1],
            new File([new Uint8Array([9])], "pie.png", { type: "image/png" })
        );

        await userEvent.click(screen.getByRole("button", { name: /Guardar cambios/i }));
        await userEvent.click(screen.getByRole("button", { name: /^Guardar$/i }));

        await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
        const [, payload] = saveSpy.mock.calls[0];
        expect(payload.configuration.footer.logo_storage_id).toBe("storage-footer");
        expect(payload.configuration.header.logo_storage_id).toBeNull();
    });
});

describe("ReportLetterheadEditor — rehydration on reopen (issues B and C)", () => {
    it("preview the logos already persisted with the URLs resolved by the backend", async () => {
        withPermission(true);
        mockLetterhead();
        mockActiveVersion(
            presentationWith({
                header: { ...presentationWith().header, logo_storage_id: "storage-h" },
                footer: { ...presentationWith().footer, logo_storage_id: "storage-f" },
            }),
            {
                header_logo_url: "https://cdn.example/persisted-header.png",
                footer_logo_url: "https://cdn.example/persisted-footer.png",
            }
        );

        renderPage();
        await waitFor(() => {
            expect(screen.getByText(/Editar membrete/i)).toBeTruthy();
        });

        // The specific regression: before both were null when reopened and
        // the editor showed the neutral Céluma logo despite having
        // `logo_storage_id` correctly saved.
        await waitFor(() => {
            const srcs = Array.from(document.querySelectorAll("img")).map((i) => i.getAttribute("src"));
            expect(srcs).toContain("https://cdn.example/persisted-header.png");
            expect(srcs).toContain("https://cdn.example/persisted-footer.png");
        });
    });

    it("shows no logo when the letterhead has none configured", async () => {
        withPermission(true);
        mockLetterhead();
        mockActiveVersion(presentationWith(), null);

        renderPage();
        await waitFor(() => {
            expect(screen.getByText(/Editar membrete/i)).toBeTruthy();
        });

        // Neutral fallback only applies when there is NO logo configured.
        expect(screen.queryByRole("button", { name: /Quitar/i })).toBeNull();
    });

    it("preserve the persisted logo when saving without touching it", async () => {
        withPermission(true);
        mockLetterhead();
        mockActiveVersion(
            presentationWith({
                header: { ...presentationWith().header, logo_storage_id: "storage-h" },
            }),
            { header_logo_url: "https://cdn.example/persisted-header.png" }
        );
        const saveSpy = vi
            .spyOn(letterheadService, "saveCurrentReportLetterheadVersion")
            .mockResolvedValue({
                id: "v2", tenant_id: "t", report_letterhead_id: "lh1", version_number: 2,
                schema_version: 2, status: "ACTIVE", created_by: null,
                published_at: "2026-01-01", activated_at: "2026-01-01", archived_at: null,
                configuration: presentationWith(),
            });

        renderPage();
        await waitFor(() => {
            expect(screen.getByText(/Editar membrete/i)).toBeTruthy();
        });

        await userEvent.click(screen.getByRole("button", { name: /Guardar cambios/i }));
        await userEvent.click(screen.getByRole("button", { name: /^Guardar$/i }));

        await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
        expect(saveSpy.mock.calls[0][1].configuration.header.logo_storage_id).toBe("storage-h");
    });

    it("persists the logo as null after removal", async () => {
        withPermission(true);
        mockLetterhead();
        mockActiveVersion(
            presentationWith({
                footer: { ...presentationWith().footer, logo_storage_id: "storage-f" },
            }),
            { footer_logo_url: "https://cdn.example/persisted-footer.png" }
        );
        const saveSpy = vi
            .spyOn(letterheadService, "saveCurrentReportLetterheadVersion")
            .mockResolvedValue({
                id: "v2", tenant_id: "t", report_letterhead_id: "lh1", version_number: 2,
                schema_version: 2, status: "ACTIVE", created_by: null,
                published_at: "2026-01-01", activated_at: "2026-01-01", archived_at: null,
                configuration: presentationWith(),
            });

        renderPage();
        await waitFor(() => {
            expect(screen.getByText(/Editar membrete/i)).toBeTruthy();
        });

        await userEvent.click(screen.getByRole("button", { name: /Quitar/i }));
        await userEvent.click(screen.getByRole("button", { name: /Guardar cambios/i }));
        await userEvent.click(screen.getByRole("button", { name: /^Guardar$/i }));

        await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
        expect(saveSpy.mock.calls[0][1].configuration.footer.logo_storage_id).toBeNull();
    });

    it("restores all imported visual fields, without replacing them with defaults", async () => {
        withPermission(true);
        mockLetterhead();
        const imported = presentationWith({
            paper: {
                size: "LETTER",
                orientation: "PORTRAIT",
                margins_cm: { top: 2.7, right: 1.3, bottom: 3.1, left: 1.9 },
            },
            style: {
                primary_color: "#AA1122",
                secondary_color: "#22AA11",
                typography: {
                    font_family: "TIMES",
                    base_font_size_pt: 11.5,
                    header_font_size_pt: 13,
                    footer_font_size_pt: 6.5,
                },
            },
        });
        mockActiveVersion(imported, null);
        const saveSpy = vi
            .spyOn(letterheadService, "saveCurrentReportLetterheadVersion")
            .mockResolvedValue({
                id: "v2", tenant_id: "t", report_letterhead_id: "lh1", version_number: 2,
                schema_version: 2, status: "ACTIVE", created_by: null,
                published_at: "2026-01-01", activated_at: "2026-01-01", archived_at: null,
                configuration: imported,
            });

        renderPage();
        await waitFor(() => {
            expect(screen.getByText(/Editar membrete/i)).toBeTruthy();
        });

        await userEvent.click(screen.getByRole("button", { name: /Guardar cambios/i }));
        await userEvent.click(screen.getByRole("button", { name: /^Guardar$/i }));

        await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
        // Re-save without editing anything returns exactly what was loaded, with
        // a single deliberate addition of the fourth remedy: `logo_mode`
        // materializes with the value REPRODUCE what the letterhead already
        // showed (header without logo -> the neutral isotype to which the
        // renderer; footer without logo -> nothing, which is what the footer did). It is what
        // opposite of "replace by defaults": leaves written, and therefore
        // editable, a behavior that until now was implicit.
        const saved = saveSpy.mock.calls[0][1].configuration;
        expect(saved.header.logo_mode).toBe("CELUMA_DEFAULT");
        expect(saved.footer.logo_mode).toBe("NONE");
        expect({
            ...saved,
            header: { ...saved.header, logo_mode: undefined },
            footer: { ...saved.footer, logo_mode: undefined },
        }).toEqual({
            ...imported,
            header: { ...imported.header, logo_mode: undefined },
            footer: { ...imported.footer, logo_mode: undefined },
        });
    });
});

describe("ReportLetterheadEditor — permissions", () => {
    it("shows read-only state without admin permission", async () => {
        withPermission(false);
        mockLetterhead();
        vi.spyOn(letterheadService, "getActiveReportLetterheadVersion").mockResolvedValue(null);

        renderPage();

        await waitFor(() => {
            expect(screen.getByText(/Solo lectura/i)).toBeTruthy();
        });
    });
});
