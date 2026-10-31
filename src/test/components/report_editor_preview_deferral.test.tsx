/**
 * Céluma 1.4 (#29 follow-up) — the live preview follows typing after a short
 * pause instead of repaginating the whole document on every keystroke, and
 * nothing that reads the author's text (save, local print) depends on that
 * delay. The renderer is replaced by a recording stub: pagination and paint
 * are measured in a real browser by tests-perf; jsdom has no layout. Synthetic
 * data only.
 */
import { forwardRef, useImperativeHandle, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ReportEditor from "../../components/report/report_editor";
import { PREVIEW_IDLE_MS } from "../../components/report/use_settled_value";
import * as reportService from "../../services/report_service";
import * as letterheadService from "../../services/report_letterhead_service";
import { useUserProfile } from "../../hooks/use_user_profile";
import type { ReportEnvelope } from "../../models/report";

const seen = vi.hoisted(() => ({ renders: 0, last: null as unknown, printedWith: null as unknown, signerLookups: [] as unknown[] }));

vi.mock("../../hooks/use_user_profile");
vi.mock("../../lib/spelling/client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../lib/spelling/client")>();
    // The checker is not under test here: a client whose worker cannot start keeps the editor quiet.
    const client = actual.createSpellingClient(() => {
        throw new Error("no worker in this test");
    });
    return { ...actual, getSpellingClient: () => client };
});
vi.mock("../../components/report/report_renderer_resolver", () => ({
    default: forwardRef<unknown, { report: ReportEnvelope; signerLookup?: unknown }>(function StubRenderer({ report, signerLookup }, ref) {
        seen.renders += 1;
        seen.last = report;
        seen.signerLookups.push(signerLookup);
        const latest = useRef(report);
        latest.current = report;
        useImperativeHandle(ref, () => ({ getPages: () => [document.createElement("div")] }), []);
        return <div data-testid="stub-preview">{String((report.report.sections.notas as { content: string }).content)}</div>;
    }),
}));
vi.mock("../../hooks/use_local_print", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../hooks/use_local_print")>();
    return {
        ...actual,
        useLocalPrint: () => ({
            printLocalCopy: async () => {
                // What the preview shows at the moment printing reads its pages.
                seen.printedWith = (document.querySelector('[data-testid="stub-preview"]') as HTMLElement).textContent;
            },
        }),
    };
});
const mockedUseUserProfile = vi.mocked(useUserProfile);

const REPORT_ID = "00000000-0000-0000-0000-00000000pd01";
const ORDER_ID = "00000000-0000-0000-0000-00000000pd0a";
const USER_ID = "00000000-0000-0000-0000-00000000pdu1";
const CONTENT = {
    base: { order_code: { is_visible: true, label: "Código de orden", value: "ORD-1" } },
    sections: { notas: { is_visible: true, label: "Notas", type: "text", content: "Texto inicial." } },
    base_order: ["order_code"],
    section_order: ["notas"],
};

function asAuthor() {
    mockedUseUserProfile.mockReturnValue({
        profile: { id: USER_ID } as never, loading: false, authStatus: "authenticated", sessionExpired: false, error: null,
        canManageUsers: false, canManageBranches: false, canManageCatalog: false, canManageTenant: false,
        hasPermission: (p: string) => ["reports:read", "reports:create", "reports:edit", "reports:submit", "lab:read"].includes(p),
        hasRole: (r: string) => r === "pathologist",
        canActAsReviewer: () => false, isAssignedReviewer: () => false, canReopenApprovedReport: () => false,
    } as unknown as ReturnType<typeof useUserProfile>);
}

beforeEach(() => {
    seen.renders = 0;
    seen.last = null;
    seen.printedWith = null;
    seen.signerLookups = [];
    localStorage.setItem("tenant_id", "t1");
    localStorage.setItem("branch_id", "b1");
    asAuthor();
    vi.spyOn(letterheadService, "listReportLetterheads").mockResolvedValue({ letterheads: [] });
    vi.spyOn(reportService, "getReportFull").mockResolvedValue({
        order: {
            id: ORDER_ID, order_code: "ORD-1", status: "IN_PROGRESS", patient_id: "p1", tenant_id: "t1", branch_id: "b1",
            reviewers: [{ id: USER_ID, name: "Dra. Revisora", email: "r@lab.test", status: "pending" }],
        },
        patient: { id: "p1", tenant_id: "t1", branch_id: "b1", patient_code: "PAT-1" },
        samples: [],
        report: {
            id: REPORT_ID, order_id: ORDER_ID, tenant_id: "t1", branch_id: "b1", created_by: USER_ID, version_no: 1,
            status: "DRAFT", schema_version: 2, title: "Reporte sintético", published_at: null, signed_by: null, signed_at: null,
            template: { base: CONTENT.base, sections: CONTENT.sections, base_order: CONTENT.base_order, section_order: CONTENT.section_order },
            report: { ...CONTENT, schema_version: 2 },
        },
    } as never);
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
        const body = String(input).includes("/tenants/") ? { reports_v2_enabled: true } : {};
        return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(body)), json: () => Promise.resolve(body) } as Response);
    });
});
afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
});

function renderEditor() {
    return render(
        <MemoryRouter initialEntries={[`/reports/${REPORT_ID}`]}>
            <Routes><Route path="/reports/:reportId" element={<ReportEditor />} /></Routes>
        </MemoryRouter>,
    );
}
const notes = () => screen.getByDisplayValue(/Texto inicial|Escribiendo/) as HTMLTextAreaElement;
const column = () => document.querySelector(".re-preview-col") as HTMLElement;

describe("ReportEditor — live preview follows typing after a pause", () => {
    it("shows the loaded content at once, without waiting for a pause", async () => {
        // Flush the mocked load and React effects without advancing the debounce clock. With real
        // timers, findBy can observe the renderer between hydration and the reset-key effect on a
        // busy CI worker; that transient frame does not establish whether loading waits 200 ms.
        // A broken reset-key path must still fail: no idle/max-wait timer is allowed to fire here.
        vi.useFakeTimers();
        try {
            await act(async () => { renderEditor(); });
            expect(screen.getByTestId("stub-preview")).toHaveTextContent("Texto inicial.");
            expect(column().getAttribute("data-preview-stale")).toBeNull();
        } finally {
            vi.useRealTimers();
        }
    });

    it("keeps the inputs immediate, recomposes the preview once after a burst, and marks it stale meanwhile", async () => {
        renderEditor();
        await screen.findByTestId("stub-preview");
        const before = seen.renders;

        const box = notes();
        for (const text of ["Escribiendo u", "Escribiendo un", "Escribiendo una", "Escribiendo una nota"]) {
            fireEvent.change(box, { target: { value: text } });
            // The control itself is never delayed.
            expect(notes().value).toBe(text);
        }
        expect(screen.getByTestId("stub-preview")).toHaveTextContent("Texto inicial.");
        expect(column().getAttribute("data-preview-stale")).toBe("true");
        expect(seen.renders).toBe(before);

        await waitFor(() => expect(screen.getByTestId("stub-preview")).toHaveTextContent("Escribiendo una nota"), { timeout: PREVIEW_IDLE_MS * 4 });
        expect(column().getAttribute("data-preview-stale")).toBeNull();
        // One recomposition for the whole burst (not one per keystroke).
        expect(seen.renders - before).toBe(1);
    });

    it("local print reads the text typed a moment ago, not the delayed preview", async () => {
        renderEditor();
        await screen.findByTestId("stub-preview");
        fireEvent.change(notes(), { target: { value: "Escribiendo recién" } });
        expect(screen.getByTestId("stub-preview")).toHaveTextContent("Texto inicial.");

        fireEvent.click(await screen.findByRole("button", { name: /Imprimir borrador/i }));
        await waitFor(() => expect(seen.printedWith).not.toBeNull());
        expect(seen.printedWith).toBe("Escribiendo recién");
        expect(column().getAttribute("data-preview-stale")).toBeNull();
    });

    it("hands the renderer one stable signer lookup, so unrelated editor renders do not repaginate", async () => {
        renderEditor();
        await screen.findByTestId("stub-preview");
        await act(async () => {
            fireEvent.change(notes(), { target: { value: "Escribiendo" } });
            await new Promise((r) => setTimeout(r, PREVIEW_IDLE_MS + 100));
        });
        const lookups = seen.signerLookups.filter((l) => Array.isArray(l) && l.length > 0);
        expect(lookups.length).toBeGreaterThan(1);
        expect(new Set(lookups).size).toBe(1);
    });
});
