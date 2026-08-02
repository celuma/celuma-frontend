/**
 * Cuarta remediación post-Fase 2 (Observación 2) — la descripción de un
 * membrete debe poder quedar vacía.
 *
 * La causa raíz vivía en DOS sitios a la vez, y por eso hay pruebas de los
 * dos: el backend interpretaba `null` como "no tocar", y el frontend ni
 * siquiera enviaba el campo (`description || undefined`). Estas pruebas
 * cubren la mitad de frontend: qué payload sale del formulario.
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
    it("convierte vacío, espacios, null y undefined en null", () => {
        expect(normalizeLetterheadDescription("")).toBeNull();
        expect(normalizeLetterheadDescription("   ")).toBeNull();
        expect(normalizeLetterheadDescription("\n\t ")).toBeNull();
        expect(normalizeLetterheadDescription(null)).toBeNull();
        expect(normalizeLetterheadDescription(undefined)).toBeNull();
    });

    it("recorta pero conserva el texto real", () => {
        expect(normalizeLetterheadDescription("  Texto  ")).toBe("Texto");
        expect(normalizeLetterheadDescription("Texto")).toBe("Texto");
    });

    it("nunca devuelve undefined — undefined significaría \"campo omitido\"", () => {
        // Éste es literalmente el bug: `description || undefined` hacía que
        // JSON.stringify omitiera la clave y el backend conservara el valor
        // anterior para siempre.
        for (const input of ["", "   ", null, undefined, "algo"]) {
            expect(normalizeLetterheadDescription(input)).not.toBeUndefined();
        }
    });
});

describe("ReportLetterheads — crear con descripción vacía", () => {
    it("envía description: null cuando el campo se deja en blanco", async () => {
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

    it("envía la descripción recortada cuando sí hay texto", async () => {
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

describe("ReportLetterheads — limpiar una descripción existente", () => {
    /** "Renombrar" edita nombre Y descripción; vive en el menú de acciones. */
    async function openEditModal() {
        renderPage();
        await waitFor(() => expect(screen.getByText("Membrete con descripción")).toBeTruthy());
        await userEvent.click(screen.getByRole("button", { name: /Más acciones/i }));
        await userEvent.click(await screen.findByText("Renombrar"));
        await waitFor(() =>
            expect(screen.getByPlaceholderText(/Descripción \(opcional\)/i)).toBeTruthy(),
        );
    }

    it("rehidrata el textarea con la descripción guardada", async () => {
        withPermission(true);
        vi.spyOn(letterheadService, "listReportLetterheads").mockResolvedValue({
            letterheads: [letterhead()],
        });

        await openEditModal();
        const textarea = screen.getByPlaceholderText(/Descripción \(opcional\)/i) as HTMLTextAreaElement;
        expect(textarea.value).toBe("Texto que el usuario quiere borrar");
    });

    it("envía description: null al vaciar el campo (el bug reportado)", async () => {
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
        // La distinción que importa: `null` limpia; `undefined` habría
        // dejado el texto anterior intacto, que es el síntoma reportado.
        expect("description" in payload).toBe(true);
    });

    it("envía description: null cuando el campo queda con solo espacios", async () => {
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

    it("el textarea de descripción acepta quedarse vacío (no es un campo requerido)", async () => {
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
