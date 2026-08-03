/**
 * Tests for usePdfGeneration (Cell 1.3 Phase 2, Block E, History E12/E16).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { usePdfGeneration } from "../../hooks/use_pdf_generation";
import * as reportService from "../../services/report_service";

afterEach(() => {
    vi.restoreAllMocks();
});

describe("usePdfGeneration", () => {
    it("starts idle (not requesting, no error)", () => {
        const { result } = renderHook(() => usePdfGeneration());
        expect(result.current.isRequesting).toBe(false);
        expect(result.current.lastError).toBeNull();
    });

    it("sets isRequesting true while in flight and false once resolved, returning the result", async () => {
        let resolveFetch!: (value: reportService.PdfGenerationStatusResponse) => void;
        const pending = new Promise<reportService.PdfGenerationStatusResponse>((resolve) => {
            resolveFetch = resolve;
        });
        vi.spyOn(reportService, "generateReportPdf").mockReturnValue(pending);

        const { result } = renderHook(() => usePdfGeneration());

        let generatePromise!: Promise<reportService.PdfGenerationStatusResponse>;
        act(() => {
            generatePromise = result.current.generate("report-1", 1);
        });
        expect(result.current.isRequesting).toBe(true);

        resolveFetch({
            version_id: "v1",
            version_no: 1,
            report_id: "report-1",
            pdf_generation_status: "READY",
            pdf_generated_at: "2026-01-01T00:00:00Z",
            pdf_sha256: "a".repeat(64),
            pdf_size_bytes: 100,
            pdf_page_count: 1,
            pdf_error_code: null,
            pdf_error_message: null,
        });
        const resolved = await generatePromise;

        expect(resolved.pdf_generation_status).toBe("READY");
        await waitFor(() => expect(result.current.isRequesting).toBe(false));
        expect(result.current.lastError).toBeNull();
    });

    it("captures the error message and resets isRequesting on failure, and rethrows", async () => {
        vi.spyOn(reportService, "generateReportPdf").mockRejectedValue(
            new Error("Cannot generate a PDF for a published or retracted report")
        );

        const { result } = renderHook(() => usePdfGeneration());

        await act(async () => {
            await expect(result.current.generate("report-1", 1)).rejects.toThrow(
                "Cannot generate a PDF for a published or retracted report"
            );
        });

        expect(result.current.isRequesting).toBe(false);
        expect(result.current.lastError).toBe(
            "Cannot generate a PDF for a published or retracted report"
        );
    });
});
