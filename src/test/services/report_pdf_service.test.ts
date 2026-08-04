/**
 * Tests for the Block E PDF-generation service functions in
 * report_service.ts: generateReportPdf, fetchInternalRenderData,
 * getOfficialPdfDownloadUrl (Céluma 1.3 Phase 2, Block E, Story E12/E16).
 *
 * Follows the fetch-mocking convention established in
 * report_template_version_service.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    generateReportPdf,
    fetchInternalRenderData,
    getOfficialPdfDownloadUrl,
} from "../../services/report_service";

function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

const REPORT_ID = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
    localStorage.setItem("auth_token", "Bearer test-token");
});

afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
});

describe("generateReportPdf", () => {
    it("POSTs to the generate-pdf endpoint using the normal session auth header", async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            jsonResponse(200, {
                version_id: "v1",
                version_no: 1,
                report_id: REPORT_ID,
                pdf_generation_status: "READY",
                pdf_generated_at: "2026-01-01T00:00:00Z",
                pdf_sha256: "a".repeat(64),
                pdf_size_bytes: 1234,
                pdf_page_count: 2,
                pdf_error_code: null,
                pdf_error_message: null,
            })
        );
        vi.stubGlobal("fetch", fetchMock);

        const result = await generateReportPdf(REPORT_ID, 1);

        expect(result.pdf_generation_status).toBe("READY");
        expect(result.pdf_page_count).toBe(2);
        const [url, init] = fetchMock.mock.calls[0];
        expect(String(url)).toBe(`/api/v1/reports/${REPORT_ID}/versions/1/generate-pdf`);
        expect(init.method).toBe("POST");
        expect(init.headers["Authorization"]).toBe("Bearer test-token");
    });

    it("surfaces a 409 (already generating / immutable) as a thrown error", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                jsonResponse(409, { detail: "Cannot generate a PDF for a published or retracted report" })
            )
        );
        await expect(generateReportPdf(REPORT_ID, 1)).rejects.toThrow(
            "Cannot generate a PDF for a published or retracted report"
        );
    });

    it("surfaces a 422 (validation/render failure) as a thrown error", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(jsonResponse(422, { detail: "Generated file is not a valid PDF" }))
        );
        await expect(generateReportPdf(REPORT_ID, 1)).rejects.toThrow("Generated file is not a valid PDF");
    });
});

describe("getOfficialPdfDownloadUrl", () => {
    it("GETs the official download endpoint and returns the presigned URL", async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            jsonResponse(200, {
                version_id: "v1",
                version_no: 1,
                report_id: REPORT_ID,
                pdf_storage_id: "storage-1",
                pdf_key: "reports/.../official/x.pdf",
                pdf_url: "https://s3.example/reports/.../official/x.pdf?X-Amz-Signature=abc",
            })
        );
        vi.stubGlobal("fetch", fetchMock);

        const result = await getOfficialPdfDownloadUrl(REPORT_ID, 1);
        expect(result.pdf_url).toContain("X-Amz-Signature");
        const [url, init] = fetchMock.mock.calls[0];
        expect(String(url)).toBe(`/api/v1/reports/${REPORT_ID}/versions/1/pdf`);
        expect(init.method).toBe("GET");
    });

    it("surfaces a 404 (no PDF generated yet) as a thrown error", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(jsonResponse(404, { detail: "PDF not found for this version" }))
        );
        await expect(getOfficialPdfDownloadUrl(REPORT_ID, 1)).rejects.toThrow("PDF not found for this version");
    });
});

describe("fetchInternalRenderData", () => {
    it("sends the render token as a Bearer header, never the normal session token", async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            jsonResponse(200, {
                id: REPORT_ID,
                version_no: 1,
                status: "DRAFT",
                order_id: "order-1",
                tenant_id: "tenant-1",
                branch_id: "branch-1",
                title: "x",
                published_at: null,
                created_by: "u1",
                signed_by: null,
                signed_at: null,
                template: {},
                report: null,
                signer_lookup: [],
            })
        );
        vi.stubGlobal("fetch", fetchMock);

        const result = await fetchInternalRenderData("render-token-xyz", REPORT_ID, 1);

        expect(result.id).toBe(REPORT_ID);
        expect(result.signer_lookup).toEqual([]);
        const [url, init] = fetchMock.mock.calls[0];
        expect(String(url)).toBe(`/api/v1/reports/internal/render-data/${REPORT_ID}/1`);
        // Deliberately NOT authHeaders()/localStorage — a distinct, narrow
        // render token, never the normal user session.
        expect(init.headers["Authorization"]).toBe("Bearer render-token-xyz");
    });

    it("surfaces a 401 (invalid/expired render token) as a thrown error", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(jsonResponse(401, { detail: "Invalid or expired render token" }))
        );
        await expect(fetchInternalRenderData("bad-token", REPORT_ID, 1)).rejects.toThrow(
            "Invalid or expired render token"
        );
    });

    it("surfaces a 403 (token/version mismatch) as a thrown error", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                jsonResponse(403, { detail: "Render token does not match the requested version" })
            )
        );
        await expect(fetchInternalRenderData("tok", REPORT_ID, 2)).rejects.toThrow(
            "Render token does not match the requested version"
        );
    });
});
