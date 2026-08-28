/**
 * H-0c — pre-cutover functional blocker, frontend half.
 *
 * The report editor collapsed two unrelated situations into one message:
 *
 *   A. the tenant genuinely has no usable default letterhead;
 *   B. the configuration request itself failed.
 *
 * Because the bootstrap `catch` hard-coded `NO_LETTERHEAD`, a pathologist's
 * 403 on `GET /reports/templates/{id}/versions/{vid}` was reported as
 * "Falta el membrete predeterminado del laboratorio". The letterhead was
 * configured correctly; the message sent administrators to fix a page that
 * had nothing wrong with it, and hid a permissions defect for the whole
 * pre-cutover window.
 *
 * These tests pin the four distinct states required by the brief:
 *
 *   404 / explicit "no default configured" -> missing-letterhead state
 *   401 / 403                              -> authorization/session state
 *   5xx / network failure                  -> connectivity/service state
 *   200 with no default                    -> genuine configuration warning
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ReportEditor from "../../components/report/report_editor";
import * as reportService from "../../services/report_service";
import * as letterheadService from "../../services/report_letterhead_service";
import { ReportConfigRequestError } from "../../services/report_service";
import { useUserProfile } from "../../hooks/use_user_profile";
import type { StudyTypeReportDefaults } from "../../models/report_letterhead";

vi.mock("../../hooks/use_user_profile");
const mockedUseUserProfile = vi.mocked(useUserProfile);

const ORDER_ID = "00000000-0000-0000-0000-0000000000aa";
const STUDY_TYPE_ID = "00000000-0000-0000-0000-0000000000bb";
const TEMPLATE_ID = "00000000-0000-0000-0000-0000000000cc";

const PRESENTATION = {
    paper: {
        size: "LETTER" as const,
        orientation: "PORTRAIT" as const,
        margins_cm: { top: 2, right: 2, bottom: 2, left: 2 },
    },
    header: {
        enabled: true, logo_storage_id: null, institution_name: "Laboratorio Del Membrete",
        subtitle: null, address: null, phone: null, email: null,
    },
    footer: { enabled: true, custom_text: "Pie del membrete", show_page_number: true },
    style: { primary_color: "#336699" },
    signer: null,
};

/** A pathologist: authors reports, cannot manage templates or letterheads. */
function asPathologist() {
    mockedUseUserProfile.mockReturnValue({
        profile: null, loading: false, authStatus: "authenticated", sessionExpired: false,
        error: null, canManageUsers: false, canManageBranches: false, canManageCatalog: false,
        canManageTenant: false, hasPermission: () => false, hasRole: () => false,
    } as unknown as ReturnType<typeof useUserProfile>);
}

function mockFetch(opts: { v2Enabled: boolean }) {
    const json = (body: unknown) =>
        Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(body)),
            json: () => Promise.resolve(body),
        } as Response);

    return vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/laboratory/orders/")) {
            return json({
                order: {
                    id: ORDER_ID, order_code: "ORD-1", status: "IN_PROGRESS",
                    patient_id: "p1", tenant_id: "t1", branch_id: "b1",
                    study_type_id: STUDY_TYPE_ID,
                },
                patient: { id: "p1", tenant_id: "t1", branch_id: "b1", patient_code: "PAT-1" },
                samples: [],
            });
        }
        if (url.includes("/tenants/")) return json({ reports_v2_enabled: opts.v2Enabled });
        return json({});
    });
}

function mockStudyTypeAndTemplate() {
    vi.spyOn(reportService, "getStudyType").mockResolvedValue({
        id: STUDY_TYPE_ID, code: "HP", name: "Histopatología",
        default_report_template_id: TEMPLATE_ID, is_active: true, tenant_id: "t1",
    } as never);
    vi.spyOn(reportService, "getReportTemplateById").mockResolvedValue({
        id: TEMPLATE_ID, name: "Clínica",
        template_json: { base: {}, sections: {}, base_order: [], section_order: [] },
    } as never);
}

function mockTemplateVersionOk() {
    return vi.spyOn(reportService, "getReportTemplateVersion").mockResolvedValue({
        id: "tv1", tenant_id: "t1", report_template_id: TEMPLATE_ID, version_number: 1,
        schema_version: 2, status: "ACTIVE", created_by: null, published_at: "2026-01-01",
        activated_at: "2026-01-01", archived_at: null,
        configuration: {
            schema_version: 2,
            template: { base: {}, sections: {}, base_order: [], section_order: [] },
            presentation: PRESENTATION,
        },
    } as never);
}

function mockDefaults(overrides: Partial<StudyTypeReportDefaults> = {}) {
    return vi.spyOn(reportService, "getStudyTypeReportDefaults").mockResolvedValue({
        template_id: TEMPLATE_ID,
        active_template_version_id: "tv1",
        letterhead_version_id: "lhv1",
        letterhead_name: "Membrete General",
        letterhead_id: "lh1",
        letterhead_resolution_source: "TENANT_DEFAULT",
        letterhead_presentation: PRESENTATION,
        letterhead_resolved_resources: null,
        v2_blocked_reason: null,
        v2_blocked_detail: null,
        ...overrides,
    } as StudyTypeReportDefaults);
}

function renderEditor() {
    return render(
        <MemoryRouter initialEntries={[`/reports/new?orderId=${ORDER_ID}`]}>
            <Routes>
                <Route path="/reports/new" element={<ReportEditor />} />
            </Routes>
        </MemoryRouter>
    );
}

const MISSING_LETTERHEAD = /Falta el membrete predeterminado/i;

beforeEach(() => {
    asPathologist();
    localStorage.setItem("tenant_id", "t1");
    localStorage.setItem("branch_id", "b1");
});

afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
});

describe("ReportEditor — a pathologist initializes a new report (H-0c)", () => {
    it("initializes a V2 report and loads the resolved default letterhead", async () => {
        mockFetch({ v2Enabled: true });
        mockStudyTypeAndTemplate();
        mockTemplateVersionOk();
        mockDefaults();
        vi.spyOn(letterheadService, "listReportLetterheads").mockResolvedValue({ letterheads: [] });

        renderEditor();

        // The resolved letterhead is what the preview renders...
        await waitFor(() => {
            expect(document.body.textContent).toContain("Laboratorio Del Membrete");
        });
        // ...and nothing is reported as blocked.
        expect(screen.queryByText(MISSING_LETTERHEAD)).toBeNull();
    });

    it("reads the ACTIVE template version — the request that used to 403", async () => {
        mockFetch({ v2Enabled: true });
        mockStudyTypeAndTemplate();
        const versionSpy = mockTemplateVersionOk();
        mockDefaults();
        vi.spyOn(letterheadService, "listReportLetterheads").mockResolvedValue({ letterheads: [] });

        renderEditor();

        await waitFor(() => {
            expect(versionSpy).toHaveBeenCalledWith(TEMPLATE_ID, "tv1");
        });
        expect(screen.queryByText(MISSING_LETTERHEAD)).toBeNull();
    });
});

describe("ReportEditor — configuration states are not conflated (H-0c)", () => {
    it("shows the missing-letterhead state when the tenant truly has no default", async () => {
        mockFetch({ v2Enabled: true });
        mockStudyTypeAndTemplate();
        mockTemplateVersionOk();
        // A SUCCESSFUL response that reports no default: the one case where
        // "Falta el membrete predeterminado" is a true statement.
        mockDefaults({
            letterhead_version_id: null,
            letterhead_id: null,
            letterhead_name: null,
            letterhead_presentation: null,
            letterhead_resolution_source: null,
            v2_blocked_reason: "NO_LETTERHEAD",
        });

        renderEditor();

        await waitFor(() => {
            expect(screen.getByText(MISSING_LETTERHEAD)).toBeTruthy();
        });
    });

    it("does NOT claim a missing letterhead on 403", async () => {
        mockFetch({ v2Enabled: true });
        mockStudyTypeAndTemplate();
        mockTemplateVersionOk();
        vi.spyOn(reportService, "getStudyTypeReportDefaults").mockRejectedValue(
            new ReportConfigRequestError(403, "No tienes permiso para realizar esta acción.")
        );

        renderEditor();

        await waitFor(() => {
            expect(
                screen.getByText(/No tienes acceso a la configuración de reportes/i)
            ).toBeTruthy();
        });
        expect(screen.queryByText(MISSING_LETTERHEAD)).toBeNull();
        // It must not send the user to the Membretes page to fix nothing.
        expect(screen.queryByRole("button", { name: /Ir a Membretes/i })).toBeNull();
    });

    it("does NOT claim a missing letterhead on 401", async () => {
        mockFetch({ v2Enabled: true });
        mockStudyTypeAndTemplate();
        mockTemplateVersionOk();
        vi.spyOn(reportService, "getStudyTypeReportDefaults").mockRejectedValue(
            new ReportConfigRequestError(401, "Tu sesión expiró. Vuelve a iniciar sesión.")
        );

        renderEditor();

        await waitFor(() => {
            expect(
                screen.getByText(/No tienes acceso a la configuración de reportes/i)
            ).toBeTruthy();
        });
        expect(screen.queryByText(MISSING_LETTERHEAD)).toBeNull();
    });

    it("does NOT claim a missing letterhead on 403 from the template-version read", async () => {
        // The exact reported failure: `report-defaults` succeeds and the NEXT
        // call in the same `try` is the one that 403s.
        mockFetch({ v2Enabled: true });
        mockStudyTypeAndTemplate();
        mockDefaults();
        vi.spyOn(reportService, "getReportTemplateVersion").mockRejectedValue(
            new ReportConfigRequestError(403, "Permission required: reports:manage_templates")
        );

        renderEditor();

        await waitFor(() => {
            expect(
                screen.getByText(/No tienes acceso a la configuración de reportes/i)
            ).toBeTruthy();
        });
        expect(screen.queryByText(MISSING_LETTERHEAD)).toBeNull();
    });

    it("does NOT claim a missing letterhead on 5xx", async () => {
        mockFetch({ v2Enabled: true });
        mockStudyTypeAndTemplate();
        mockTemplateVersionOk();
        vi.spyOn(reportService, "getStudyTypeReportDefaults").mockRejectedValue(
            new ReportConfigRequestError(500, "Error interno del servidor")
        );

        renderEditor();

        await waitFor(() => {
            expect(
                screen.getByText(/No se pudo consultar la configuración de reportes/i)
            ).toBeTruthy();
        });
        expect(screen.queryByText(MISSING_LETTERHEAD)).toBeNull();
    });

    it("does NOT claim a missing letterhead on a network failure", async () => {
        mockFetch({ v2Enabled: true });
        mockStudyTypeAndTemplate();
        mockTemplateVersionOk();
        vi.spyOn(reportService, "getStudyTypeReportDefaults").mockRejectedValue(
            new ReportConfigRequestError(
                null,
                "Error de red: no se pudo contactar al servidor. Verifica tu conexión."
            )
        );

        renderEditor();

        await waitFor(() => {
            expect(
                screen.getByText(/No se pudo consultar la configuración de reportes/i)
            ).toBeTruthy();
        });
        expect(screen.queryByText(MISSING_LETTERHEAD)).toBeNull();
    });

    it("never renders Legacy for any failure state", async () => {
        mockFetch({ v2Enabled: true });
        mockStudyTypeAndTemplate();
        mockTemplateVersionOk();
        vi.spyOn(reportService, "getStudyTypeReportDefaults").mockRejectedValue(
            new ReportConfigRequestError(403, "No tienes permiso para realizar esta acción.")
        );

        renderEditor();

        await waitFor(() => {
            expect(
                screen.getByText(/No tienes acceso a la configuración de reportes/i)
            ).toBeTruthy();
        });
        // Issue F still holds: blocked, never a Legacy substitute.
        expect(document.body.textContent).not.toMatch(/villanueva/i);
    });
});

describe("ReportConfigRequestError (H-0c)", () => {
    it("carries the HTTP status so callers can classify the failure", () => {
        const err = new ReportConfigRequestError(403, "sin permiso");
        expect(err).toBeInstanceOf(Error);
        expect(err.status).toBe(403);
        expect(err.message).toBe("sin permiso");
    });

    it("uses a null status for a request that never reached the server", () => {
        expect(new ReportConfigRequestError(null, "red").status).toBeNull();
    });
});
