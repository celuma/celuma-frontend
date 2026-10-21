/**
 * Céluma 1.4 (#18/#20) — the figure cards of the report editor.
 *
 * jsdom cannot prove real caret behaviour in a browser (the real-Chrome proof is
 * tests-e2e/report_figure_caption.spec.ts), but it does honour a textarea's
 * selection being reset when its value is rewritten programmatically, which is
 * exactly how the original defect (a lagging copy of the images state) showed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ReportEditor from "../../components/report/report_editor";
import * as reportService from "../../services/report_service";
import * as letterheadService from "../../services/report_letterhead_service";
import { useUserProfile } from "../../hooks/use_user_profile";
import type { ReportStatus } from "../../models/report";

vi.mock("../../hooks/use_user_profile");
const mockedUseUserProfile = vi.mocked(useUserProfile);

const REPORT_ID = "00000000-0000-0000-0000-0000000000f1";
const ORDER_ID = "00000000-0000-0000-0000-0000000000fa";

const FIGURES = [
    { id: "img-a", url: "https://media.test/a.jpg", caption: "Cap A" },
    { id: "img-b", url: "https://media.test/b.jpg", caption: "Cap B" },
    { id: "img-c", url: "https://media.test/c.jpg", caption: "Cap C" },
];

const TEMPLATE = {
    base: { order_code: { is_visible: true, label: "Código de orden", value: "ORD-1" } },
    sections: { figuras: { is_visible: true, label: "Imágenes", type: "images", content: [] } },
    base_order: ["order_code"],
    section_order: ["figuras"],
};
const contentWith = (figures: typeof FIGURES) => ({
    ...TEMPLATE,
    sections: { figuras: { is_visible: true, label: "Imágenes", type: "images", content: figures } },
});

function withPermissions(granted: string[]) {
    mockedUseUserProfile.mockReturnValue({
        profile: null, loading: false, authStatus: "authenticated", sessionExpired: false,
        error: null, canManageUsers: false, canManageBranches: false, canManageCatalog: false,
        canManageTenant: false,
        hasPermission: (p: string) => granted.includes(p),
        hasRole: () => false,
        canActAsReviewer: () => false,
        canReopenApprovedReport: () => false,
        isAssignedReviewer: () => false,
    } as unknown as ReturnType<typeof useUserProfile>);
}

function mockReport(status: ReportStatus, figures: typeof FIGURES = FIGURES) {
    vi.spyOn(reportService, "getReportFull").mockResolvedValue({
        order: { id: ORDER_ID, order_code: "ORD-1", status: "IN_PROGRESS", patient_id: "p1", tenant_id: "t1", branch_id: "b1" },
        patient: { id: "p1", tenant_id: "t1", branch_id: "b1", patient_code: "PAT-1" },
        samples: [],
        report: {
            id: REPORT_ID, order_id: ORDER_ID, tenant_id: "t1", branch_id: "b1", created_by: "u1", version_no: 1, schema_version: 2, status,
            title: "Reporte de figuras", published_at: null, signed_by: null, signed_at: null,
            template: TEMPLATE, report: { ...contentWith(figures), schema_version: 2 },
        },
    } as never);
    vi.spyOn(letterheadService, "listReportLetterheads").mockResolvedValue({ letterheads: [] });
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
        const body = String(input).includes("/tenants/") ? { reports_v2_enabled: true } : {};
        return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(body)), json: () => Promise.resolve(body) } as Response);
    });
}

function renderEditor() {
    return render(
        <MemoryRouter initialEntries={[`/reports/${REPORT_ID}`]}>
            <Routes><Route path="/reports/:reportId" element={<ReportEditor />} /></Routes>
        </MemoryRouter>,
    );
}

/** [image file, caption] of every figure card, in screen order. */
function cards() {
    return Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="report-figure-"]')).map((card) => [
        /\/([a-z])\.jpg/.exec(card.querySelector("img")?.getAttribute("src") ?? "")?.[1],
        card.querySelector("textarea")!.value,
    ]);
}

beforeEach(() => {
    localStorage.setItem("tenant_id", "t1");
    localStorage.setItem("branch_id", "b1");
    withPermissions(["reports:read", "reports:write"]);
});
afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
});

describe("ReportEditor — figure cards (#18)", () => {
    it("moves a figure with its image and caption, numbers from the new order and disables the boundaries", async () => {
        mockReport("DRAFT");
        renderEditor();
        await waitFor(() => expect(cards()).toHaveLength(3));
        expect(cards()).toEqual([["a", "Cap A"], ["b", "Cap B"], ["c", "Cap C"]]);

        expect((screen.getByRole("button", { name: "Subir Figura 1" }) as HTMLButtonElement).disabled).toBe(true);
        expect((screen.getByRole("button", { name: "Bajar Figura 3" }) as HTMLButtonElement).disabled).toBe(true);

        const user = userEvent.setup();
        await user.click(screen.getByRole("button", { name: "Bajar Figura 1" }));
        expect(cards()).toEqual([["b", "Cap B"], ["a", "Cap A"], ["c", "Cap C"]]);
        // Focus stays on the moved figure's control (now Figura 2).
        await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Bajar Figura 2" })));

        // To the last place: the focus falls back to the still-enabled control.
        await user.click(screen.getByRole("button", { name: "Bajar Figura 2" }));
        expect(cards()).toEqual([["b", "Cap B"], ["c", "Cap C"], ["a", "Cap A"]]);
        await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Subir Figura 3" })));

        const first = document.querySelector('[data-testid^="report-figure-"]') as HTMLElement;
        expect(within(first).getByText("Figura 1")).toBeTruthy();
    });

    it("removing a figure keeps the relative order and renumbers", async () => {
        mockReport("DRAFT");
        renderEditor();
        await waitFor(() => expect(cards()).toHaveLength(3));
        const user = userEvent.setup();
        await user.click(screen.getByRole("button", { name: "Subir Figura 3" }));
        await user.click(screen.getByRole("button", { name: "Quitar Figura 1" }));
        expect(cards()).toEqual([["c", "Cap C"], ["b", "Cap B"]]);
        expect(screen.queryByRole("button", { name: "Subir Figura 3" })).toBeNull();
    });

    it.each<ReportStatus>(["IN_REVIEW", "APPROVED", "PUBLISHED"])("offers no reorder, removal or caption editing in %s", async (status) => {
        mockReport(status);
        renderEditor();
        await waitFor(() => expect(cards()).toHaveLength(3));
        expect(screen.queryAllByRole("button", { name: /^(Subir|Bajar|Quitar) Figura/ })).toHaveLength(0);
        for (const box of screen.getAllByPlaceholderText("Nota para esta imagen")) expect((box as HTMLTextAreaElement).disabled).toBe(true);
    });
});

describe("ReportEditor — figures with repeated or empty image ids (#18)", () => {
    // Historical content may carry equal / empty ids; they must be kept, not merged or swapped.
    const DUP = [
        { id: "same", url: "https://media.test/a.jpg", caption: "Cap A" },
        { id: "same", url: "https://media.test/b.jpg", caption: "Cap B" },
        { id: "", url: "https://media.test/c.jpg", caption: "Cap C" },
        { id: "", url: "https://media.test/d.jpg", caption: "Cap D" },
    ];

    it("moves an equal-id figure across its twin: focus, continued keyboard actions and edits stay on it", async () => {
        mockReport("DRAFT", DUP);
        renderEditor();
        await waitFor(() => expect(cards()).toHaveLength(4));
        const user = userEvent.setup();

        await user.click(screen.getByRole("button", { name: "Bajar Figura 1" }));
        expect(cards()).toEqual([["b", "Cap B"], ["a", "Cap A"], ["c", "Cap C"], ["d", "Cap D"]]);
        // Focus is on the MOVED figure (A, now Figura 2), not on its twin.
        await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Bajar Figura 2" })));

        // Continuing by keyboard keeps moving A.
        await user.keyboard("{Enter}");
        expect(cards()).toEqual([["b", "Cap B"], ["c", "Cap C"], ["a", "Cap A"], ["d", "Cap D"]]);
        await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Bajar Figura 3" })));

        // Same for the empty-id pair: D crosses C, then an edit lands on D only.
        await user.click(screen.getByRole("button", { name: "Subir Figura 4" }));
        await user.click(screen.getByRole("button", { name: "Subir Figura 3" }));
        expect(cards()).toEqual([["b", "Cap B"], ["d", "Cap D"], ["c", "Cap C"], ["a", "Cap A"]]);
        const boxes = () => screen.getAllByPlaceholderText("Nota para esta imagen") as HTMLTextAreaElement[];
        await user.click(boxes()[1]);
        boxes()[1].setSelectionRange(3, 3);
        await user.keyboard("Z");
        expect(cards()).toEqual([["b", "Cap B"], ["d", "CapZ D"], ["c", "Cap C"], ["a", "Cap A"]]);
        expect([boxes()[1].selectionStart, document.activeElement === boxes()[1]]).toEqual([4, true]);

        // Removing one of the equal-id figures removes exactly that one.
        await user.click(screen.getByRole("button", { name: "Quitar Figura 2" }));
        expect(cards()).toEqual([["b", "Cap B"], ["c", "Cap C"], ["a", "Cap A"]]);
    });
});

describe("ReportEditor — caption editing (#20)", () => {
    it("keeps focus and the caret while typing, deleting and replacing in the middle", async () => {
        mockReport("DRAFT");
        renderEditor();
        await waitFor(() => expect(cards()).toHaveLength(3));
        const user = userEvent.setup();
        const box = () => screen.getAllByPlaceholderText("Nota para esta imagen")[0] as HTMLTextAreaElement;

        await user.click(box());
        box().setSelectionRange(3, 3);
        await user.keyboard("XY");
        expect(box().value).toBe("CapXY A");
        expect([box().selectionStart, document.activeElement === box()]).toEqual([5, true]);

        await user.keyboard("{Backspace}");
        expect(box().value).toBe("CapX A");
        expect(box().selectionStart).toBe(4);

        await user.keyboard("{Delete}");
        expect(box().value).toBe("CapXA");
        expect(box().selectionStart).toBe(4);

        box().setSelectionRange(0, 3);
        await user.keyboard("ñá");
        expect(box().value).toBe("ñáXA");
        expect(box().selectionStart).toBe(2);
    });

    it("keeps the caret where a pasted line break was flattened (middle paste and selection replacement)", async () => {
        mockReport("DRAFT");
        renderEditor();
        await waitFor(() => expect(cards()).toHaveLength(3));
        const user = userEvent.setup();
        const box = () => screen.getAllByPlaceholderText("Nota para esta imagen")[0] as HTMLTextAreaElement;

        await user.click(box());
        box().setSelectionRange(3, 3);
        await user.paste("X\nY");
        await waitFor(() => expect(box().value).toBe("CapX Y A"));
        expect(box().selectionStart).toBe(6);
        expect(box().selectionEnd).toBe(6);

        box().setSelectionRange(0, 3);
        await user.paste("P\nQ");
        await waitFor(() => expect(box().value).toBe("P QX Y A"));
        expect([box().selectionStart, box().selectionEnd]).toEqual([3, 3]);
    });

    it("never moves an edit to another image after a reorder, and keeps 25 characters on one line", async () => {
        mockReport("DRAFT");
        renderEditor();
        await waitFor(() => expect(cards()).toHaveLength(3));
        const user = userEvent.setup();

        await user.click(screen.getByRole("button", { name: "Subir Figura 2" }));
        expect(cards()).toEqual([["b", "Cap B"], ["a", "Cap A"], ["c", "Cap C"]]);

        const first = screen.getAllByPlaceholderText("Nota para esta imagen")[0] as HTMLTextAreaElement;
        await user.click(first);
        first.setSelectionRange(3, 3);
        await user.keyboard("Z");
        expect(cards()).toEqual([["b", "CapZ B"], ["a", "Cap A"], ["c", "Cap C"]]);

        await user.clear(first);
        await user.type(first, "1234567890123456789012345EXTRA");
        expect(first.value).toBe("1234567890123456789012345");
        await user.keyboard("{Enter}");
        expect(first.value).toBe("1234567890123456789012345");
        expect(first.value).not.toContain("\n");
    });
});
