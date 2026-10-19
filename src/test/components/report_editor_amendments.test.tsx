/**
 * Céluma 1.4 (#13): amendments in the report editor.
 *
 *   - "Enmendar reporte" appears on a published V2 report for the reopening
 *     actors only (assigned reviewer, administrator), never for a pathologist
 *     or an unassigned reviewer, and never for a legacy original (D5).
 *   - Opening asks for a category, a required reason and the user's own
 *     password; a refused password stays inline and nothing reloads.
 *   - While an amendment is open: the internal indicator, the delivered
 *     emission it keeps, cancellation (reason + password), the author's change
 *     note saved with the content and required before submission (D2), and
 *     the identification rendered in the document itself.
 *
 * The backend is authoritative for all of it; these defend the UX half.
 * Synthetic data and passwords only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { message } from "antd";
import ReportEditor from "../../components/report/report_editor";
import * as reportService from "../../services/report_service";
import * as letterheadService from "../../services/report_letterhead_service";
import { useUserProfile } from "../../hooks/use_user_profile";
import type { ReportStatus } from "../../models/report";
import { v2MinimalNeutral } from "../fixtures/reports/versioned_v2";

vi.mock("../../hooks/use_user_profile");
const mockedUseUserProfile = vi.mocked(useUserProfile);

const REPORT_ID = "report-1";
const ORDER_ID = "order-1";
const USER_ID = "user-1";
const PASSWORD = "synthetic-confirmation";

const CONTENT = {
    base: { order_code: { is_visible: true, label: "Código de orden", value: "ORD-1" } },
    sections: {
        section_macroscopic: { is_visible: true, label: "Macroscópica", type: "richtext", content: "<p>Contenido sintético.</p>" },
    },
    base_order: ["order_code"],
    section_order: ["section_macroscopic"],
};

const SIGNED_AT = "2026-10-01T15:00:00";

const OPEN_AMENDMENT = {
    id: "amendment-1",
    amendment_no: 1,
    state: "OPEN",
    category: "SUPPLEMENT",
    reason: "Resultado de IHC posterior",
    source_version_id: "v1",
    source_version_no: 1,
    source_signed_at: SIGNED_AT,
    requested_by: USER_ID,
    requested_by_name: "Dra. Revisora",
    requested_at: "2026-10-18T10:00:00",
    published_version_id: null,
    published_version_no: null,
    published_at: null,
    cancelled_by: null,
    cancelled_by_name: null,
    cancelled_at: null,
    cancel_reason: null,
};

const DELIVERED = {
    report_version_id: "v1",
    version_no: 1,
    signed_at: SIGNED_AT,
    signed_by: USER_ID,
    signed_by_name: "Dra. Revisora",
    amendment_no: null,
    is_delivered: true,
    pdf_available: true,
    pdf_sha256: "a".repeat(64),
};

type Persona = "assignedReviewer" | "unassignedReviewer" | "pathologist" | "admin";

const PERMISSIONS: Record<Persona, string[]> = {
    assignedReviewer: ["reports:read", "reports:approve", "reports:sign", "lab:read"],
    unassignedReviewer: ["reports:read", "reports:approve", "reports:sign", "lab:read"],
    pathologist: ["reports:read", "reports:create", "reports:edit", "reports:submit", "lab:read"],
    admin: ["reports:read", "reports:manage_templates", "lab:read"],
};
const ROLES: Record<Persona, string[]> = {
    assignedReviewer: ["reviewer"],
    unassignedReviewer: ["reviewer"],
    pathologist: ["pathologist"],
    admin: ["admin"],
};

function asPersona(persona: Persona) {
    const permissions = PERMISSIONS[persona];
    const roles = ROLES[persona];
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
            reviewerContract("reports:approve") || permissions.includes("reports:manage_templates"),
    } as unknown as ReturnType<typeof useUserProfile>);
}

function payload(
    status: ReportStatus,
    { amendmentOpen = false, changeNote = "", schemaVersion = 2 }: { amendmentOpen?: boolean; changeNote?: string; schemaVersion?: number } = {},
) {
    const amendmentBlock = amendmentOpen
        ? {
            amendment: {
                amendment_no: 1,
                category: "SUPPLEMENT",
                reason: "Resultado de IHC posterior",
                amends_version_no: 1,
                amends_signed_at: SIGNED_AT,
                change_note: changeNote,
            },
        }
        : {};
    return {
        order: {
            id: ORDER_ID, order_code: "ORD-1", status: "CLOSED", patient_id: "p1", tenant_id: "t1", branch_id: "b1",
            reviewers: [{ id: USER_ID, name: "Dra. Revisora", email: "rev@lab.test", status: "approved" }],
        },
        patient: { id: "p1", tenant_id: "t1", branch_id: "b1", patient_code: "PAT-1" },
        samples: [],
        report: {
            id: REPORT_ID, order_id: ORDER_ID, tenant_id: "t1", branch_id: "b1", created_by: "u1",
            version_no: amendmentOpen ? 2 : 1,
            schema_version: schemaVersion,
            status,
            title: "Reporte de prueba",
            published_at: SIGNED_AT,
            signed_by: amendmentOpen ? null : USER_ID,
            signed_at: amendmentOpen ? null : SIGNED_AT,
            template: { base: CONTENT.base, sections: CONTENT.sections, base_order: CONTENT.base_order, section_order: CONTENT.section_order },
            report: {
                ...CONTENT,
                schema_version: schemaVersion,
                // A valid frozen snapshot, so the V2 renderer (preview and
                // official PDF) actually renders the document.
                ...(schemaVersion === 2 ? { rendering_snapshot: v2MinimalNeutral.report.rendering_snapshot } : {}),
                ...amendmentBlock,
            },
            open_amendment: amendmentOpen ? OPEN_AMENDMENT : null,
            delivered_emission: DELIVERED,
        },
    };
}

function mockRest() {
    vi.spyOn(letterheadService, "listReportLetterheads").mockResolvedValue({ letterheads: [] });
    vi.spyOn(reportService, "getReportEmissions").mockResolvedValue({
        emissions: [DELIVERED],
        amendments: [],
    } as never);
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        const body = url.includes("/tenants/") ? { reports_v2_enabled: true } : {};
        return Promise.resolve({
            ok: true, status: 200,
            text: () => Promise.resolve(JSON.stringify(body)),
            json: () => Promise.resolve(body),
        } as Response);
    });
}

async function renderLoaded(persona: Persona, data: ReturnType<typeof payload>) {
    asPersona(persona);
    const full = vi.spyOn(reportService, "getReportFull").mockResolvedValue(data as never);
    mockRest();
    render(
        <MemoryRouter initialEntries={[`/reports/${REPORT_ID}`]}>
            <Routes>
                <Route path="/reports/:reportId" element={<ReportEditor />} />
            </Routes>
        </MemoryRouter>,
    );
    await waitFor(() => {
        expect(screen.getAllByDisplayValue("Reporte de prueba").length).toBeGreaterThan(0);
    });
    return full;
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

describe("Who may amend a published report", () => {
    it.each<Persona>(["assignedReviewer", "admin"])("%s sees «Enmendar reporte»", async (persona) => {
        await renderLoaded(persona, payload("PUBLISHED"));
        expect(screen.getByTestId("amend-report")).toBeTruthy();
    });

    it.each<Persona>(["pathologist", "unassignedReviewer"])("%s does not", async (persona) => {
        await renderLoaded(persona, payload("PUBLISHED"));
        expect(screen.queryByTestId("amend-report")).toBeNull();
    });

    it("a legacy original is not amendable (D5)", async () => {
        await renderLoaded("assignedReviewer", payload("PUBLISHED", { schemaVersion: 1 }));
        expect(screen.queryByTestId("amend-report")).toBeNull();
    });

    it("lists the signed emission in the history with a download", async () => {
        await renderLoaded("assignedReviewer", payload("PUBLISHED"));
        const row = await screen.findByTestId("emission-1");
        expect(row.textContent).toMatch(/Versión 1/);
        expect(row.textContent).toMatch(/Original/);
        expect(row.textContent).toMatch(/Vigente/);
    });
});

describe("Opening an amendment", () => {
    async function fillAndConfirm() {
        await userEvent.click(screen.getByTestId("amend-report"));
        const dialog = await screen.findByRole("dialog");
        await userEvent.click(within(dialog).getByRole("combobox"));
        await userEvent.click(await screen.findByText("Complemento (p. ej., IHC)"));
        await userEvent.type(within(dialog).getByLabelText("Motivo (obligatorio)"), "Resultado de IHC posterior");
        await userEvent.type(within(dialog).getByTestId("password-confirmation-input"), PASSWORD);
        await userEvent.click(within(dialog).getByTestId("password-confirmation-submit"));
    }

    it("sends category, reason and password, then reloads the editor", async () => {
        const full = await renderLoaded("assignedReviewer", payload("PUBLISHED"));
        const open = vi.spyOn(reportService, "openReportAmendment").mockResolvedValue({
            id: REPORT_ID, status: "DRAFT", message: "Enmienda 1 abierta.", amendment: OPEN_AMENDMENT, version_no: 2,
        } as never);
        const calls = full.mock.calls.length;
        full.mockResolvedValue(payload("DRAFT", { amendmentOpen: true }) as never);

        await fillAndConfirm();

        await waitFor(() =>
            expect(open).toHaveBeenCalledWith(REPORT_ID, {
                category: "SUPPLEMENT", reason: "Resultado de IHC posterior", password: PASSWORD,
            }),
        );
        await waitFor(() => expect(full.mock.calls.length).toBeGreaterThan(calls));
        expect(await screen.findByTestId("amendment-in-progress")).toBeTruthy();
    });

    it("a refused password stays inline and nothing reloads", async () => {
        const full = await renderLoaded("assignedReviewer", payload("PUBLISHED"));
        vi.spyOn(reportService, "openReportAmendment").mockRejectedValue(
            new reportService.PasswordConfirmationError(
                "password_confirmation_invalid", "La contraseña no es correcta. No se realizó ningún cambio.",
            ),
        );
        const success = vi.spyOn(message, "success");
        const calls = full.mock.calls.length;

        await fillAndConfirm();

        const dialog = await screen.findByRole("dialog");
        await waitFor(() =>
            expect(within(dialog).getByTestId("password-confirmation-error").textContent).toMatch(/no es correcta/i),
        );
        expect(success).not.toHaveBeenCalled();
        expect(full.mock.calls.length).toBe(calls);
        expect(screen.queryByTestId("amendment-in-progress")).toBeNull();
    });
});

describe("An open amendment", () => {
    it("shows the internal indicator with the emission still delivered", async () => {
        await renderLoaded("assignedReviewer", payload("DRAFT", { amendmentOpen: true }));
        const banner = screen.getByTestId("amendment-in-progress");
        expect(banner.textContent).toMatch(/Enmienda 1 en curso/);
        expect(banner.textContent).toMatch(/Resultado de IHC posterior/);
        expect(banner.textContent).toMatch(/versión 1/);
        expect(banner.textContent).toMatch(/sigue siendo la entregada/);
    });

    it("is identified in the rendered document (D2)", async () => {
        await renderLoaded("assignedReviewer", payload("DRAFT", { amendmentOpen: true, changeNote: "Se agrega IHC." }));
        await waitFor(() => {
            const block = document.querySelector('[data-testid="report-amendment-identification"]');
            expect(block?.textContent).toMatch(/REPORTE ENMENDADO — Enmienda 1/);
            expect(block?.textContent).toMatch(/versión 1/);
            expect(block?.textContent).toMatch(/Se agrega IHC\./);
        });
    });

    it("can be cancelled with a reason and the user's password", async () => {
        await renderLoaded("assignedReviewer", payload("DRAFT", { amendmentOpen: true }));
        const cancel = vi.spyOn(reportService, "cancelReportAmendment").mockResolvedValue({
            id: REPORT_ID, status: "PUBLISHED", message: "Enmienda 1 cancelada.", amendment: { ...OPEN_AMENDMENT, state: "CANCELLED" }, version_no: 1,
        } as never);
        await userEvent.click(screen.getByTestId("cancel-amendment"));
        const dialog = await screen.findByRole("dialog");
        await userEvent.type(within(dialog).getByLabelText("Motivo (obligatorio)"), "Se abrió por error");
        await userEvent.type(within(dialog).getByTestId("password-confirmation-input"), PASSWORD);
        await userEvent.click(within(dialog).getByTestId("password-confirmation-submit"));
        await waitFor(() =>
            expect(cancel).toHaveBeenCalledWith(REPORT_ID, "amendment-1", { reason: "Se abrió por error", password: PASSWORD }),
        );
    });

    it("a pathologist cannot cancel it", async () => {
        await renderLoaded("pathologist", payload("DRAFT", { amendmentOpen: true }));
        expect(screen.queryByTestId("cancel-amendment")).toBeNull();
    });

    it("the author's change note is saved with the content", async () => {
        await renderLoaded("pathologist", payload("DRAFT", { amendmentOpen: true }));
        const save = vi.spyOn(reportService, "saveReportVersion").mockResolvedValue(undefined);
        vi.spyOn(reportService, "getReportFull").mockResolvedValue(payload("DRAFT", { amendmentOpen: true, changeNote: "Se agrega IHC." }) as never);
        await userEvent.type(screen.getByTestId("amendment-change-note"), "Se agrega IHC.");
        await userEvent.click(screen.getByTestId("report-save-top"));
        await waitFor(() => expect(save).toHaveBeenCalled());
        const sent = save.mock.calls[0][0];
        expect(sent.report.amendment?.change_note).toBe("Se agrega IHC.");
        expect(sent.report.amendment?.amendment_no).toBe(1);
    });

    it("cannot be submitted without a stored change note", async () => {
        await renderLoaded("pathologist", payload("DRAFT", { amendmentOpen: true }));
        const submit = vi.spyOn(reportService, "submitReport");
        await userEvent.click(screen.getByText("Enviar a Revisión"));
        expect(submit).not.toHaveBeenCalled();
    });
});
