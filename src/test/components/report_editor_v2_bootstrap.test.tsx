/**
 * Tercera remediación post-Fase 2 — problema F: "nunca caer a Legacy".
 *
 * Con `reports_v2_enabled=true` y una versión clínica válida, el editor debe
 * arrancar SIEMPRE en V2 usando el membrete resuelto, y cuando falte
 * configuración debe mostrar un estado BLOQUEADO explícito. Montar Legacy
 * como sustituto está prohibido: produciría un reporte con un membrete que
 * nadie eligió.
 *
 * Antes había dos caminos que llevaban a Legacy en silencio:
 *   1. un `catch {}` que se tragaba cualquier fallo de red;
 *   2. la cadena listar-membretes -> listar-versiones -> leer-versión, que
 *      si no encontraba el membrete resuelto en la lista dejaba
 *      `selectedLetterheadPresentation` en null, y sin `rendering_snapshot`
 *      el resolver elige el renderer Legacy.
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

const ORDER_ID = "00000000-0000-0000-0000-0000000000aa";
const STUDY_TYPE_ID = "00000000-0000-0000-0000-0000000000bb";
const TEMPLATE_ID = "00000000-0000-0000-0000-0000000000cc";

const PRESENTATION = {
    paper: { size: "LETTER" as const, orientation: "PORTRAIT" as const, margins_cm: { top: 2, right: 2, bottom: 2, left: 2 } },
    header: {
        enabled: true, logo_storage_id: null, institution_name: "Laboratorio Del Membrete",
        subtitle: null, address: null, phone: null, email: null,
    },
    footer: { enabled: true, custom_text: "Pie del membrete", show_page_number: true },
    style: { primary_color: "#336699" },
    signer: null,
};

function withPermission(canManage: boolean) {
    mockedUseUserProfile.mockReturnValue({
        profile: null, loading: false, authStatus: "authenticated", sessionExpired: false,
        error: null, canManageUsers: false, canManageBranches: false, canManageCatalog: false,
        canManageTenant: false, hasPermission: () => canManage, hasRole: () => false,
    } as unknown as ReturnType<typeof useUserProfile>);
}

/** El editor lee la orden y el flag del tenant con su propio `getJSON`
 *  interno (fetch directo), así que se intercepta a nivel de `fetch`. */
function mockFetch(opts: { v2Enabled: boolean; tenantFetchFails?: boolean }) {
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
        if (url.includes("/tenants/")) {
            if (opts.tenantFetchFails) return Promise.reject(new Error("network down"));
            return json({ reports_v2_enabled: opts.v2Enabled });
        }
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
    vi.spyOn(reportService, "getReportTemplateVersion").mockResolvedValue({
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

beforeEach(() => {
    withPermission(true);
    localStorage.setItem("tenant_id", "t1");
    localStorage.setItem("branch_id", "b1");
});

afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
});

describe("ReportEditor — arranque V2 (problema F)", () => {
    it("usa el membrete predeterminado del tenant cuando la plantilla no tiene preferencia", async () => {
        mockFetch({ v2Enabled: true });
        mockStudyTypeAndTemplate();
        mockDefaults();
        vi.spyOn(letterheadService, "listReportLetterheads").mockResolvedValue({ letterheads: [] });

        renderEditor();

        // La marca del MEMBRETE aparece en la previsualización — prueba de
        // que se montó V2 con la presentación resuelta, no Legacy.
        await waitFor(() => {
            expect(document.body.textContent).toContain("Laboratorio Del Membrete");
        });
        expect(screen.getByTestId("letterhead-resolution-source").textContent)
            .toContain("Predeterminado del laboratorio");
    });

    /**
     * Regresión encontrada en la verificación manual en navegador (no en
     * las pruebas): `buildEnvelope()` heredaba `resolved_resources` solo de
     * `envelope`, que para un reporte NUEVO es null. El membrete tenía sus
     * logos bien configurados y el editor los conocía, pero el preview
     * recibía el sobre sin URLs y el renderer dibujaba el logo neutral.
     */
    it("pasa al preview las URLs de logo del membrete resuelto en un reporte nuevo", async () => {
        mockFetch({ v2Enabled: true });
        mockStudyTypeAndTemplate();
        mockDefaults({
            letterhead_resolved_resources: {
                header_logo_url: "https://cdn.example/membrete-header.png",
                footer_logo_url: "https://cdn.example/membrete-footer.png",
            },
        });
        vi.spyOn(letterheadService, "listReportLetterheads").mockResolvedValue({ letterheads: [] });

        renderEditor();

        await waitFor(() => {
            const srcs = Array.from(document.querySelectorAll("img")).map((i) => i.getAttribute("src"));
            expect(srcs).toContain("https://cdn.example/membrete-header.png");
            expect(srcs).toContain("https://cdn.example/membrete-footer.png");
        });
    });

    it("muestra la fuente «Configurado en esta plantilla» cuando gana la preferencia de plantilla", async () => {
        mockFetch({ v2Enabled: true });
        mockStudyTypeAndTemplate();
        mockDefaults({ letterhead_resolution_source: "TEMPLATE_PREFERRED" });
        vi.spyOn(letterheadService, "listReportLetterheads").mockResolvedValue({ letterheads: [] });

        renderEditor();

        await waitFor(() => {
            expect(screen.getByTestId("letterhead-resolution-source").textContent)
                .toContain("Configurado en esta plantilla");
        });
    });

    it("bloquea explícitamente (nunca Legacy) cuando no hay membrete resoluble", async () => {
        mockFetch({ v2Enabled: true });
        mockStudyTypeAndTemplate();
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
            expect(screen.getByText(/Falta el membrete predeterminado del laboratorio/i)).toBeTruthy();
        });
        expect(screen.getByRole("button", { name: /Ir a Membretes/i })).toBeTruthy();
        // Ni rastro del membrete legado embajador: no se montó Legacy.
        expect(document.body.textContent).not.toMatch(/villanueva/i);
    });

    it("bloquea con el motivo correcto cuando la plantilla no tiene versión activa", async () => {
        mockFetch({ v2Enabled: true });
        mockStudyTypeAndTemplate();
        mockDefaults({
            active_template_version_id: null,
            letterhead_presentation: null,
            v2_blocked_reason: "NO_ACTIVE_TEMPLATE_VERSION",
        });

        renderEditor();

        await waitFor(() => {
            expect(screen.getByText(/La plantilla de este estudio no está publicada/i)).toBeTruthy();
        });
    });

    it("bloquea cuando la configuración de membretes es inconsistente, con el detalle del backend", async () => {
        mockFetch({ v2Enabled: true });
        mockStudyTypeAndTemplate();
        mockDefaults({
            letterhead_version_id: null,
            letterhead_presentation: null,
            v2_blocked_reason: "LETTERHEAD_MISCONFIGURED",
            v2_blocked_detail: "El membrete «X» tiene 2 versiones activas a la vez.",
        });

        renderEditor();

        await waitFor(() => {
            expect(screen.getByText(/La configuración de membretes es inconsistente/i)).toBeTruthy();
        });
        expect(document.body.textContent).toContain("2 versiones activas");
    });

    it("bloquea, en vez de caer a Legacy, si falla la consulta de configuración", async () => {
        mockFetch({ v2Enabled: true });
        mockStudyTypeAndTemplate();
        vi.spyOn(reportService, "getStudyTypeReportDefaults").mockRejectedValue(
            new Error("network down")
        );

        renderEditor();

        await waitFor(() => {
            expect(screen.getByText(/Falta el membrete predeterminado del laboratorio/i)).toBeTruthy();
        });
        expect(document.body.textContent).toMatch(/No se pudo consultar la configuración de reportes V2/i);
    });

    it("no bloquea a un tenant Legacy (reports_v2_enabled=false)", async () => {
        mockFetch({ v2Enabled: false });
        mockStudyTypeAndTemplate();
        const defaultsSpy = mockDefaults();

        renderEditor();

        await waitFor(() => {
            expect(screen.queryByText(/Falta el membrete predeterminado/i)).toBeNull();
        });
        // Un tenant Legacy ni siquiera consulta la configuración V2.
        expect(defaultsSpy).not.toHaveBeenCalled();
    });
});
