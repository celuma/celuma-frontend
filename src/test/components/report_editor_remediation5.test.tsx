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

/**
 * `asReviewer` is the Céluma 1.3.1 Block A axis.
 *
 * These tests predate the reviewer contract and were written for a user with
 * every permission. That is no longer one persona but two, and the letterhead
 * assertions below differ between them: an assigned reviewer may now change
 * the letterhead while the report is IN_REVIEW (A5), whereas for everyone
 * else it stays frozen at submission exactly as remediation 5 established.
 *
 * Default `false` keeps each existing assertion testing what it was written
 * to test; Observation B opts in, because signing has always been an action
 * only an authorized reviewer can reach.
 */
function withPermission(asReviewer = false) {
    mockedUseUserProfile.mockReturnValue({
        profile: null, loading: false, authStatus: "authenticated", sessionExpired: false,
        error: null, canManageUsers: false, canManageBranches: false, canManageCatalog: false,
        canManageTenant: false, hasPermission: () => true, hasRole: () => true,
        canActAsReviewer: () => asReviewer, isAssignedReviewer: () => asReviewer,
        canReopenApprovedReport: () => asReviewer,
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

async function openEditor(status: string, { asReviewer = false } = {}) {
    // Céluma 1.3.1 Block A: the letterhead selector's editability now depends
    // on WHO is looking as well as on the report's state, so the persona is
    // part of opening the editor.
    withPermission(asReviewer);
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

describe("Observation A — letterhead selector across the lifecycle", () => {
    // Céluma 1.3.1 Block A (corrected A5/A6) MOVED this boundary. Remediation 5
    // established "editable while DRAFT, frozen at submission", on the premise
    // that the letterhead belongs to whoever is writing the report. The
    // product contract is that it belongs to the assigned REVIEWER: the
    // letterhead decides what the final clinical document looks like.
    //
    // The manual-validation remediation moved it once more, in two ways:
    //
    //   R1 (CEL-131-02) — the reviewer's window is DRAFT **and** IN_REVIEW,
    //   not IN_REVIEW alone. Waiting for submission to configure presentation
    //   was inconvenient and bought nothing: approval and signing have their
    //   own lifecycle guards and neither admits DRAFT.
    //
    //   R5 (CEL-131-08) — a user with no reviewer authority on this report no
    //   longer gets the selector as a permanently greyed-out dropdown. They
    //   get the letterhead's NAME, read-only. "Lacks authorization" hides the
    //   control; "authorized but the lifecycle blocks it" leaves it visible
    //   and disabled.
    //
    // Remediation 5's other guarantees are untouched and still asserted below —
    // the letterhead is always NAMED, never hidden; logical names, never
    // version numbers; a change replaces `presentation` only and never
    // rebuilds the clinical content.

    it("a DRAFT shows a non-reviewer the letterhead read-only, with no selector", async () => {
        await openEditor("DRAFT");
        expect(screen.queryByTestId("letterhead-select")).toBeNull();
        // A6: the name and the reason are still readable.
        expect(screen.getByTestId("letterhead-readonly").textContent).toContain(
            "Membrete General"
        );
        expect(screen.getByTestId("letterhead-frozen-note").textContent).toContain(
            "El membrete lo selecciona el revisor asignado."
        );
    });

    it("a DRAFT shows the selector ENABLED to the assigned reviewer (R1)", async () => {
        await openEditor("DRAFT", { asReviewer: true });
        await expectSelectDisabled(false);
    });

    it("IN_REVIEW shows the selector ENABLED to the assigned reviewer", async () => {
        await openEditor("IN_REVIEW", { asReviewer: true });
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

    it("IN_REVIEW shows no selector at all to anyone who is not the reviewer", async () => {
        await openEditor("IN_REVIEW");
        expect(screen.queryByTestId("letterhead-select")).toBeNull();
        expect(screen.getByTestId("letterhead-readonly").textContent).toContain(
            "Membrete General"
        );
        expect(screen.getByTestId("letterhead-frozen-note").textContent).toContain(
            "El membrete lo selecciona el revisor asignado."
        );
    });

    it("APPROVED blocks the selector, for the reviewer too", async () => {
        await openEditor("APPROVED", { asReviewer: true });
        await expectSelectDisabled(true);
        expect(screen.getByTestId("letterhead-frozen-note").textContent).toContain(
            "El membrete quedó fijado al aprobar el reporte."
        );
    });

    it("PUBLISHED keeps the selector visible but inert for an authorized reviewer", async () => {
        // The lifecycle half of the R5 rule: the authority is real, the state
        // is what blocks it, so the control stays visible and disabled.
        await openEditor("PUBLISHED", { asReviewer: true });
        await expectSelectDisabled(true);
    });

    it("PUBLISHED shows a non-reviewer no selector at all", async () => {
        await openEditor("PUBLISHED");
        expect(screen.queryByTestId("letterhead-select")).toBeNull();
    });

    it("the field still shows when only one letterhead exists (§4.2)", async () => {
        // §4.2 is about never HIDING the letterhead from someone who may
        // change it, so this is asserted as the reviewer — for whom the
        // selector renders.
        withPermission(true);
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
        await openEditor("IN_REVIEW", { asReviewer: true });
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

    it("saving sends the NEW letterhead_version_id through the reviewer route", async () => {
        // Céluma 1.3.1 Block A: the reviewer has no `reports:edit`, so this no
        // longer goes through `saveReportVersion` (the content path) — it goes
        // through the narrow presentation route, which accepts these three
        // fields and nothing else.
        await openEditor("IN_REVIEW", { asReviewer: true });
        const updatePresentation = vi
            .spyOn(reportService, "updateReportPresentation")
            .mockResolvedValue({
                id: REPORT_ID,
                status: "IN_REVIEW",
                show_signature_section: false,
                require_digital_signature: false,
                letterhead_version_id: "lhv-nefro",
            } as never);
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

        // R7: two Save affordances share one handler; target the top one.
        fireEvent.click(screen.getByTestId("report-save-top"));

        await waitFor(() => expect(updatePresentation).toHaveBeenCalled());
        expect(updatePresentation.mock.calls[0][1].letterhead_version_id).toBe("lhv-nefro");
        // And the content path is NOT used: a reviewer must never be able to
        // write clinical content through a presentation change.
        expect(saveVersion).not.toHaveBeenCalled();
    });

    it("shows the backend error when save returns 409", async () => {
        await openEditor("DRAFT");
        const errorSpy = vi.spyOn(message, "error").mockImplementation(() => null as never);
        vi.spyOn(reportService, "saveReportVersion").mockRejectedValue(
            new Error("El membrete quedó fijado al enviar el reporte a revisión")
        );

        // R7: two Save affordances share one handler; target the top one.
        fireEvent.click(screen.getByTestId("report-save-top"));

        await waitFor(() => {
            expect(errorSpy).toHaveBeenCalledWith(
                expect.stringContaining("El membrete quedó fijado")
            );
        });
    });
});

describe("Observation B — official PDF download", () => {
    // Signing is a reviewer action: only the assigned reviewer ever sees
    // "Firmar y publicar" from Céluma 1.3.1 onward (Block A). These tests are
    // about what happens AFTER that click, so they run as that reviewer.
    beforeEach(() => {
        withPermission(true);
    });

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
        // H-0c filename contract: `<ORDER_CODE>-<StudyTypePascalCase>.pdf`,
        // replacing the old `reporte-<code>-v<n>.pdf`. The official name
        // deliberately carries NO version — provenance comes from the report
        // id, version, object key and sha256, never from the filename.
        //
        // `Reporte` here is the documented study-type fallback, not an
        // accident: this fixture's order has no `study_type_id` and the test
        // never mocks `getStudyType`, so the editor's `studyTypeName` is
        // legitimately empty. See src/lib/report_filename.ts.
        expect(clicks[0].getAttribute("download")).toBe("CTM-27-Reporte.pdf");
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
