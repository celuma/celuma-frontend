/**
 * Céluma 1.3.1 Block C (C-8) — the editor carries the clinical-template
 * concurrency token.
 *
 * The token is opaque. The editor's entire job is to take the `template_hash`
 * that arrived **with** the `template_json` it bootstrapped from and echo it back
 * unchanged when creating the report, so the backend can refuse (409) if an
 * administrator changed the template in between.
 *
 * What the editor must NOT do, and each has a test below: compute the hash
 * itself, derive it from its own normalized template or from report content,
 * send it for an existing report, or retry against the newer template when the
 * conflict comes back.
 *
 * See docs/celuma-1.3.1/block-c/template-mutation-race.md.
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

/** The repository's established way to assert on a toast: mock the feedback
 *  module and read the call, rather than depend on antd's portal rendering. */
const apiErrorToast = vi.fn();
vi.mock("../../lib/celuma_feedback", () => ({
    showCelumaApiError: (...args: unknown[]) => apiErrorToast(...args),
    showCelumaWarning: vi.fn(),
    showCelumaSuccess: vi.fn(),
    showCelumaPermissionDenied: vi.fn(),
    registerCelumaNotification: vi.fn(),
}));

/** Everything the toast actually said — the Error's message and the fallback. */
function toastText(): string {
    return apiErrorToast.mock.calls
        .flat()
        .map((a) => (a instanceof Error ? a.message : String(a)))
        .join(" | ");
}

const ORDER_ID = "00000000-0000-0000-0000-0000000000aa";
const STUDY_TYPE_ID = "00000000-0000-0000-0000-0000000000bb";
const TEMPLATE_ID = "00000000-0000-0000-0000-0000000000cc";
const REPORT_ID = "00000000-0000-0000-0000-0000000000dd";
const USER_ID = "00000000-0000-0000-0000-0000000000ee";

/** The opaque token. Deliberately not derivable from anything in the payload, so
 *  a test can prove the editor echoes rather than computes. */
const SERVER_HASH = "9f2b7c4e-server-computed-opaque-token";

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
    footer: { enabled: true, custom_text: null, show_page_number: true },
    style: { primary_color: "#336699" },
    signer: null,
};

const TEMPLATE_JSON = {
    base: { diagnosis: { label: "Diagnóstico", type: "text", is_custom: true, value: "" } },
    sections: {
        macroscopia: { label: "Macroscopía", type: "richtext", is_visible: true, content: "" },
    },
    base_order: ["diagnosis"],
    section_order: ["macroscopia"],
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

function mockFetch(opts: { createStatus?: number; createBody?: unknown } = {}) {
    const json = (body: unknown, status = 200) =>
        Promise.resolve({
            ok: status >= 200 && status < 300,
            status,
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
            if (url.includes("/tenants/")) return json({ reports_v2_enabled: true });
            if (url.endsWith("/v1/reports/") && init?.method === "POST") {
                const status = opts.createStatus ?? 200;
                return json(
                    opts.createBody ?? {
                        id: REPORT_ID,
                        status: "DRAFT",
                        order_id: ORDER_ID,
                        tenant_id: "t1",
                        branch_id: "b1",
                    },
                    status,
                );
            }
            return json({});
        }
    );
}

function mockStudyTypeAndTemplate(hash: string | undefined = SERVER_HASH) {
    vi.spyOn(reportService, "getStudyType").mockResolvedValue({
        id: STUDY_TYPE_ID,
        code: "HP",
        name: "Histopatología",
        default_report_template_id: TEMPLATE_ID,
        is_active: true,
        tenant_id: "t1",
    } as never);
    return vi.spyOn(reportService, "getReportTemplateById").mockResolvedValue({
        id: TEMPLATE_ID,
        name: "Clínica",
        template_json: TEMPLATE_JSON,
        template_hash: hash,
    } as never);
}

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

function existingV2Report(status: string) {
    const content = {
        ...TEMPLATE_JSON,
        schema_version: 2,
        rendering_snapshot: {
            schema_version: 2,
            template: TEMPLATE_JSON,
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
            template_version_id: null,
            letterhead_version_id: "lhv1",
            template: TEMPLATE_JSON,
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

async function saveAndCaptureBody(
    fetchSpy: ReturnType<typeof mockFetch>
): Promise<Record<string, unknown>> {
    await waitFor(() => {
        expect(screen.getByTestId("letterhead-resolution-source")).toBeTruthy();
    });
    // R7: two Save affordances share one handler; target the top one.
    screen.getByTestId("report-save-top").click();

    const findPost = () =>
        fetchSpy.mock.calls.find(
            ([url, init]) =>
                String(url).endsWith("/v1/reports/") &&
                (init as RequestInit | undefined)?.method === "POST"
        );
    await waitFor(() => expect(findPost()).toBeTruthy());
    return JSON.parse(String((findPost()![1] as RequestInit).body));
}

beforeEach(() => {
    apiErrorToast.mockClear();
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

describe("ReportEditor — the token is taken from the bootstrap response (C-8)", () => {
    it("reads the hash from the same response as the template_json", async () => {
        const templateSpy = mockStudyTypeAndTemplate();
        mockFetch();
        mockDefaults();

        renderNewReport();

        await waitFor(() => {
            expect(screen.getByText("Macroscopía")).toBeTruthy();
        });
        // One call, one response: the structure and its token cannot drift.
        expect(templateSpy).toHaveBeenCalledTimes(1);
        expect(templateSpy).toHaveBeenCalledWith(TEMPLATE_ID);
    });

    it("sends template_id and template_hash together on create", async () => {
        mockStudyTypeAndTemplate();
        const fetchSpy = mockFetch();
        mockDefaults();

        renderNewReport();
        const body = await saveAndCaptureBody(fetchSpy);

        expect(body.template_id).toBe(TEMPLATE_ID);
        expect(body.template_hash).toBe(SERVER_HASH);
    });

    it("echoes the token verbatim rather than computing one", async () => {
        // The sentinel is not a hash of anything in the payload, so a client-side
        // derivation could not possibly reproduce it. If this ever fails with a
        // hex digest, someone started hashing in JavaScript — which would produce
        // false conflicts, because the editor's template is normalized and is
        // deliberately not byte-equivalent to the stored column.
        mockStudyTypeAndTemplate();
        const fetchSpy = mockFetch();
        mockDefaults();

        renderNewReport();
        const body = await saveAndCaptureBody(fetchSpy);

        expect(body.template_hash).toBe(SERVER_HASH);
        expect(String(body.template_hash)).not.toMatch(/^[0-9a-f]{64}$/);
    });

    it("does not derive the token from report content or the normalized template", async () => {
        // A second proof of the same property from the other direction: the token
        // is unchanged by what the author wrote or by the editor's own template
        // object, both of which are in the payload alongside it.
        mockStudyTypeAndTemplate();
        const fetchSpy = mockFetch();
        mockDefaults();

        renderNewReport();
        const body = await saveAndCaptureBody(fetchSpy);

        expect(body.template_hash).toBe(SERVER_HASH);
        expect(JSON.stringify(body.report)).not.toContain(SERVER_HASH);
        expect(JSON.stringify(body.template)).not.toContain(SERVER_HASH);
    });

    it("reintroduces no template_version_id dependency", async () => {
        mockStudyTypeAndTemplate();
        const fetchSpy = mockFetch();
        mockDefaults();

        renderNewReport();
        const body = await saveAndCaptureBody(fetchSpy);

        expect(body.template_version_id ?? null).toBeNull();
        expect(body.schema_version).toBe(2);
    });
});

describe("ReportEditor — the stale-template conflict (C-8)", () => {
    const CONFLICT_DETAIL =
        "La plantilla de este reporte cambió mientras lo editabas. Vuelve a cargar el reporte.";

    it("surfaces a message naming the template and the remedy", async () => {
        mockStudyTypeAndTemplate();
        const fetchSpy = mockFetch({
            createStatus: 409,
            createBody: { detail: CONFLICT_DETAIL },
        });
        mockDefaults();

        renderNewReport();
        await saveAndCaptureBody(fetchSpy);

        await waitFor(() => expect(apiErrorToast).toHaveBeenCalled());
        expect(toastText()).toMatch(/plantilla/i);
        expect(toastText()).toMatch(/cambió/i);
        expect(toastText()).toMatch(/cargar/i);
    });

    it("does not retry against the newer template", async () => {
        // The silent substitution C-8 exists to prevent must not reappear in the
        // client: exactly one create attempt, no second POST.
        mockStudyTypeAndTemplate();
        const fetchSpy = mockFetch({
            createStatus: 409,
            createBody: { detail: CONFLICT_DETAIL },
        });
        mockDefaults();

        renderNewReport();
        await saveAndCaptureBody(fetchSpy);

        await waitFor(() => expect(apiErrorToast).toHaveBeenCalled());
        const posts = fetchSpy.mock.calls.filter(
            ([url, init]) =>
                String(url).endsWith("/v1/reports/") &&
                (init as RequestInit | undefined)?.method === "POST"
        );
        expect(posts).toHaveLength(1);
    });

    it("keeps the author's unsaved work on screen", async () => {
        // The existing failure path neither navigates away nor resets state, so
        // the author can still see (and copy) what they wrote before reloading.
        // Pinned here because a future "clear on error" would silently turn a
        // recoverable conflict into lost clinical work.
        mockStudyTypeAndTemplate();
        const fetchSpy = mockFetch({
            createStatus: 409,
            createBody: { detail: CONFLICT_DETAIL },
        });
        mockDefaults();

        renderNewReport();
        await saveAndCaptureBody(fetchSpy);

        await waitFor(() => expect(apiErrorToast).toHaveBeenCalled());
        expect(screen.getByText("Macroscopía")).toBeTruthy();
        // R7: both affordances render, and both are the same control.
        expect(screen.getAllByRole("button", { name: /Guardar/i })).toHaveLength(2);
    });

    it("does not report a conflict as an ordinary save failure", async () => {
        mockStudyTypeAndTemplate();
        const fetchSpy = mockFetch({
            createStatus: 409,
            createBody: { detail: CONFLICT_DETAIL },
        });
        mockDefaults();

        renderNewReport();
        await saveAndCaptureBody(fetchSpy);

        await waitFor(() => expect(apiErrorToast).toHaveBeenCalled());
        // Routed through the conflict branch, not the generic one: no raw
        // "Error al guardar reporte: 409 - {json}" reaches the user.
        expect(toastText()).not.toMatch(/409/);
        expect(toastText()).not.toMatch(/Error al guardar reporte/);
    });
});

describe("ReportEditor — existing reports carry no creation token (C-8)", () => {
    it("loads an existing V2 report from its own snapshot", async () => {
        mockFetch();
        const templateSpy = mockStudyTypeAndTemplate();
        const defaultsSpy = mockDefaults();
        vi.spyOn(reportService, "getReportFull").mockResolvedValue(
            existingV2Report("DRAFT") as never
        );

        renderExistingReport();

        await waitFor(() => {
            expect(screen.getByText("Macroscopía")).toBeTruthy();
        });
        // Neither the template nor its token is fetched: nothing to be stale.
        expect(templateSpy).not.toHaveBeenCalled();
        expect(defaultsSpy).not.toHaveBeenCalled();
    });

    it("a reopened DRAFT behaves the same way", async () => {
        mockFetch();
        const defaultsSpy = mockDefaults();
        vi.spyOn(reportService, "getReportFull").mockResolvedValue(
            existingV2Report("DRAFT") as never
        );

        renderExistingReport();

        await waitFor(() => {
            expect(screen.getByText("Macroscopía")).toBeTruthy();
        });
        expect(defaultsSpy).not.toHaveBeenCalled();
        // R7: both affordances render, and both are the same control.
        expect(screen.getAllByRole("button", { name: /Guardar/i })).toHaveLength(2);
    });

    it("Block A reviewer controls are unchanged", async () => {
        asPersona("assignedReviewer");
        mockFetch();
        vi.spyOn(reportService, "getReportFull").mockResolvedValue(
            existingV2Report("IN_REVIEW") as never
        );

        renderExistingReport();

        await waitFor(() => {
            expect(screen.getByRole("button", { name: /Aprobar/i })).toBeTruthy();
        });
        expect(screen.getByRole("button", { name: /Solicitar Cambios/i })).toBeTruthy();
    });

    it("Block B reopen action is unchanged", async () => {
        asPersona("admin");
        mockFetch();
        vi.spyOn(reportService, "getReportFull").mockResolvedValue(
            existingV2Report("APPROVED") as never
        );

        renderExistingReport();

        await waitFor(() => {
            expect(screen.getByRole("button", { name: /Reabrir reporte/i })).toBeTruthy();
        });
    });
});
