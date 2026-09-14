/**
 * Céluma 1.3.1 Block C (CEL-131-05) — the report editor no longer depends on a
 * template having an ACTIVE `ReportTemplateVersion`.
 *
 * The production regression, from the editor's side: the V2 bootstrap required
 * `report-defaults` to return an `active_template_version_id`, then fetched
 * that version and used its frozen `configuration.template` as the editing
 * structure. A laboratory whose template was saved before its letterhead was
 * configured had no such version — `snapshot_and_activate_template_version`
 * silently creates nothing when no letterhead resolves — and the editor showed
 * "La plantilla de este estudio no está publicada" for a template that was in
 * fact complete.
 *
 * Two things changed here, and the distinction matters:
 *
 *   * the obsolete request is **removed**, not tolerated. The editor already
 *     holds the live `ReportTemplate.template_json`, which is the right
 *     structure for a report that does not exist yet, and the backend freezes
 *     exactly that into the new report's own `rendering_snapshot`;
 *   * `template_id` replaces `template_version_id` as the V2 selector sent on
 *     create. The editor never proposes a `template_version_id` any more — a
 *     report created this way honestly has none.
 *
 * What must NOT change is everything that reads an EXISTING report, which was
 * never coupled to the version table: reconstruction from the frozen snapshot,
 * the reviewer controls (Block A) and the reopen action (Block B).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ReportEditor from "../../components/report/report_editor";
import * as reportService from "../../services/report_service";
import * as letterheadService from "../../services/report_letterhead_service";
import { useUserProfile } from "../../hooks/use_user_profile";
import type { StudyTypeReportDefaults } from "../../models/report_letterhead";

vi.mock("../../hooks/use_user_profile");
const mockedUseUserProfile = vi.mocked(useUserProfile);

// This file pins V2 bootstrap and create-payload shape, not the rich-text
// widget. The live template fixture uses a `richtext` section so the editor
// can be told apart from a frozen version; mounting real Quill for that
// label makes the first test in a loaded CI worker miss the 1s waitFor
// window looking for preview letterhead text.
vi.mock("../../components/ui/celuma_rich_text", () => ({
    default: function CelumaRichTextStub() {
        return null;
    },
}));

const ORDER_ID = "00000000-0000-0000-0000-0000000000aa";
const STUDY_TYPE_ID = "00000000-0000-0000-0000-0000000000bb";
const TEMPLATE_ID = "00000000-0000-0000-0000-0000000000cc";
const REPORT_ID = "00000000-0000-0000-0000-0000000000dd";
const USER_ID = "00000000-0000-0000-0000-0000000000ee";

const PRESENTATION = {
    paper: {
        size: "LETTER" as const,
        orientation: "PORTRAIT" as const,
        margins_cm: { top: 2, right: 2, bottom: 2, left: 2 },
    },
    header: {
        enabled: true,
        logo_storage_id: null,
        institution_name: "Laboratorio Del Membrete",
        subtitle: null,
        address: null,
        phone: null,
        email: null,
    },
    footer: { enabled: true, custom_text: "Pie del membrete", show_page_number: true },
    style: { primary_color: "#336699" },
    signer: null,
};

/** The LIVE clinical structure, as an administrator saved it. Carries a section
 *  the historical snapshot below does not, so every assertion can tell which of
 *  the two the editor is actually using. */
const LIVE_TEMPLATE_JSON = {
    base: { diagnosis: { label: "Diagnóstico", type: "text", is_custom: true, value: "" } },
    sections: {
        micro: { label: "Microscopía en vivo", type: "richtext", is_visible: true, content: "" },
    },
    base_order: ["diagnosis"],
    section_order: ["micro"],
};

/** What an older published version froze. */
const HISTORICAL_TEMPLATE_JSON = {
    base: { diagnosis: { label: "Diagnóstico", type: "text", is_custom: true, value: "" } },
    sections: {
        historico: { label: "Sección histórica", type: "richtext", is_visible: true, content: "" },
    },
    base_order: ["diagnosis"],
    section_order: ["historico"],
};

type Persona = "author" | "assignedReviewer" | "admin";

const PERSONA_PERMISSIONS: Record<Persona, string[]> = {
    author: ["reports:read", "reports:create", "reports:edit", "reports:submit", "lab:read"],
    assignedReviewer: ["reports:read", "reports:approve", "reports:sign", "lab:read"],
    admin: ["reports:read", "reports:manage_templates", "lab:read"],
};

const PERSONA_ROLES: Record<Persona, string[]> = {
    author: ["pathologist"],
    assignedReviewer: ["reviewer"],
    admin: ["admin"],
};

function asPersona(persona: Persona) {
    const permissions = PERSONA_PERMISSIONS[persona];
    const roles = PERSONA_ROLES[persona];
    const assigned = persona === "assignedReviewer";
    const reviewerContract = (capability: string) =>
        roles.includes("reviewer") && permissions.includes(capability) && assigned;
    mockedUseUserProfile.mockReturnValue({
        profile: { id: USER_ID } as never,
        loading: false,
        authStatus: "authenticated",
        sessionExpired: false,
        error: null,
        canManageUsers: false,
        canManageBranches: false,
        canManageCatalog: false,
        canManageTenant: false,
        hasPermission: (p: string) => permissions.includes(p),
        hasRole: (r: string) => roles.includes(r),
        canActAsReviewer: (capability: string) => reviewerContract(capability),
        isAssignedReviewer: () => assigned,
        canReopenApprovedReport: () =>
            reviewerContract("reports:approve") ||
            permissions.includes("reports:manage_templates"),
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

    return vi.spyOn(globalThis, "fetch").mockImplementation(
        (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if (url.includes("/laboratory/orders/")) {
                return json({
                    order: {
                        id: ORDER_ID,
                        order_code: "ORD-1",
                        status: "IN_PROGRESS",
                        patient_id: "p1",
                        tenant_id: "t1",
                        branch_id: "b1",
                        study_type_id: STUDY_TYPE_ID,
                    },
                    patient: { id: "p1", tenant_id: "t1", branch_id: "b1", patient_code: "PAT-1" },
                    samples: [],
                });
            }
            if (url.includes("/tenants/")) return json({ reports_v2_enabled: opts.v2Enabled });
            if (url.endsWith("/v1/reports/") && init?.method === "POST") {
                return json({
                    id: REPORT_ID,
                    status: "DRAFT",
                    order_id: ORDER_ID,
                    tenant_id: "t1",
                    branch_id: "b1",
                });
            }
            return json({});
        }
    );
}

function mockStudyTypeAndTemplate() {
    vi.spyOn(reportService, "getStudyType").mockResolvedValue({
        id: STUDY_TYPE_ID,
        code: "HP",
        name: "Histopatología",
        default_report_template_id: TEMPLATE_ID,
        is_active: true,
        tenant_id: "t1",
    } as never);
    vi.spyOn(reportService, "getReportTemplateById").mockResolvedValue({
        id: TEMPLATE_ID,
        name: "Clínica",
        template_json: LIVE_TEMPLATE_JSON,
    } as never);
}

/** Stubbed so a test can assert it is NEVER called. Returns the HISTORICAL
 *  structure, so if the editor ever started reading it again the difference
 *  would be visible in the rendered preview rather than silent. */
function spyOnTemplateVersionRead() {
    return vi.spyOn(reportService, "getReportTemplateVersion").mockResolvedValue({
        id: "tv1",
        tenant_id: "t1",
        report_template_id: TEMPLATE_ID,
        version_number: 1,
        schema_version: 2,
        status: "ACTIVE",
        created_by: null,
        published_at: "2026-01-01",
        activated_at: "2026-01-01",
        archived_at: null,
        configuration: {
            schema_version: 2,
            template: HISTORICAL_TEMPLATE_JSON,
            presentation: PRESENTATION,
        },
    } as never);
}

/** The regression's configuration: everything resolved, no ACTIVE version. */
function mockDefaults(overrides: Partial<StudyTypeReportDefaults> = {}) {
    return vi.spyOn(reportService, "getStudyTypeReportDefaults").mockResolvedValue({
        template_id: TEMPLATE_ID,
        active_template_version_id: null,
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

function existingV2Report(status: string, snapshotTemplate: Record<string, unknown>) {
    const content = {
        ...snapshotTemplate,
        schema_version: 2,
        rendering_snapshot: {
            schema_version: 2,
            template: snapshotTemplate,
            presentation: PRESENTATION,
        },
    };
    return {
        order: {
            id: ORDER_ID,
            order_code: "ORD-1",
            status: "IN_PROGRESS",
            patient_id: "p1",
            tenant_id: "t1",
            branch_id: "b1",
            study_type_id: STUDY_TYPE_ID,
            reviewers: [
                { id: USER_ID, name: "Dra. Revisora", email: "rev@lab.test", status: "approved" },
            ],
        },
        patient: { id: "p1", tenant_id: "t1", branch_id: "b1", patient_code: "PAT-1" },
        samples: [],
        report: {
            id: REPORT_ID,
            order_id: ORDER_ID,
            tenant_id: "t1",
            branch_id: "b1",
            created_by: "u1",
            version_no: 1,
            status,
            title: "Reporte existente",
            published_at: null,
            signed_by: null,
            signed_at: null,
            schema_version: 2,
            // The shape Block C makes possible: a V2 report with no template
            // version, and one created before 1.3.1 keeping its provenance.
            template_version_id: null,
            letterhead_version_id: "lhv1",
            template: snapshotTemplate,
            report: content,
        },
    };
}

function renderNewReport() {
    return render(
        <MemoryRouter initialEntries={[`/reports/new?orderId=${ORDER_ID}`]}>
            <Routes>
                <Route path="/reports/new" element={<ReportEditor />} />
            </Routes>
        </MemoryRouter>
    );
}

function renderExistingReport() {
    return render(
        <MemoryRouter initialEntries={[`/reports/${REPORT_ID}/edit`]}>
            <Routes>
                <Route path="/reports/:reportId/edit" element={<ReportEditor />} />
            </Routes>
        </MemoryRouter>
    );
}

beforeEach(() => {
    asPersona("author");
    localStorage.setItem("tenant_id", "t1");
    localStorage.setItem("branch_id", "b1");
    vi.spyOn(letterheadService, "listReportLetterheads").mockResolvedValue({ letterheads: [] });
});

afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
});

// ---------------------------------------------------------------------------

describe("ReportEditor — V2 bootstrap with no active template version (Block C)", () => {
    it("does not block, and mounts V2 with the resolved letterhead", async () => {
        mockFetch({ v2Enabled: true });
        mockStudyTypeAndTemplate();
        mockDefaults();

        renderNewReport();

        // Bootstrap signal: the letterhead selector is in the React tree as
        // soon as `report-defaults` resolves. The institution name is painted
        // later, in VersionedReportRendererV2's pagination effect — and
        // `document.body.textContent` is the wrong place to look for it,
        // because it also concatenates every <style> tag (letterhead CSS,
        // Quill skin) and produces the opaque CI diff this test used to emit.
        await waitFor(() => {
            expect(screen.getByTestId("letterhead-resolution-source")).toBeTruthy();
        });
        expect(await screen.findByText("Laboratorio Del Membrete")).toBeTruthy();
        // The obsolete blocked state is gone, and so is the one it used to be
        // misreported as.
        expect(
            screen.queryByText(/La plantilla de este estudio no está publicada/i)
        ).toBeNull();
        expect(
            screen.queryByText(/Falta el membrete predeterminado del laboratorio/i)
        ).toBeNull();
    });

    it("issues no template-version request at all", async () => {
        mockFetch({ v2Enabled: true });
        mockStudyTypeAndTemplate();
        const versionSpy = spyOnTemplateVersionRead();
        mockDefaults();

        renderNewReport();

        await waitFor(() => {
            expect(screen.getByTestId("letterhead-resolution-source")).toBeTruthy();
        });
        expect(versionSpy).not.toHaveBeenCalled();
    });

    it("edits the LIVE template structure, not a frozen version's", async () => {
        mockFetch({ v2Enabled: true });
        mockStudyTypeAndTemplate();
        spyOnTemplateVersionRead();
        mockDefaults();

        renderNewReport();

        await waitFor(() => {
            expect(screen.getByText("Microscopía en vivo")).toBeTruthy();
        });
        expect(screen.queryByText("Sección histórica")).toBeNull();
    });

    it("still bootstraps when an ACTIVE version happens to exist", async () => {
        // The fix must not invert the dependency: a laboratory that DOES have
        // an active version is not treated differently, and still edits the
        // live template.
        mockFetch({ v2Enabled: true });
        mockStudyTypeAndTemplate();
        const versionSpy = spyOnTemplateVersionRead();
        mockDefaults({ active_template_version_id: "tv1" });

        renderNewReport();

        await waitFor(() => {
            expect(screen.getByText("Microscopía en vivo")).toBeTruthy();
        });
        expect(versionSpy).not.toHaveBeenCalled();
        expect(screen.queryByText("Sección histórica")).toBeNull();
    });
});

describe("ReportEditor — what the editor sends on create (Block C)", () => {
    async function capturePostBody() {
        const fetchSpy = mockFetch({ v2Enabled: true });
        mockStudyTypeAndTemplate();
        mockDefaults();

        renderNewReport();
        await waitFor(() => {
            expect(screen.getByTestId("letterhead-resolution-source")).toBeTruthy();
        });
        // R7: two Save affordances share one handler; target the top one.
        screen.getByTestId("report-save-top").click();

        await waitFor(() => {
            const post = fetchSpy.mock.calls.find(
                ([url, init]) =>
                    String(url).endsWith("/v1/reports/") &&
                    (init as RequestInit | undefined)?.method === "POST"
            );
            expect(post).toBeTruthy();
        });
        const post = fetchSpy.mock.calls.find(
            ([url, init]) =>
                String(url).endsWith("/v1/reports/") &&
                (init as RequestInit | undefined)?.method === "POST"
        )!;
        return JSON.parse(String((post[1] as RequestInit).body));
    }

    it("sends template_id as the V2 selector", async () => {
        const body = await capturePostBody();
        expect(body.template_id).toBe(TEMPLATE_ID);
        expect(body.schema_version).toBe(2);
    });

    it("proposes no template_version_id", async () => {
        // The editor has no version to name and must not invent one. The
        // backend records NULL provenance, which is the truth.
        const body = await capturePostBody();
        expect(body.template_version_id ?? null).toBeNull();
    });

    it("still sends the resolved letterhead and a rendering snapshot", async () => {
        const body = await capturePostBody();
        expect(body.letterhead_version_id).toBe("lhv1");
        expect(body.report.rendering_snapshot.template.sections.micro).toBeTruthy();
    });
});

describe("ReportEditor — existing V2 reports are unaffected (Block C)", () => {
    it("reconstructs from the report's own frozen snapshot", async () => {
        mockFetch({ v2Enabled: true });
        const versionSpy = spyOnTemplateVersionRead();
        vi.spyOn(reportService, "getReportFull").mockResolvedValue(
            existingV2Report("DRAFT", HISTORICAL_TEMPLATE_JSON) as never
        );

        renderExistingReport();

        await waitFor(() => {
            expect(screen.getByText("Sección histórica")).toBeTruthy();
        });
        // Not the live template, and no version lookup — the snapshot is the
        // whole source of truth.
        expect(screen.queryByText("Microscopía en vivo")).toBeNull();
        expect(versionSpy).not.toHaveBeenCalled();
    });

    it("bootstraps a reopened DRAFT with a frozen presentation", async () => {
        // Block B's warning: a reopened report is a DRAFT that already has a
        // current version and frozen presentation. Nothing in Block C may
        // treat it as new and re-resolve its structure.
        mockFetch({ v2Enabled: true });
        mockStudyTypeAndTemplate();
        const defaultsSpy = mockDefaults();
        vi.spyOn(reportService, "getReportFull").mockResolvedValue(
            existingV2Report("DRAFT", HISTORICAL_TEMPLATE_JSON) as never
        );

        renderExistingReport();

        await waitFor(() => {
            expect(screen.getByText("Sección histórica")).toBeTruthy();
        });
        expect(defaultsSpy).not.toHaveBeenCalled();
        expect(screen.queryByText("Microscopía en vivo")).toBeNull();
    });

    it("keeps an APPROVED report read-only", async () => {
        mockFetch({ v2Enabled: true });
        vi.spyOn(reportService, "getReportFull").mockResolvedValue(
            existingV2Report("APPROVED", HISTORICAL_TEMPLATE_JSON) as never
        );

        renderExistingReport();

        await waitFor(() => {
            expect(screen.getByText("Sección histórica")).toBeTruthy();
        });
        expect(screen.queryByRole("button", { name: /^Guardar$/i })).toBeNull();
    });

    it("still offers the reviewer controls on an IN_REVIEW report", async () => {
        // Block A's contract, on a V2 report with NULL template provenance.
        asPersona("assignedReviewer");
        mockFetch({ v2Enabled: true });
        vi.spyOn(reportService, "getReportFull").mockResolvedValue(
            existingV2Report("IN_REVIEW", HISTORICAL_TEMPLATE_JSON) as never
        );

        renderExistingReport();

        await waitFor(() => {
            expect(screen.getByRole("button", { name: /Aprobar/i })).toBeTruthy();
        });
        expect(screen.getByRole("button", { name: /Solicitar Cambios/i })).toBeTruthy();
    });

    it("still offers the reopen action on an APPROVED report", async () => {
        // Block B's contract, likewise.
        asPersona("admin");
        mockFetch({ v2Enabled: true });
        vi.spyOn(reportService, "getReportFull").mockResolvedValue(
            existingV2Report("APPROVED", HISTORICAL_TEMPLATE_JSON) as never
        );

        renderExistingReport();

        await waitFor(() => {
            expect(screen.getByRole("button", { name: /Reabrir reporte/i })).toBeTruthy();
        });
    });
});

describe("ReportEditor — genuine configuration problems still surface (Block C)", () => {
    it("blocks when the study type has no template", async () => {
        mockFetch({ v2Enabled: true });
        mockStudyTypeAndTemplate();
        mockDefaults({
            template_id: null,
            letterhead_presentation: null,
            v2_blocked_reason: "NO_TEMPLATE",
        });

        renderNewReport();

        await waitFor(() => {
            expect(
                screen.getByText(/Este tipo de estudio no tiene plantilla de reporte/i)
            ).toBeTruthy();
        });
    });

    it("blocks when no letterhead resolves", async () => {
        mockFetch({ v2Enabled: true });
        mockStudyTypeAndTemplate();
        mockDefaults({
            letterhead_version_id: null,
            letterhead_presentation: null,
            v2_blocked_reason: "NO_LETTERHEAD",
        });

        renderNewReport();

        await waitFor(() => {
            expect(
                screen.getByText(/Falta el membrete predeterminado del laboratorio/i)
            ).toBeTruthy();
        });
    });

    it("blocks when the letterhead configuration is inconsistent", async () => {
        mockFetch({ v2Enabled: true });
        mockStudyTypeAndTemplate();
        mockDefaults({
            letterhead_presentation: null,
            v2_blocked_reason: "LETTERHEAD_MISCONFIGURED",
            v2_blocked_detail: "El membrete «X» tiene 2 versiones activas a la vez.",
        });

        renderNewReport();

        await waitFor(() => {
            expect(
                screen.getByText(/La configuración de membretes es inconsistente/i)
            ).toBeTruthy();
        });
        expect(document.body.textContent).toContain("2 versiones activas");
    });

    it("blocks when the presentation is missing despite no stated reason", async () => {
        // Corruption, not configuration: the backend reported nothing wrong but
        // returned no presentation. The editor must refuse rather than mount V2
        // without branding or fall back to Legacy.
        mockFetch({ v2Enabled: true });
        mockStudyTypeAndTemplate();
        mockDefaults({ letterhead_presentation: null, v2_blocked_reason: null });

        renderNewReport();

        await waitFor(() => {
            expect(
                screen.getByText(/Falta el membrete predeterminado del laboratorio/i)
            ).toBeTruthy();
        });
    });

    it("degrades to the least-claiming state on an unrecognised reason", async () => {
        // Block C removed NO_ACTIVE_TEMPLATE_VERSION from the union. A stale
        // backend mid-deploy could still send it, and the copy lookup must not
        // blank the page — nor assert anything false about the tenant.
        mockFetch({ v2Enabled: true });
        mockStudyTypeAndTemplate();
        mockDefaults({
            letterhead_presentation: null,
            v2_blocked_reason: "NO_ACTIVE_TEMPLATE_VERSION" as never,
        });

        renderNewReport();

        await waitFor(() => {
            expect(
                screen.getByText(/No se pudo consultar la configuración de reportes/i)
            ).toBeTruthy();
        });
        expect(
            screen.queryByText(/Falta el membrete predeterminado del laboratorio/i)
        ).toBeNull();
    });
});
