/**
 * Tests for InternalReportRender (Céluma 1.3 Fase 2, Bloque E, Historia
 * E3/E16): the chrome-free route the backend's headless Chromium navigates
 * to. Covers the token-from-fragment contract, the error state when it's
 * missing, and the `data-report-ready` readiness signal on success.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import InternalReportRender from "../../components/report/internal_report_render";
import * as reportService from "../../services/report_service";
import { draftSingleSampleNoImages } from "../fixtures/reports";
import type { InternalRenderData } from "../../models/report";

const REPORT_ID = draftSingleSampleNoImages.id || "report-1";

function renderAt(path: string) {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <Routes>
                <Route
                    path="/internal/report-render/:reportId/:versionNo"
                    element={<InternalReportRender />}
                />
            </Routes>
        </MemoryRouter>
    );
}

beforeEach(() => {
    window.location.hash = "";
});

afterEach(() => {
    vi.restoreAllMocks();
    window.location.hash = "";
});

describe("InternalReportRender", () => {
    it("shows a controlled error and never signals ready when the token is missing from the fragment", async () => {
        renderAt(`/internal/report-render/${REPORT_ID}/1`);

        expect(await screen.findByText(/faltan parámetros o token/i)).toBeTruthy();
        expect(document.documentElement.dataset.reportReady).toBeUndefined();
    });

    it("fetches render data using the token from the URL fragment and renders the report", async () => {
        // The `data-report-ready` signal itself gates on real <img> load/error
        // events (see waitForImages in internal_report_render.tsx) — jsdom
        // never actually fetches images, so that part of the contract is
        // covered by the real-browser Playwright suite (E17), not here. This
        // test covers what jsdom *can* verify: token extraction, the fetch
        // call shape, and that the resolver actually renders.
        window.location.hash = "#token=render-token-abc";
        const fetchSpy = vi
            .spyOn(reportService, "fetchInternalRenderData")
            .mockResolvedValue({ ...draftSingleSampleNoImages, signer_lookup: [] } as InternalRenderData);

        renderAt(`/internal/report-render/${REPORT_ID}/1`);

        await waitFor(() => {
            expect(fetchSpy).toHaveBeenCalledWith("render-token-abc", REPORT_ID, "1");
        });

        expect(await screen.findByText("Dra. Arisbeth Villanueva Pérez.")).toBeTruthy();
    });

    it("shows a controlled error (no ready signal) when the render-data fetch fails", async () => {
        window.location.hash = "#token=render-token-abc";
        vi.spyOn(reportService, "fetchInternalRenderData").mockRejectedValue(
            new Error("Render token does not match the requested version")
        );

        renderAt(`/internal/report-render/${REPORT_ID}/1`);

        expect(await screen.findByText(/Render token does not match the requested version/)).toBeTruthy();
        expect(document.documentElement.dataset.reportReady).toBeUndefined();
    });
});
