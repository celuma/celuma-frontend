/**
 * Fourth post-Phase 2 remediation (Observation 2) — the description of a
 * letterhead must be able to remain empty.
 *
 * The root cause lived in two places at the same time, and that is why there are tests of the
 * two: the backend interpreted `null` as "do not touch", and the frontend neither
 * it didn't even send the field (`description || undefined`). These tests
 * cover half of frontend: what payload outputs from the form.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import ReportLetterheads from "../../pages/report_letterheads";
import * as letterheadService from "../../services/report_letterhead_service";
import { useUserProfile } from "../../hooks/use_user_profile";
import { normalizeLetterheadDescription } from "../../models/report_letterhead";
import type { ReportLetterheadSummary } from "../../models/report_letterhead";

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

function renderPage() {
    return render(
        <MemoryRouter initialEntries={["/config/report-letterheads"]}>
            <ReportLetterheads embedded />
        </MemoryRouter>
    );
}

function letterhead(overrides: Partial<ReportLetterheadSummary> = {}): ReportLetterheadSummary {
    return {
        id: "lh1",
        tenant_id: "t1",
        name: "Membrete con descripción",
        description: "Texto que el usuario quiere borrar",
        is_default: false,
        is_active: true,
        created_at: "2026-01-01T00:00:00Z",
        has_active_version: true,
        can_hard_delete: false,
        blocking_references: [],
        ...overrides,
    };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("normalizeLetterheadDescription", () => {
    it("converts empty, spaces, null and undefined to null", () => {
        expect(normalizeLetterheadDescription("")).toBeNull();
        expect(normalizeLetterheadDescription("   ")).toBeNull();
        expect(normalizeLetterheadDescription("\n\t ")).toBeNull();
        expect(normalizeLetterheadDescription(null)).toBeNull();
        expect(normalizeLetterheadDescription(undefined)).toBeNull();
    });

    it("crop but preserve the real text", () => {
        expect(normalizeLetterheadDescription("  Texto  ")).toBe("Texto");
        expect(normalizeLetterheadDescription("Texto")).toBe("Texto");
    });

    it("never returns undefined — undefined would mean \"field omitted\"", () => {
        // This is literally the bug: `description || undefined` made
        // JSON.stringify omits the key and the backend retains the previous
        // value.
        for (const input of ["", "   ", null, undefined, "algo"]) {
            expect(normalizeLetterheadDescription(input)).not.toBeUndefined();
        }
    });
});

describe("ReportLetterheads — create with empty description", () => {
    it("sends description: null when field is left blank", async () => {
        withPermission(true);
        vi.spyOn(letterheadService, "listReportLetterheads").mockResolvedValue({ letterheads: [] });
        const createSpy = vi
            .spyOn(letterheadService, "createReportLetterhead")
            .mockResolvedValue(letterhead({ id: "nuevo", description: null }));

        renderPage();
        await waitFor(() => expect(screen.getByText(/aún no hay membretes/i)).toBeTruthy());

        await userEvent.click(screen.getByRole("button", { name: /Nuevo membrete/i }));
        await userEvent.type(screen.getByLabelText(/Nombre/i), "Sin descripción");
        await userEvent.click(screen.getByRole("button", { name: /Crear y continuar/i }));

        await waitFor(() => expect(createSpy).toHaveBeenCalledTimes(1));
        expect(createSpy.mock.calls[0][0]).toEqual({
            name: "Sin descripción",
            description: null,
        });
    });

    it("sends the description clipped when there is text", async () => {
        withPermission(true);
        vi.spyOn(letterheadService, "listReportLetterheads").mockResolvedValue({ letterheads: [] });
        const createSpy = vi
            .spyOn(letterheadService, "createReportLetterhead")
            .mockResolvedValue(letterhead({ id: "nuevo" }));

        renderPage();
        await waitFor(() => expect(screen.getByText(/aún no hay membretes/i)).toBeTruthy());

        await userEvent.click(screen.getByRole("button", { name: /Nuevo membrete/i }));
        await userEvent.type(screen.getByLabelText(/Nombre/i), "Con descripción");
        await userEvent.type(screen.getByPlaceholderText(/Descripción \(opcional\)/i), "  Un texto  ");
        await userEvent.click(screen.getByRole("button", { name: /Crear y continuar/i }));

        await waitFor(() => expect(createSpy).toHaveBeenCalledTimes(1));
        expect(createSpy.mock.calls[0][0].description).toBe("Un texto");
    });
});

describe("ReportLetterheads — clean up existing description", () => {
    /** "Rename" edits name AND description; lives in the actions menu. */
    async function openEditModal() {
        renderPage();
        await waitFor(() => expect(screen.getByText("Membrete con descripción")).toBeTruthy());
        await userEvent.click(screen.getByRole("button", { name: /Más acciones/i }));
        await userEvent.click(await screen.findByText("Renombrar"));
        await waitFor(() =>
            expect(screen.getByPlaceholderText(/Descripción \(opcional\)/i)).toBeTruthy(),
        );
    }

    it("rehydrates the textarea with the saved description", async () => {
        withPermission(true);
        vi.spyOn(letterheadService, "listReportLetterheads").mockResolvedValue({
            letterheads: [letterhead()],
        });

        await openEditModal();
        const textarea = screen.getByPlaceholderText(/Descripción \(opcional\)/i) as HTMLTextAreaElement;
        expect(textarea.value).toBe("Texto que el usuario quiere borrar");
    });

    it("sends description: null when clearing the field (the reported bug)", async () => {
        withPermission(true);
        vi.spyOn(letterheadService, "listReportLetterheads").mockResolvedValue({
            letterheads: [letterhead()],
        });
        const updateSpy = vi
            .spyOn(letterheadService, "updateReportLetterhead")
            .mockResolvedValue(letterhead({ description: null }));

        await openEditModal();
        const textarea = screen.getByPlaceholderText(/Descripción \(opcional\)/i);
        await userEvent.clear(textarea);
        await userEvent.click(screen.getByRole("button", { name: /^Guardar$/i }));

        await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
        const payload = updateSpy.mock.calls[0][1];
        expect(payload.description).toBeNull();
        // The distinction that matters: `null` clean; `undefined` would have
        // left the previous text intact, which is the reported symptom.
        expect("description" in payload).toBe(true);
    });

    it("sends description: null when the field becomes whitespace-only", async () => {
        withPermission(true);
        vi.spyOn(letterheadService, "listReportLetterheads").mockResolvedValue({
            letterheads: [letterhead()],
        });
        const updateSpy = vi
            .spyOn(letterheadService, "updateReportLetterhead")
            .mockResolvedValue(letterhead({ description: null }));

        await openEditModal();
        const textarea = screen.getByPlaceholderText(/Descripción \(opcional\)/i);
        await userEvent.clear(textarea);
        await userEvent.type(textarea, "   ");
        await userEvent.click(screen.getByRole("button", { name: /^Guardar$/i }));

        await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
        expect(updateSpy.mock.calls[0][1].description).toBeNull();
    });

    it("the description accepts textarea stay empty (it is not a field required)", async () => {
        withPermission(true);
        vi.spyOn(letterheadService, "listReportLetterheads").mockResolvedValue({
            letterheads: [letterhead()],
        });

        await openEditModal();
        const textarea = screen.getByPlaceholderText(/Descripción \(opcional\)/i) as HTMLTextAreaElement;
        await userEvent.clear(textarea);
        expect(textarea.value).toBe("");
        expect(textarea.required).toBe(false);
    });
});
