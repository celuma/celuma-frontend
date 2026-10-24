/**
 * Céluma 1.4 (#29) — report-editor spelling assistance: who gets it, what it
 * covers, and that it never changes content by itself.
 *
 * The real engine and es-MX dictionary answer through an in-process worker
 * (jsdom has no Worker). jsdom cannot prove geometry, caret, native undo or
 * Quill history; tests-visual/report_spelling.functional.spec.ts does that in
 * a real browser. Synthetic data only.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ReportEditor from "../../components/report/report_editor";
import * as reportService from "../../services/report_service";
import * as letterheadService from "../../services/report_letterhead_service";
import { useUserProfile } from "../../hooks/use_user_profile";
import type { ReportStatus } from "../../models/report";
import type { SpellingClient } from "../../lib/spelling/client";
import { realEngine } from "../lib/spelling_fixtures";
import { spellingArtifacts } from "../fixtures/spelling_artifacts";

const spelling = vi.hoisted(() => ({ workerStarts: 0, client: null as SpellingClient | null, failing: false, engineBroken: false }));

vi.mock("../../hooks/use_user_profile");
vi.mock("../../lib/spelling/client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../lib/spelling/client")>();
    const { inProcessWorker, realEngine } = await import("../lib/spelling_fixtures");
    // The real engine, except that it throws while `engineBroken` is set (a failure after start-up).
    const breakable = () => {
        const real = realEngine();
        return {
            isCorrect: (w: string) => {
                if (spelling.engineBroken) throw new Error("synthetic engine failure");
                return real.isCorrect(w);
            },
            suggest: real.suggest,
        };
    };
    return {
        ...actual,
        getSpellingClient: () => {
            spelling.client ??= actual.createSpellingClient(() => {
                spelling.workerStarts += 1;
                return spelling.failing
                    ? inProcessWorker({ loadDictionary: async () => { throw new Error("asset missing"); } })
                    : inProcessWorker({ createEngine: breakable });
            });
            return spelling.client;
        },
    };
});
const mockedUseUserProfile = vi.mocked(useUserProfile);

const REPORT_ID = "00000000-0000-0000-0000-00000000sp01";
const ORDER_ID = "00000000-0000-0000-0000-00000000sp0a";
const USER_ID = "00000000-0000-0000-0000-00000000spu1";

const CONTENT = {
    base: {
        order_code: { is_visible: true, label: "Código de orden", value: "ORD-1" },
        // A template-defined text base field: its semantics are unknown (could be a name/ID).
        campo_libre: { is_visible: true, label: "Referencia", type: "text", is_custom: true, value: "Pacietne Zuloaga" },
    },
    sections: {
        diagnostico: { is_visible: true, label: "Diagnóstico", type: "richtext", content: "<p>Biopsia de pacietne con CU011026 y Ki67.</p>" },
        notas: { is_visible: true, label: "Notas", type: "text", content: "Sin hallasgos adicionales." },
    },
    base_order: ["order_code", "campo_libre"],
    section_order: ["diagnostico", "notas"],
};

function asUser(permissions: string[], { reviewer = false } = {}) {
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
        hasRole: (r: string) => (reviewer ? r === "reviewer" : r === "pathologist"),
        canActAsReviewer: (capability: string) => reviewer && permissions.includes(capability),
        isAssignedReviewer: () => reviewer,
        canReopenApprovedReport: () => false,
    } as unknown as ReturnType<typeof useUserProfile>);
}
const AUTHOR = ["reports:read", "reports:create", "reports:edit", "reports:submit", "lab:read"];

function mockReport(status: ReportStatus, { schemaVersion = 2, title = "Reporte de pacietne", reportId = REPORT_ID } = {}) {
    return vi.spyOn(reportService, "getReportFull").mockImplementation(async (id: string) => ({
        order: {
            id: ORDER_ID, order_code: "ORD-1", status: "IN_PROGRESS", patient_id: "p1", tenant_id: "t1", branch_id: "b1",
            reviewers: [{ id: USER_ID, name: "Dra. Revisora", email: "r@lab.test", status: "pending" }],
        },
        patient: { id: "p1", tenant_id: "t1", branch_id: "b1", patient_code: "PAT-1" },
        samples: [],
        report: {
            id: id ?? reportId, order_id: ORDER_ID, tenant_id: "t1", branch_id: "b1", created_by: USER_ID, version_no: 1,
            status, schema_version: schemaVersion, title, published_at: null, signed_by: null, signed_at: null,
            template: { base: CONTENT.base, sections: CONTENT.sections, base_order: CONTENT.base_order, section_order: CONTENT.section_order },
            report: schemaVersion === 2 ? { ...CONTENT, schema_version: 2 } : CONTENT,
        },
    }) as never);
}

function renderEditor(path = `/reports/${REPORT_ID}`) {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <Routes><Route path="/reports/:reportId" element={<ReportEditor />} /></Routes>
        </MemoryRouter>,
    );
}

const titleInput = () => screen.getByLabelText("Nombre del reporte") as HTMLInputElement;

/**
 * jsdom has no editing commands. This stands in for a browser's undoable
 * `insertText` on the focused input/textarea (replace the selection, fire
 * input); the real command is exercised in tests-visual.
 */
function emulateBrowserInsertText(result: "native" | "fails" = "native") {
    Object.defineProperty(document, "execCommand", {
        configurable: true,
        writable: true,
        value: vi.fn((command: string, _ui: boolean, value?: string) => {
            if (result === "fails" || command !== "insertText") return false;
            const el = document.activeElement as HTMLInputElement | HTMLTextAreaElement;
            el.setRangeText(value ?? "", el.selectionStart ?? 0, el.selectionEnd ?? 0, "end");
            el.dispatchEvent(new Event("input", { bubbles: true }));
            return true;
        }),
    });
}
/** The in-process engine answers asynchronously; leave room beyond Testing Library's 1 s default. */
const SLOW = { timeout: 5000 };

// Building the real engine takes about a second; do it once, outside any test's timing.
beforeAll(() => {
    realEngine();
});

beforeEach(() => {
    spelling.workerStarts = 0;
    spelling.client = null;
    spelling.failing = false;
    spelling.engineBroken = false;
    localStorage.setItem("tenant_id", "t1");
    localStorage.setItem("branch_id", "b1");
    vi.spyOn(letterheadService, "listReportLetterheads").mockResolvedValue({ letterheads: [] });
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
        const body = String(input).includes("/tenants/") ? { reports_v2_enabled: true } : {};
        return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(body)), json: () => Promise.resolve(body) } as Response);
    });
});
afterEach(() => {
    delete (document as unknown as { execCommand?: unknown }).execCommand;
    spelling.client?.shutdown();
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
});

describe("ReportEditor — spelling assistance (#29)", () => {
    it("checks the editable title and narrative sections, never the custom base field, with native checking off", async () => {
        asUser(AUTHOR);
        mockReport("DRAFT");
        renderEditor();
        await waitFor(() => expect(screen.getByTestId("spelling-summary-title")).toHaveTextContent("1 posible error ortográfico"), SLOW);
        await waitFor(() => expect(screen.getByTestId("spelling-summary-section:notas")).toHaveTextContent("1 posible error ortográfico"), SLOW);
        // Rich text: "pacietne" only — CU011026 and Ki67 are skipped as whole codes.
        await waitFor(() => expect(screen.getByTestId("spelling-summary-section:diagnostico")).toHaveTextContent("1 posible error ortográfico"), SLOW);

        expect(titleInput()).toHaveAttribute("spellcheck", "false");
        expect(screen.getByDisplayValue("Sin hallasgos adicionales.")).toHaveAttribute("spellcheck", "false");
        expect(document.querySelector(".ql-editor")).toHaveAttribute("spellcheck", "false");

        // The custom text base field is untouched: no checker, no attribute change.
        const custom = screen.getByDisplayValue("Pacietne Zuloaga");
        expect(custom).not.toHaveAttribute("spellcheck");
        expect(screen.queryByTestId("spelling-summary-campo_libre")).toBeNull();

        expect(spelling.workerStarts).toBe(1);
        // Marks never enter the stored rich-text HTML.
        expect(document.querySelector(".ql-editor")!.innerHTML).toBe("<p>Biopsia de pacietne con CU011026 y Ki67.</p>");
    });

    it("applies a suggestion only when chosen, through the field's own onChange", async () => {
        emulateBrowserInsertText();
        asUser(AUTHOR);
        mockReport("DRAFT");
        renderEditor();
        const summary = await screen.findByTestId("spelling-summary-title", {}, SLOW);
        expect(titleInput().value).toBe("Reporte de pacietne");

        fireEvent.click(within(summary).getByRole("button", { name: /Revisar ortografía/ }));
        const dialog = await screen.findByRole("dialog", { name: "Ortografía · Nombre del reporte" });
        // Opening the dialog changes nothing.
        expect(titleInput().value).toBe("Reporte de pacietne");
        const option = await within(dialog).findByRole("button", { name: "Reemplazar por paciente" }, SLOW);
        fireEvent.click(option);

        await waitFor(() => expect(titleInput().value).toBe("Reporte de paciente"));
        await waitFor(() => expect(screen.queryByTestId("spelling-summary-title")).toBeNull(), SLOW);
        expect(screen.getByTestId("spelling-announcer")).toBeInTheDocument();
    });

    it("refuses visibly when the browser cannot apply an undoable edit, and saves the original text", async () => {
        emulateBrowserInsertText("fails");
        asUser(AUTHOR);
        mockReport("DRAFT");
        const save = vi.spyOn(reportService, "saveReportVersion").mockResolvedValue(undefined);
        renderEditor();
        const summary = await screen.findByTestId("spelling-summary-title", {}, SLOW);
        fireEvent.click(within(summary).getByRole("button", { name: /Revisar ortografía/ }));
        const dialog = await screen.findByRole("dialog", { name: "Ortografía · Nombre del reporte" });
        fireEvent.click(await within(dialog).findByRole("button", { name: "Reemplazar por paciente" }, SLOW));

        // Not applied, not hidden: the dialog stays with an alert, and the field is unchanged.
        expect(await within(dialog).findByRole("alert")).toHaveTextContent("no se cambió nada");
        expect(screen.getByRole("dialog")).toBe(dialog);
        expect(titleInput().value).toBe("Reporte de pacietne");
        expect(screen.getByTestId("spelling-summary-title")).toHaveTextContent("1 posible error ortográfico");

        fireEvent.click(within(dialog).getByRole("button", { name: "Cerrar sugerencias" }));
        fireEvent.click(screen.getByTestId("report-save-bottom"));
        await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
        expect(save.mock.calls[0][0].title).toBe("Reporte de pacietne");
    });

    it("ignore and dismiss never edit content; ignore covers every field of this report", async () => {
        asUser(AUTHOR);
        mockReport("DRAFT", { title: "Hallasgos" });
        renderEditor();
        const summary = await screen.findByTestId("spelling-summary-title", {}, SLOW);
        await screen.findByTestId("spelling-summary-section:notas", {}, SLOW);

        fireEvent.click(within(summary).getByRole("button", { name: /Revisar ortografía/ }));
        let dialog = await screen.findByRole("dialog");
        fireEvent.click(within(dialog).getByRole("button", { name: "Cerrar sugerencias" }));
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        expect(titleInput().value).toBe("Hallasgos");

        fireEvent.click(within(screen.getByTestId("spelling-summary-title")).getByRole("button", { name: /Revisar ortografía/ }));
        dialog = await screen.findByRole("dialog");
        fireEvent.click(within(dialog).getByRole("button", { name: "Ignorar en este reporte" }));
        // Case-insensitive: "hallasgos" in the Notas section is ignored too.
        await waitFor(() => expect(screen.queryByTestId("spelling-summary-title")).toBeNull(), SLOW);
        await waitFor(() => expect(screen.queryByTestId("spelling-summary-section:notas")).toBeNull(), SLOW);
        expect(titleInput().value).toBe("Hallasgos");
        expect(screen.getByDisplayValue("Sin hallasgos adicionales.")).toBeInTheDocument();
    });

    it.each<ReportStatus>(["IN_REVIEW", "APPROVED", "PUBLISHED", "RETRACTED"])(
        "offers nothing and starts no worker when the report is %s",
        async (status) => {
            asUser(AUTHOR);
            mockReport(status);
            renderEditor();
            await waitFor(() => expect(titleInput().value).toBe("Reporte de pacietne"));
            await new Promise((r) => setTimeout(r, 400));
            expect(screen.queryByTestId(/^spelling-summary-/)).toBeNull();
            expect(screen.queryByRole("dialog")).toBeNull();
            expect(spelling.workerStarts).toBe(0);
        },
    );

    it("gives a presentation-only reviewer no content assistance in DRAFT", async () => {
        asUser(["reports:read", "reports:approve", "reports:sign", "lab:read"], { reviewer: true });
        mockReport("DRAFT");
        renderEditor();
        await waitFor(() => expect(titleInput().value).toBe("Reporte de pacietne"));
        await new Promise((r) => setTimeout(r, 400));
        expect(screen.queryByTestId(/^spelling-summary-/)).toBeNull();
        expect(spelling.workerStarts).toBe(0);
    });

    it("keeps editing and saving available when the checker cannot start, without a fallback", async () => {
        spelling.failing = true;
        asUser(AUTHOR);
        mockReport("DRAFT");
        const save = vi.spyOn(reportService, "saveReportVersion").mockResolvedValue(undefined);
        renderEditor();
        await screen.findByTestId("spelling-unavailable", {}, SLOW);
        expect(screen.getByTestId("spelling-unavailable")).toHaveTextContent("Puedes seguir editando y guardando");
        expect(titleInput()).toHaveAttribute("spellcheck", "false");

        fireEvent.change(titleInput(), { target: { value: "Reporte editado" } });
        fireEvent.click(screen.getByTestId("report-save-bottom"));
        await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
        expect(save.mock.calls[0][0].title).toBe("Reporte editado");
    });

    it("checks again after an explicit retry once the checker can start", async () => {
        spelling.failing = true;
        asUser(AUTHOR);
        mockReport("DRAFT");
        renderEditor();
        await screen.findByTestId("spelling-unavailable", {}, SLOW);
        expect(screen.queryByTestId("spelling-summary-title")).toBeNull();
        spelling.failing = false;
        fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
        await waitFor(() => expect(screen.getByTestId("spelling-summary-title")).toHaveTextContent("1 posible error ortográfico"), SLOW);
        expect(screen.queryByTestId("spelling-unavailable")).toBeNull();
        expect(spelling.workerStarts).toBe(2);
    });

    /** Renders a DRAFT, waits until the engine answered once, then breaks it on a new word. */
    async function failAfterStartUp() {
        asUser(AUTHOR);
        mockReport("DRAFT");
        renderEditor();
        await waitFor(() => expect(screen.getByTestId("spelling-summary-title")).toHaveTextContent("1 posible error ortográfico"), SLOW);
        expect(screen.queryByTestId("spelling-unavailable")).toBeNull();
        // A new, uncached word makes the (now failing) engine answer a lookup.
        spelling.engineBroken = true;
        fireEvent.change(titleInput(), { target: { value: "Reporte de pacietne zqxnuevo" } });
        await screen.findByTestId("spelling-unavailable", {}, SLOW);
    }

    it("shows the unavailable notice when the engine fails after start-up; editing, saving and clinical actions stay (review R2)", async () => {
        const save = vi.spyOn(reportService, "saveReportVersion").mockResolvedValue(undefined);
        await failAfterStartUp();
        expect(spelling.client?.getStatus()).toBe("unavailable");
        // No stale indications are presented while unavailable; the field stays editable.
        expect(screen.queryByTestId(/^spelling-summary-/)).toBeNull();
        expect(titleInput()).not.toBeDisabled();
        expect(screen.getByRole("button", { name: /Enviar a Revisión/ })).toBeEnabled();

        fireEvent.click(screen.getByTestId("report-save-bottom"));
        await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
        expect(save.mock.calls[0][0].title).toBe("Reporte de pacietne zqxnuevo");
    }, 20_000);

    it("recovers with Reintentar after a failure that followed a successful start-up (review R2)", async () => {
        await failAfterStartUp();
        spelling.engineBroken = false;
        fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
        await waitFor(() => expect(screen.getByTestId("spelling-summary-title")).toHaveTextContent("2 posibles errores ortográficos"), SLOW);
        expect(screen.queryByTestId("spelling-unavailable")).toBeNull();
        expect(spelling.workerStarts).toBe(2);
    }, 20_000);

    it("saves exactly the authored content: no spelling marks, classes or attributes", async () => {
        asUser(AUTHOR);
        mockReport("DRAFT");
        const save = vi.spyOn(reportService, "saveReportVersion").mockResolvedValue(undefined);
        renderEditor();
        await screen.findByTestId("spelling-summary-section:diagnostico", {}, SLOW);
        await screen.findByTestId("spelling-summary-title", {}, SLOW);
        fireEvent.click(screen.getByTestId("report-save-bottom"));
        await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
        const saved = JSON.stringify(save.mock.calls[0][0]);
        expect(spellingArtifacts(saved)).toEqual([]);
        expect(saved).not.toContain("ql-cursor"); // no transient Quill cursor blot either
        expect(save.mock.calls[0][0].title).toBe("Reporte de pacietne");
        expect(saved).toContain("<p>Biopsia de pacietne con CU011026 y Ki67.</p>");
        expect(saved).toContain("Sin hallasgos adicionales.");
    });

    it("starts a fresh session for another report: ignore decisions do not carry over", async () => {
        asUser(AUTHOR);
        mockReport("DRAFT", { title: "Hallasgos" });
        const view = renderEditor();
        fireEvent.click(within(await screen.findByTestId("spelling-summary-title", {}, SLOW)).getByRole("button", { name: /Revisar ortografía/ }));
        fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Ignorar en este reporte" }));
        await waitFor(() => expect(screen.queryByTestId("spelling-summary-title")).toBeNull(), SLOW);
        view.unmount();

        renderEditor(`/reports/${REPORT_ID.replace("sp01", "sp02")}`);
        await waitFor(() => expect(screen.getByTestId("spelling-summary-title")).toHaveTextContent("1 posible error ortográfico"), SLOW);
    });
});
