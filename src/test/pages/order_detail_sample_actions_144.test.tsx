/**
 * Céluma 1.4.4 (issue #73) — the order page reflects the server's availability of "Agregar Muestra" and shows the
 * review-withdrawal timeline row. The API refuses a stale click regardless. Synthetic data only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import OrderDetail from "../../pages/order_detail";
import { useUserProfile } from "../../hooks/use_user_profile";

vi.mock("../../hooks/use_user_profile");
const mockedUseUserProfile = vi.mocked(useUserProfile);

const ORDER_ID = "ord-1";
const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) }) as unknown as Response;

function stubApi(sampleCreation: Record<string, unknown> | undefined, events: unknown[] = []) {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith(`/laboratory/orders/${ORDER_ID}/management`)) {
            return json({ order_id: ORDER_ID, edit: { permitted: true, allowed: false, blockers: [] },
                removal: { permitted: true, allowed: false, blockers: [] }, removal_consequences: [], sample_creation: sampleCreation });
        }
        if (url.includes(`/laboratory/orders/${ORDER_ID}/full`)) {
            return json({ order: { id: ORDER_ID, order_code: "ORD-SYN-1", status: "REVIEW", tenant_id: "t1", branch_id: "b1", report_id: null },
                patient: null, samples: [], report: null });
        }
        if (url.includes(`/laboratory/orders/${ORDER_ID}/events`)) return json({ events });
        if (url.includes("/comments")) return json({ items: [], page_info: { has_more: false } });
        return json({});
    }));
}

function renderPage() {
    return render(
        <MemoryRouter initialEntries={[`/orders/${ORDER_ID}`]}>
            <Routes><Route path="/orders/:orderId" element={<OrderDetail />} /></Routes>
        </MemoryRouter>,
    );
}

/** The samples live on their own tab. */
async function addSampleButton() {
    fireEvent.click(await screen.findByRole("tab", { name: /Muestras/ }));
    return (await screen.findByTestId("add-sample")) as HTMLButtonElement;
}

beforeEach(() => {
    localStorage.setItem("auth_token", "Bearer test-token");
    const permissions = ["lab:read", "lab:create_sample", "reports:read", "audit:read_events"];
    mockedUseUserProfile.mockReturnValue({
        profile: { id: "usr-1", roles: ["assistant"], permissions } as never,
        loading: false, authStatus: "authenticated", sessionExpired: false, error: null,
        canManageUsers: false, canManageBranches: false, canManageCatalog: false, canManageTenant: false,
        hasPermission: (code: string) => permissions.includes(code),
        hasRole: () => false, canActAsReviewer: () => false, isAssignedReviewer: () => false, canReopenApprovedReport: () => false,
    } as unknown as ReturnType<typeof useUserProfile>);
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
});

describe("Agregar Muestra follows the server", () => {
    it("is disabled, with the reason, while the order or its report is in review", async () => {
        stubApi({ permitted: true, allowed: false, blockers: [{ code: "order_in_review", message: "The order is in review; samples cannot be added until the review ends" }] });
        renderPage();
        const button = await addSampleButton();
        await waitFor(() => expect(button.disabled).toBe(true));
        expect(button.title).toContain("in review");
    });

    it("is enabled when the server allows it", async () => {
        stubApi({ permitted: true, allowed: true, blockers: [] });
        renderPage();
        const button = await addSampleButton();
        await waitFor(() => expect(button.disabled).toBe(false));
    });

    it("stays enabled on an API that does not report the availability (the server still refuses)", async () => {
        stubApi(undefined);
        renderPage();
        const button = await addSampleButton();
        expect(button.disabled).toBe(false);
    });
});

describe("timeline", () => {
    it("shows a review withdrawal as such, not as a raw status change", async () => {
        stubApi({ permitted: true, allowed: true, blockers: [] }, [{
            id: "e1", event_type: "STATUS_CHANGED", description: "Reporte retirado de revisión",
            metadata: { action: "REPORT_REVIEW_WITHDRAWN", report_id: "rep-1" }, created_at: "2026-11-13T12:00:00Z",
            created_by: "u1", created_by_name: "Autora Sintética",
        }]);
        renderPage();
        expect(await screen.findByText(/Retiró de revisión el/)).toBeTruthy();
    });
});
