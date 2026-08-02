/**
 * Smoke tests for the letterheads admin list page — post-Fase-2
 * remediation, R8/R16: empty state, loaded state with the "Predeterminado"
 * badge, and read-only permission gating.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import ReportLetterheads from "../../pages/report_letterheads";
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

function renderPage() {
    return render(
        <MemoryRouter initialEntries={["/config/report-letterheads"]}>
            <ReportLetterheads embedded />
        </MemoryRouter>
    );
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("ReportLetterheads — empty state", () => {
    it("shows an empty-state message when the tenant has no letterheads", async () => {
        withPermission(true);
        vi.spyOn(letterheadService, "listReportLetterheads").mockResolvedValue({ letterheads: [] });

        renderPage();

        await waitFor(() => {
            expect(screen.getByText(/aún no hay membretes/i)).toBeTruthy();
        });
    });
});

describe("ReportLetterheads — loaded state", () => {
    it("renders a letterhead row with the Predeterminado badge", async () => {
        withPermission(true);
        vi.spyOn(letterheadService, "listReportLetterheads").mockResolvedValue({
            letterheads: [
                {
                    id: "lh1", tenant_id: "t1", name: "Membrete General",
                    description: "Uso general", is_default: true, is_active: true,
                    created_at: "2026-01-01",
                },
            ],
        });

        renderPage();

        await waitFor(() => {
            expect(screen.getByText("Membrete General")).toBeTruthy();
            expect(screen.getByText("Predeterminado")).toBeTruthy();
        });
    });
});

describe("ReportLetterheads — read-only gating", () => {
    it("disables mutating actions without reports:manage_templates", async () => {
        withPermission(false);
        vi.spyOn(letterheadService, "listReportLetterheads").mockResolvedValue({ letterheads: [] });

        renderPage();

        await waitFor(() => {
            expect(screen.getByText(/solo lectura/i)).toBeTruthy();
        });
        const newButton = screen.getByRole("button", { name: /nuevo membrete/i });
        expect(newButton).toBeDisabled();
    });
});

/**
 * Tercera remediación post-Fase 2 — problema D: hasta ahora la única acción
 * era "Eliminar", que en realidad desactivaba, y el borrado real estaba
 * bloqueado para cualquier membrete con versiones (es decir, para todos).
 * El menú ahora distingue "Eliminar" (solo cuando el backend ya confirmó
 * que es seguro) de "Desactivar"/"Reactivar".
 */
async function openActionsMenu() {
    await userEvent.click(screen.getByRole("button", { name: /Más acciones/i }));
}

describe("ReportLetterheads — eliminar vs desactivar", () => {
    const baseRow = {
        id: "lh1", tenant_id: "t1", name: "Membrete General",
        description: null, is_default: false, is_active: true,
        created_at: "2026-01-01", has_active_version: true,
    };

    it("ofrece «Eliminar» cuando el membrete no tiene referencias", async () => {
        withPermission(true);
        vi.spyOn(letterheadService, "listReportLetterheads").mockResolvedValue({
            letterheads: [{ ...baseRow, can_hard_delete: true, blocking_references: [] }],
        });

        renderPage();
        await waitFor(() => expect(screen.getByText("Membrete General")).toBeTruthy());
        await openActionsMenu();

        await waitFor(() => {
            expect(screen.getByText("Eliminar")).toBeTruthy();
            expect(screen.getByText("Desactivar")).toBeTruthy();
        });
    });

    it("oculta «Eliminar» cuando algo referencia al membrete", async () => {
        withPermission(true);
        vi.spyOn(letterheadService, "listReportLetterheads").mockResolvedValue({
            letterheads: [{
                ...baseRow,
                can_hard_delete: false,
                blocking_references: ["lo usan 3 reporte(s) ya creados"],
            }],
        });

        renderPage();
        await waitFor(() => expect(screen.getByText("Membrete General")).toBeTruthy());
        await openActionsMenu();

        await waitFor(() => expect(screen.getByText("Desactivar")).toBeTruthy());
        // La acción destructiva no se ofrece siquiera: el backend la
        // rechazaría con 409, así que enseñarla solo produce clics fallidos.
        expect(screen.queryByText("Eliminar")).toBeNull();
    });

    it("no deja desactivar el membrete predeterminado", async () => {
        withPermission(true);
        vi.spyOn(letterheadService, "listReportLetterheads").mockResolvedValue({
            letterheads: [{
                ...baseRow, is_default: true, can_hard_delete: false,
                blocking_references: ["es el membrete predeterminado del laboratorio"],
            }],
        });

        renderPage();
        await waitFor(() => expect(screen.getByText("Membrete General")).toBeTruthy());
        await openActionsMenu();

        await waitFor(() => {
            const item = screen.getByText("Desactivar").closest("li");
            expect(item?.className).toContain("disabled");
        });
    });

    it("ofrece «Reactivar» en un membrete desactivado", async () => {
        withPermission(true);
        vi.spyOn(letterheadService, "listReportLetterheads").mockResolvedValue({
            letterheads: [{
                ...baseRow, is_active: false, can_hard_delete: true, blocking_references: [],
            }],
        });

        renderPage();
        await waitFor(() => expect(screen.getByText("Membrete General")).toBeTruthy());
        await openActionsMenu();

        await waitFor(() => expect(screen.getByText("Reactivar")).toBeTruthy());
        expect(screen.queryByText("Desactivar")).toBeNull();
    });

    it("no deja marcar como predeterminado un membrete sin configuración guardada", async () => {
        withPermission(true);
        vi.spyOn(letterheadService, "listReportLetterheads").mockResolvedValue({
            letterheads: [{
                ...baseRow, has_active_version: false, can_hard_delete: true,
                blocking_references: [],
            }],
        });

        renderPage();
        await waitFor(() => expect(screen.getByText("Membrete General")).toBeTruthy());
        await openActionsMenu();

        await waitFor(() => {
            const item = screen.getByText("Marcar como predeterminado").closest("li");
            expect(item?.className).toContain("disabled");
        });
    });

    it("lista también los membretes desactivados (si no, «Reactivar» sería inalcanzable)", async () => {
        withPermission(true);
        const listSpy = vi.spyOn(letterheadService, "listReportLetterheads").mockResolvedValue({
            letterheads: [],
        });

        renderPage();
        await waitFor(() => expect(listSpy).toHaveBeenCalled());
        expect(listSpy).toHaveBeenCalledWith(false);
    });
});

/**
 * Regresión concreta del problema D encontrada en la verificación manual:
 * la confirmación usaba la API estática `Modal.confirm` de antd v5, que en
 * React 19 (la versión de este proyecto) no monta nada. El clic en
 * "Eliminar" no abría diálogo ni llamaba al backend — "la UI no permite
 * eliminar membretes" pese a existir el endpoint. Estas pruebas afirman
 * sobre el diálogo REAL y sobre la llamada al servicio.
 */
describe("ReportLetterheads — la confirmación se monta y ejecuta de verdad", () => {
    const deletableRow = {
        id: "lh1", tenant_id: "t1", name: "Membrete Borrable",
        description: null, is_default: false, is_active: true,
        created_at: "2026-01-01", has_active_version: true,
        can_hard_delete: true, blocking_references: [] as string[],
    };

    it("abre el diálogo y elimina de verdad (hard_delete=true)", async () => {
        withPermission(true);
        vi.spyOn(letterheadService, "listReportLetterheads").mockResolvedValue({
            letterheads: [deletableRow],
        });
        const deleteSpy = vi
            .spyOn(letterheadService, "deleteReportLetterhead")
            .mockResolvedValue(undefined);

        renderPage();
        await waitFor(() => expect(screen.getByText("Membrete Borrable")).toBeTruthy());
        await openActionsMenu();
        await userEvent.click(await screen.findByText("Eliminar"));

        // El diálogo tiene que existir realmente en el DOM.
        await waitFor(() => expect(screen.getByText(/no se puede deshacer/i)).toBeTruthy());
        await userEvent.click(screen.getByRole("button", { name: /Sí, eliminar/i }));

        await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith("lh1", true));
    });

    it("desactiva con hard_delete=false y explica qué lo bloquea", async () => {
        withPermission(true);
        vi.spyOn(letterheadService, "listReportLetterheads").mockResolvedValue({
            letterheads: [{
                ...deletableRow,
                can_hard_delete: false,
                blocking_references: ["lo usan 2 reporte(s) ya creados"],
            }],
        });
        const deleteSpy = vi
            .spyOn(letterheadService, "deleteReportLetterhead")
            .mockResolvedValue(undefined);

        renderPage();
        await waitFor(() => expect(screen.getByText("Membrete Borrable")).toBeTruthy());
        await openActionsMenu();
        await userEvent.click(await screen.findByText("Desactivar"));

        await waitFor(() =>
            expect(screen.getByText(/lo usan 2 reporte\(s\) ya creados/i)).toBeTruthy()
        );
        await userEvent.click(screen.getByRole("button", { name: /Sí, desactivar/i }));

        await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith("lh1", false));
    });
});
