/**
 * Fifth post-Phase 2 remediation — tests of the two observations.
 *
 * Observation A — the letterhead selector only existed before the first
 * save, because it was conditional on `!reportId`. This establishes the
 * correct boundary: editable while the report is still in DRAFT, only
 * read-only in IN_REVIEW and later.
 *
 * Observation B — the download of the official PDF. The contract of the
 * `sign-and-publish` response (§8/§9.1), download via `<a>`
 * instead of `window.open` (§9.3, Safari) and messages differentiated by
 * status codes (§9.2).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { message } from "antd";
import ReportEditor from "../../components/report/report_editor";
import * as reportService from "../../services/report_service";
import * as letterheadService from "../../services/report_letterhead_service";
import { useUserProfile } from "../../hooks/use_user_profile";
import type { ReportFullResponse } from "../../models/report";

vi.mock("../../hooks/use_user_profile");
const mockedUseUserProfile = vi.mocked(useUserProfile);

const REPORT_ID = "00000000-0000-0000-0000-00000000ff01";
const ORDER_ID = "00000000-0000-0000-0000-0000000000aa";

const PRESENTATION_GENERAL = {
    paper: { size: "LETTER" as const, orientation: "PORTRAIT" as const, margins_cm: { top: 2, right: 2, bottom: 2, left: 2 } },
    header: {
        enabled: true, logo_storage_id: null, institution_name: "Membrete General",
        subtitle: null, address: null, phone: null, email: null,
    },
    footer: { enabled: true, custom_text: "Pie general", show_page_number: true },
    style: { primary_color: "#336699" },
    signer: null,
};

const PRESENTATION_NEFRO = {
    ...PRESENTATION_GENERAL,
    header: { ...PRESENTATION_GENERAL.header, institution_name: "Membrete Nefropatología" },
    footer: { enabled: true, custom_text: "Pie nefro", show_page_number: true },
};

const TEMPLATE_JSON = {
    base: { diagnosis: { label: "Diagnóstico", type: "text", is_custom: true, value: "" } },
    sections: { hallazgos: { label: "Hallazgos", type: "richtext", is_visible: true, content: "" } },
    base_order: ["diagnosis"],
    section_order: ["hallazgos"],
};

function withPermission() {
    mockedUseUserProfile.mockReturnValue({
        profile: null, loading: false, authStatus: "authenticated", sessionExpired: false,
        error: null, canManageUsers: false, canManageBranches: false, canManageCatalog: false,
        canManageTenant: false, hasPermission: () => true, hasRole: () => true,
    } as unknown as ReturnType<typeof useUserProfile>);
}

function buildFull(status: string, letterheadVersionId = "lhv-general"): ReportFullResponse {
    return {
        order: {
            id: ORDER_ID, order_code: "CTM-27", status: "IN_PROGRESS",
            patient_id: "p1", tenant_id: "t1", branch_id: "b1",
        },
        patient: { id: "p1", tenant_id: "t1", branch_id: "b1", patient_code: "PAT-1" },
        samples: [],
        report: {
            id: REPORT_ID,
            version_no: 1,
            status,
            order_id: ORDER_ID,
            tenant_id: "t1",
            branch_id: "b1",
            title: "Reporte de prueba",
            published_at: null,
            created_by: "u1",
            signed_by: null,
            signed_at: null,
            template: TEMPLATE_JSON,
            schema_version: 2,
            template_version_id: "tv1",
            letterhead_version_id: letterheadVersionId,
            generated_by_renderer_version: "backend-snapshot-builder/block-b/1.0.0",
            resolved_resources: null,
            report: {
                schema_version: 2,
                base: { diagnosis: { label: "Diagnóstico", value: "Carcinoma ductal" } },
                sections: { hallazgos: { label: "Hallazgos", content: "Tejido con atipia marcada" } },
                base_order: ["diagnosis"],
                section_order: ["hallazgos"],
                rendering_snapshot: {
                    schema_version: 2,
                    template: TEMPLATE_JSON,
                    presentation: PRESENTATION_GENERAL,
                },
            },
        },
    } as unknown as ReportFullResponse;
}

function mockLetterheadCatalog() {
    vi.spyOn(letterheadService, "listReportLetterheads").mockResolvedValue({
        letterheads: [
            { id: "lh-general", name: "Membrete General" },
            { id: "lh-nefro", name: "Membrete Nefropatología" },
        ],
    } as never);
    vi.spyOn(letterheadService, "listReportLetterheadVersions").mockImplementation(
        async (letterheadId: string) => ({
            versions: [
                {
                    id: letterheadId === "lh-general" ? "lhv-general" : "lhv-nefro",
                    status: "ACTIVE",
                    version_number: 1,
                },
            ],
        }) as never
    );
    vi.spyOn(letterheadService, "getReportLetterheadVersion").mockImplementation(
        async (_lhId: string, versionId: string) => ({
            id: versionId,
            status: "ACTIVE",
            configuration: versionId === "lhv-nefro" ? PRESENTATION_NEFRO : PRESENTATION_GENERAL,
            resolved_resources: null,
        }) as never
    );
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
    withPermission();
    localStorage.setItem("tenant_id", "t1");
    localStorage.setItem("branch_id", "b1");
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true, status: 200,
        text: () => Promise.resolve("{}"),
        json: () => Promise.resolve({}),
    } as Response);
});

afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
});

/** The letterhead panel appears at the end of a string of three promises
 * (`/full` -> list Letterheads -> list versions of each one), so the
 * default 1s `waitFor` timeout becomes too short when the full suite runs
 * under load. This is not product slowness: it appears immediately in
 * isolation. */
const PANEL_TIMEOUT = 8000;

async function openEditor(status: string) {
    vi.spyOn(reportService, "getReportFull").mockResolvedValue(buildFull(status));
    mockLetterheadCatalog();
    renderEditor();
    await waitFor(
        () => {
            expect(screen.getByTestId("letterhead-panel")).toBeTruthy();
        },
        { timeout: PANEL_TIMEOUT }
    );
}

function selectElement() {
    return screen.getByTestId("letterhead-select").querySelector(".ant-select");
}

/** The panel appears as soon as there is a letterhead to name; that the selector
 * whether it is enabled also depends on the list of options, which arrives
 * from another promise. Without `waitFor`, the assertion races that render and
 * fails intermittently under full-suite load. */
async function expectSelectDisabled(disabled: boolean) {
    await waitFor(
        () => {
            expect(selectElement()?.classList.contains("ant-select-disabled")).toBe(disabled);
        },
        { timeout: PANEL_TIMEOUT }
    );
}

describe("Observation A — letterhead selector on a persisted DRAFT", () => {
    it("a saved DRAFT shows the selector ENABLED", async () => {
        await openEditor("DRAFT");
        await expectSelectDisabled(false);
    });

    it("a DRAFT reopened preselects the current letterhead by its logical name", async () => {
        await openEditor("DRAFT");
        await waitFor(() => {
            expect(screen.getByTestId("letterhead-panel").textContent).toContain("Membrete General");
        }, { timeout: PANEL_TIMEOUT });
        // §4.3: version numbers are never shown in the normal flow.
        expect(screen.getByTestId("letterhead-panel").textContent).not.toContain("lhv-general");
    });

    it("IN_REVIEW shows the letterhead as READ-ONLY with the explanation", async () => {
        await openEditor("IN_REVIEW");
        await expectSelectDisabled(true);
        expect(screen.getByTestId("letterhead-frozen-note").textContent).toContain(
            "El membrete quedó fijado al enviar el reporte a revisión."
        );
    });

    it("APPROVED blocks the selector", async () => {
        await openEditor("APPROVED");
        await expectSelectDisabled(true);
        expect(screen.queryByTestId("letterhead-frozen-note")).toBeTruthy();
    });

    it("PUBLISHED blocks the selector", async () => {
        await openEditor("PUBLISHED");
        await expectSelectDisabled(true);
    });

    it("the field still shows when only one letterhead exists (§4.2)", async () => {
        vi.spyOn(reportService, "getReportFull").mockResolvedValue(buildFull("DRAFT"));
        vi.spyOn(letterheadService, "listReportLetterheads").mockResolvedValue({
            letterheads: [{ id: "lh-general", name: "Membrete General" }],
        } as never);
        vi.spyOn(letterheadService, "listReportLetterheadVersions").mockResolvedValue({
            versions: [{ id: "lhv-general", status: "ACTIVE", version_number: 1 }],
        } as never);
        renderEditor();

        await waitFor(() => {
            expect(screen.getByTestId("letterhead-panel").textContent).toContain("Membrete General");
        }, { timeout: PANEL_TIMEOUT });
        // Present but disabled — never hidden.
        await expectSelectDisabled(true);
    });

    it("changing the letterhead preserves clinical content and updates the preview", async () => {
        await openEditor("DRAFT");
        await waitFor(() => {
            expect(document.body.textContent).toContain("Membrete General");
        });

        const clinicalValues = () =>
            Array.from(document.querySelectorAll("input, textarea")).map(
                (el) => (el as HTMLInputElement).value
            );
        expect(clinicalValues()).toContain("Carcinoma ductal");

        fireEvent.mouseDown(selectElement()!.querySelector(".ant-select-selector")!);
        await waitFor(() => {
            expect(document.querySelector(".ant-select-item-option")).toBeTruthy();
        });
        const nefro = Array.from(document.querySelectorAll(".ant-select-item-option")).find((o) =>
            o.textContent?.includes("Nefropatología")
        );
        fireEvent.click(nefro!);

        // The new presentation reaches the preview…
        await waitFor(() => {
            expect(document.body.textContent).toContain("Membrete Nefropatología");
        });
        // …and the clinical content already written remains intact (§3.3: the change
        // letterhead change only replaces `presentation`; it never rebuilds
        // the content).
        expect(clinicalValues()).toContain("Carcinoma ductal");
        expect(document.body.textContent).toContain("Tejido con atipia marcada");
        expect(screen.getByTestId("letterhead-dirty-note")).toBeTruthy();
    });

    it("saving sends the NEW letterhead_version_id", async () => {
        await openEditor("DRAFT");
        const saveVersion = vi
            .spyOn(reportService, "saveReportVersion")
            .mockResolvedValue(undefined as never);

        fireEvent.mouseDown(selectElement()!.querySelector(".ant-select-selector")!);
        await waitFor(() => expect(document.querySelector(".ant-select-item-option")).toBeTruthy());
        const nefro = Array.from(document.querySelectorAll(".ant-select-item-option")).find((o) =>
            o.textContent?.includes("Nefropatología")
        );
        fireEvent.click(nefro!);
        await waitFor(() => expect(screen.getByTestId("letterhead-dirty-note")).toBeTruthy());

        fireEvent.click(screen.getByRole("button", { name: /Guardar/i }));

        await waitFor(() => expect(saveVersion).toHaveBeenCalled());
        const envelope = saveVersion.mock.calls[0][0];
        expect(envelope.letterhead_version_id).toBe("lhv-nefro");
        // The clinical content remains intact in the same save.
        expect(envelope.report?.base?.diagnosis?.value).toBe("Carcinoma ductal");
        expect(envelope.template_version_id).toBe("tv1");
    });

    it("shows the backend error when save returns 409", async () => {
        await openEditor("DRAFT");
        const errorSpy = vi.spyOn(message, "error").mockImplementation(() => null as never);
        vi.spyOn(reportService, "saveReportVersion").mockRejectedValue(
            new Error("El membrete quedó fijado al enviar el reporte a revisión")
        );

        fireEvent.click(screen.getByRole("button", { name: /Guardar/i }));

        await waitFor(() => {
            expect(errorSpy).toHaveBeenCalledWith(
                expect.stringContaining("El membrete quedó fijado")
            );
        });
    });
});

describe("Observation B — official PDF download", () => {
    it("after sign and publish the download button appears without reload", async () => {
        vi.spyOn(reportService, "getReportFull").mockResolvedValue(buildFull("APPROVED"));
        mockLetterheadCatalog();
        vi.spyOn(reportService, "signAndPublishReport").mockResolvedValue({
            id: REPORT_ID,
            status: "PUBLISHED",
            message: "Reporte firmado y publicado",
            pdf_generation_status: "READY",
            pdf_sha256: "abc123",
            pdf_size_bytes: 1024,
            pdf_page_count: 2,
            pdf_generated_at: "2026-08-02T00:00:00Z",
            report_version_id: "rv-7",
            version_no: 3,
            official_pdf_available: true,
        } as never);
        renderEditor();

        await waitFor(() => {
            expect(screen.getByRole("button", { name: /Firmar y publicar/i })).toBeTruthy();
        }, { timeout: PANEL_TIMEOUT });
        fireEvent.click(screen.getByRole("button", { name: /Firmar y publicar/i }));

        await waitFor(() => {
            expect(screen.getByTestId("download-official-pdf")).toBeTruthy();
        }, { timeout: PANEL_TIMEOUT });
    });

    it("request the version announced by sign-and-publish, not the one on the envelope", async () => {
        vi.spyOn(reportService, "getReportFull").mockResolvedValue(buildFull("APPROVED"));
        mockLetterheadCatalog();
        vi.spyOn(reportService, "signAndPublishReport").mockResolvedValue({
            id: REPORT_ID, status: "PUBLISHED", message: "ok",
            pdf_generation_status: "READY", pdf_sha256: "x", pdf_size_bytes: 1,
            pdf_page_count: 1, pdf_generated_at: null,
            report_version_id: "rv-7", version_no: 3, official_pdf_available: true,
        } as never);
        const getUrl = vi
            .spyOn(reportService, "getOfficialPdfDownloadUrl")
            .mockResolvedValue({
                version_id: "rv-7", version_no: 3, report_id: REPORT_ID,
                pdf_storage_id: "s1", pdf_key: "k",
                pdf_url: "https://s3.example/signed.pdf",
            });
        vi.spyOn(reportService, "triggerBrowserDownload").mockImplementation(() => undefined);

        renderEditor();
        await waitFor(() => screen.getByRole("button", { name: /Firmar y publicar/i }), { timeout: PANEL_TIMEOUT });
        fireEvent.click(screen.getByRole("button", { name: /Firmar y publicar/i }));
        await waitFor(() => screen.getByTestId("download-official-pdf"), { timeout: PANEL_TIMEOUT });

        fireEvent.click(screen.getByTestId("download-official-pdf"));

        await waitFor(() => expect(getUrl).toHaveBeenCalled());
        // `buildFull` leaves version_no=1 in the envelope; the response of
        // publishing says 3. The response must win.
        expect(getUrl).toHaveBeenCalledWith(REPORT_ID, 3);
    });

    it("download with a <a download> instead of window.open (Safari-safe)", async () => {
        vi.spyOn(reportService, "getReportFull").mockResolvedValue(buildFull("PUBLISHED"));
        mockLetterheadCatalog();
        vi.spyOn(reportService, "getOfficialPdfDownloadUrl").mockResolvedValue({
            version_id: "rv-1", version_no: 1, report_id: REPORT_ID,
            pdf_storage_id: "s1", pdf_key: "k",
            pdf_url: "https://s3.example/signed.pdf",
        });
        const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
        const clicks: HTMLAnchorElement[] = [];
        const origCreate = document.createElement.bind(document);
        vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
            const el = origCreate(tag);
            if (tag === "a") {
                const anchor = el as HTMLAnchorElement;
                anchor.click = () => { clicks.push(anchor); };
            }
            return el;
        });

        renderEditor();
        await waitFor(() => screen.getByTestId("download-official-pdf"), { timeout: PANEL_TIMEOUT });
        fireEvent.click(screen.getByTestId("download-official-pdf"));

        await waitFor(() => expect(clicks.length).toBe(1));
        expect(clicks[0].href).toBe("https://s3.example/signed.pdf");
        expect(clicks[0].getAttribute("download")).toBe("reporte-CTM-27-v1.pdf");
        expect(clicks[0].rel).toBe("noopener");
        expect(openSpy).not.toHaveBeenCalled();
    });

    it("a 403 shows a permission message, not the raw detail", async () => {
        vi.spyOn(reportService, "getReportFull").mockResolvedValue(buildFull("PUBLISHED"));
        mockLetterheadCatalog();
        const errorSpy = vi.spyOn(message, "error").mockImplementation(() => null as never);
        vi.spyOn(reportService, "getOfficialPdfDownloadUrl").mockRejectedValue(
            new reportService.OfficialPdfDownloadError(403, "Permission required: reports:read")
        );

        renderEditor();
        await waitFor(() => screen.getByTestId("download-official-pdf"), { timeout: PANEL_TIMEOUT });
        fireEvent.click(screen.getByTestId("download-official-pdf"));

        await waitFor(() => {
            expect(errorSpy).toHaveBeenCalledWith("No tienes permiso para descargar este reporte.");
        });
    });

    it("a 404 says it is not available", async () => {
        vi.spyOn(reportService, "getReportFull").mockResolvedValue(buildFull("PUBLISHED"));
        mockLetterheadCatalog();
        const errorSpy = vi.spyOn(message, "error").mockImplementation(() => null as never);
        vi.spyOn(reportService, "getOfficialPdfDownloadUrl").mockRejectedValue(
            new reportService.OfficialPdfDownloadError(404, "PDF not found for this version")
        );

        renderEditor();
        await waitFor(() => screen.getByTestId("download-official-pdf"), { timeout: PANEL_TIMEOUT });
        fireEvent.click(screen.getByTestId("download-official-pdf"));

        await waitFor(() => {
            expect(errorSpy).toHaveBeenCalledWith("El reporte o su PDF oficial no está disponible.");
        });
    });

    it("a 409 says that the PDF is still not ready", async () => {
        vi.spyOn(reportService, "getReportFull").mockResolvedValue(buildFull("PUBLISHED"));
        mockLetterheadCatalog();
        const errorSpy = vi.spyOn(message, "error").mockImplementation(() => null as never);
        vi.spyOn(reportService, "getOfficialPdfDownloadUrl").mockRejectedValue(
            new reportService.OfficialPdfDownloadError(409, "PDF generation already in progress")
        );

        renderEditor();
        await waitFor(() => screen.getByTestId("download-official-pdf"), { timeout: PANEL_TIMEOUT });
        fireEvent.click(screen.getByTestId("download-official-pdf"));

        await waitFor(() => {
            expect(errorSpy).toHaveBeenCalledWith(
                "El PDF oficial aún no está listo. Inténtalo de nuevo en unos segundos."
            );
        });
    });

    it("a /full laggard cannot downgrade the newly published state", async () => {
        // `getReportFull` remains returning APPROVED (read replica
        // lagged). The sign-and-publish response is authoritative, so
        // the download button must remain in the footer. This case was not
        // previously covered: the implementation simply did
        // `setEnvelope(full.report)`, which would have made the download disappear.
        vi.spyOn(reportService, "getReportFull").mockResolvedValue(buildFull("APPROVED"));
        mockLetterheadCatalog();
        vi.spyOn(reportService, "signAndPublishReport").mockResolvedValue({
            id: REPORT_ID, status: "PUBLISHED", message: "ok",
            pdf_generation_status: "READY", pdf_sha256: "x", pdf_size_bytes: 1,
            pdf_page_count: 1, pdf_generated_at: null,
            report_version_id: "rv-7", version_no: 2, official_pdf_available: true,
        } as never);

        renderEditor();
        await waitFor(() => screen.getByRole("button", { name: /Firmar y publicar/i }), { timeout: PANEL_TIMEOUT });
        fireEvent.click(screen.getByRole("button", { name: /Firmar y publicar/i }));

        await waitFor(() => expect(screen.getByTestId("download-official-pdf")).toBeTruthy(), { timeout: PANEL_TIMEOUT });
        // It remains after refresh.
        await new Promise((r) => setTimeout(r, 50));
        expect(screen.getByTestId("download-official-pdf")).toBeTruthy();
    });

    it("local printing remains available as a secondary action", async () => {
        await openEditor("PUBLISHED");
        expect(screen.getByTestId("print-local-copy")).toBeTruthy();
        expect(screen.getByTestId("print-local-copy").textContent).toContain("Imprimir copia local");
        // And the official download remains the primary one.
        expect(screen.getByTestId("download-official-pdf")).toBeTruthy();
    });
});
