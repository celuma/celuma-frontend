/**
 * Céluma 1.4 (#13): the order timeline shows report publication and reopening
 * accurately, identified by structure (`event_type` + `metadata.action`),
 * never by parsing descriptions.
 *
 * Before 1.4 a publication was stored as `REPORT_APPROVED` with
 * `published: true` and rendered as a second "Aprobó el reporte". New
 * publications are `REPORT_PUBLISHED`; historical rows keep their stored shape
 * and must render as publications too. Synthetic data only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import OrderDetail from "../../pages/order_detail";
import { useUserProfile } from "../../hooks/use_user_profile";

vi.mock("../../hooks/use_user_profile");
const mockedUseUserProfile = vi.mocked(useUserProfile);

const ORDER_ID = "ord-1";
const REPORT_ID = "rep-1";

type TimelineEvent = {
    id: string;
    event_type: string;
    description: string;
    metadata?: Record<string, unknown>;
    created_at: string;
    created_by?: string;
    created_by_name?: string;
};

function jsonResponse(body: unknown) {
    return {
        ok: true,
        status: 200,
        json: async () => body,
        text: async () => JSON.stringify(body),
    } as unknown as Response;
}

function stubApi(events: TimelineEvent[]) {
    vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes(`/laboratory/orders/${ORDER_ID}/full`)) {
                return jsonResponse({
                    order: {
                        id: ORDER_ID,
                        order_code: "ORD-SYN-1",
                        status: "CLOSED",
                        tenant_id: "t1",
                        branch_id: "b1",
                        report_id: null,
                    },
                    patient: null,
                    samples: [],
                    report: null,
                });
            }
            if (url.includes(`/laboratory/orders/${ORDER_ID}/events`)) return jsonResponse({ events });
            if (url.includes("/comments")) return jsonResponse({ items: [], page_info: { has_more: false } });
            return jsonResponse({});
        }),
    );
}

function event(id: string, event_type: string, metadata: Record<string, unknown>, description = ""): TimelineEvent {
    return {
        id,
        event_type,
        description,
        metadata,
        created_at: "2026-10-18T12:00:00Z",
        created_by: "u-rev",
        created_by_name: "Revisora Sintética",
    };
}

function renderPage() {
    return render(
        <MemoryRouter initialEntries={[`/orders/${ORDER_ID}`]}>
            <Routes>
                <Route path="/orders/:orderId" element={<OrderDetail />} />
            </Routes>
        </MemoryRouter>,
    );
}

beforeEach(() => {
    localStorage.setItem("auth_token", "Bearer test-token");
    const permissions = ["lab:read", "reports:read", "audit:read_events"];
    mockedUseUserProfile.mockReturnValue({
        profile: { id: "usr-1", roles: ["viewer"], permissions } as never,
        loading: false,
        authStatus: "authenticated",
        sessionExpired: false,
        error: null,
        canManageUsers: false,
        canManageBranches: false,
        canManageCatalog: false,
        canManageTenant: false,
        hasPermission: (code: string) => permissions.includes(code),
        hasRole: () => false,
        canActAsReviewer: () => false,
        isAssignedReviewer: () => false,
        canReopenApprovedReport: () => false,
    } as unknown as ReturnType<typeof useUserProfile>);
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
});

describe("Order timeline — report lifecycle events (1.4 #13)", () => {
    it("renders a REPORT_PUBLISHED row as a publication with its version", async () => {
        stubApi([
            event("e1", "REPORT_PUBLISHED", {
                action: "REPORT_PUBLISHED",
                publication_kind: "INITIAL",
                report_id: REPORT_ID,
                version_no: 3,
                signer_name: "Dra. Sintética",
                published: true,
            }, "Reporte firmado y publicado"),
        ]);
        renderPage();

        expect(await screen.findByText(/Dra\. Sintética firmó y publicó/)).toBeTruthy();
        expect(screen.getByText("(versión 3)")).toBeTruthy();
        expect(screen.queryByText(/aprobó/i)).toBeNull();
    });

    it("renders a pre-1.4 publication (REPORT_APPROVED + published) as a publication, not an approval", async () => {
        stubApi([
            event("e1", "REPORT_APPROVED", {
                report_id: REPORT_ID,
                reviewer_name: "Dra. Sintética",
            }),
            event("e2", "REPORT_APPROVED", {
                report_id: REPORT_ID,
                signer_id: "u-rev",
                signer_name: "Dra. Sintética",
                published: true,
            }),
        ]);
        renderPage();

        expect(await screen.findByText(/Dra\. Sintética aprobó/)).toBeTruthy();
        expect(screen.getAllByText(/aprobó/i)).toHaveLength(1);
        expect(screen.getByText(/Dra\. Sintética firmó y publicó/)).toBeTruthy();
    });

    it("renders an unknown future publication action through its stored description", async () => {
        stubApi([
            event("e1", "REPORT_PUBLISHED", { action: "SOME_FUTURE_ACTION", report_id: REPORT_ID }, "Descripción almacenada"),
        ]);
        renderPage();

        expect(await screen.findByText("Descripción almacenada")).toBeTruthy();
        expect(screen.queryByText(/firmó y publicó/)).toBeNull();
    });

    it("shows the reason given when a report was reopened", async () => {
        stubApi([
            event("e1", "STATUS_CHANGED", {
                action: "REPORT_REOPENED",
                reopen_kind: "UNSIGNED",
                report_id: REPORT_ID,
                reason: "Membrete incorrecto",
            }, "Reporte reabierto"),
        ]);
        renderPage();

        expect(await screen.findByText(/Reabrió el/)).toBeTruthy();
        expect(screen.getByText(/Membrete incorrecto/)).toBeTruthy();
    });

    it("renders reopening for amendment, the intervening review and the republication (1.4 #13)", async () => {
        const amendment = { amendment_id: "am-1", amendment_no: 1, amends_version_id: "v1", amends_version_no: 1 };
        stubApi([
            event("e1", "STATUS_CHANGED", {
                action: "REPORT_REOPENED_FOR_AMENDMENT", report_id: REPORT_ID, ...amendment,
                version_no: 2, reason: "Resultado de IHC posterior", category: "SUPPLEMENT",
            }, "Reporte reabierto para enmienda 1"),
            event("e2", "REPORT_SUBMITTED", { report_id: REPORT_ID, ...amendment }),
            event("e3", "REPORT_APPROVED", { report_id: REPORT_ID, reviewer_name: "Dra. Sintética", ...amendment }),
            event("e4", "REPORT_PUBLISHED", {
                action: "REPORT_REPUBLISHED", publication_kind: "AMENDMENT", report_id: REPORT_ID,
                signer_name: "Dra. Sintética", version_no: 3, ...amendment, published: true,
            }, "Reporte enmendado firmado y republicado"),
        ]);
        renderPage();

        expect(await screen.findByText(/Reabrió el reporte para la enmienda 1/)).toBeTruthy();
        expect(screen.getByText(/Resultado de IHC posterior/)).toBeTruthy();
        expect(screen.getByText(/Dra\. Sintética firmó y republicó/)).toBeTruthy();
        expect(screen.getByText(/enmienda 1, versión 3; sustituye a la versión 1/)).toBeTruthy();
        // The intervening submission and approval are linked to the amendment.
        expect(screen.getAllByTestId("timeline-amendment-tag")).toHaveLength(2);
    });

    it("renders a cancelled amendment with its reason (1.4 #13)", async () => {
        stubApi([
            event("e1", "STATUS_CHANGED", {
                action: "REPORT_AMENDMENT_CANCELLED", report_id: REPORT_ID, amendment_id: "am-1", amendment_no: 1,
                amends_version_no: 1, version_no: 1, reason: "Se abrió por error",
            }, "Enmienda 1 cancelada"),
        ]);
        renderPage();

        expect(await screen.findByText(/Canceló la enmienda 1 del reporte/)).toBeTruthy();
        expect(screen.getByText(/vuelve a la emisión firmada \(versión 1\)/)).toBeTruthy();
        expect(screen.getByText(/Se abrió por error/)).toBeTruthy();
    });
});
