/**
 * Tests for the letterhead-domain service functions —
 * post-Phase-2 remediation, R8/R16. Mirrors
 * report_template_version_service.test.ts's fetch-mocking convention.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    listReportLetterheads,
    getReportLetterhead,
    createReportLetterhead,
    updateReportLetterhead,
    deleteReportLetterhead,
    duplicateReportLetterhead,
    setDefaultReportLetterhead,
    listReportLetterheadVersions,
    getReportLetterheadVersion,
    createReportLetterheadVersion,
    activateReportLetterheadVersion,
    archiveReportLetterheadVersion,
    uploadReportLetterheadLogo,
    importReportLetterhead,
} from "../../services/report_letterhead_service";

function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

const LETTERHEAD_ID = "11111111-1111-1111-1111-111111111111";
const VERSION_ID = "22222222-2222-2222-2222-222222222222";

beforeEach(() => {
    localStorage.setItem("auth_token", "Bearer test-token");
});

afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
});

describe("listReportLetterheads", () => {
    it("calls GET /report-letterheads/ and returns the parsed body", async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            jsonResponse(200, { letterheads: [{ id: LETTERHEAD_ID, name: "General" }] })
        );
        vi.stubGlobal("fetch", fetchMock);

        const result = await listReportLetterheads();

        expect(result.letterheads).toHaveLength(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(String(url)).toContain("/report-letterheads/");
        expect(init.method).toBe("GET");
    });

    it("maps 403 to a permission message", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(403, { detail: "Permission required: reports:read" })));
        await expect(listReportLetterheads()).rejects.toThrow("Permission required: reports:read");
    });
});

describe("createReportLetterhead / updateReportLetterhead / deleteReportLetterhead", () => {
    it("POSTs a name/description payload", async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: LETTERHEAD_ID, name: "New" }));
        vi.stubGlobal("fetch", fetchMock);

        await createReportLetterhead({ name: "New", description: "desc" });

        const [url, init] = fetchMock.mock.calls[0];
        expect(String(url)).toContain("/report-letterheads/");
        expect(init.method).toBe("POST");
        expect(JSON.parse(init.body)).toEqual({ name: "New", description: "desc" });
    });

    it("PUTs an update payload to the specific letterhead", async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: LETTERHEAD_ID, name: "Renamed" }));
        vi.stubGlobal("fetch", fetchMock);

        await updateReportLetterhead(LETTERHEAD_ID, { name: "Renamed" });

        const [url, init] = fetchMock.mock.calls[0];
        expect(String(url)).toContain(`/report-letterheads/${LETTERHEAD_ID}`);
        expect(init.method).toBe("PUT");
    });

    it("DELETEs with hard_delete query param", async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { message: "ok", id: LETTERHEAD_ID }));
        vi.stubGlobal("fetch", fetchMock);

        await deleteReportLetterhead(LETTERHEAD_ID, true);

        const [url, init] = fetchMock.mock.calls[0];
        expect(String(url)).toContain("hard_delete=true");
        expect(init.method).toBe("DELETE");
    });
});

describe("duplicateReportLetterhead / setDefaultReportLetterhead", () => {
    it("POSTs to /duplicate", async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: "new-id" }));
        vi.stubGlobal("fetch", fetchMock);

        await duplicateReportLetterhead(LETTERHEAD_ID);

        const [url] = fetchMock.mock.calls[0];
        expect(String(url)).toContain(`/report-letterheads/${LETTERHEAD_ID}/duplicate`);
    });

    it("POSTs to /default", async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: LETTERHEAD_ID, is_default: true }));
        vi.stubGlobal("fetch", fetchMock);

        const result = await setDefaultReportLetterhead(LETTERHEAD_ID);

        expect(result.is_default).toBe(true);
        const [url] = fetchMock.mock.calls[0];
        expect(String(url)).toContain(`/report-letterheads/${LETTERHEAD_ID}/default`);
    });
});

describe("letterhead versions", () => {
    it("listReportLetterheadVersions calls the right route", async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { versions: [] }));
        vi.stubGlobal("fetch", fetchMock);

        await listReportLetterheadVersions(LETTERHEAD_ID);
        expect(String(fetchMock.mock.calls[0][0])).toContain(
            `/report-letterheads/${LETTERHEAD_ID}/versions`
        );
    });

    it("getReportLetterheadVersion includes the version id", async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: VERSION_ID }));
        vi.stubGlobal("fetch", fetchMock);

        await getReportLetterheadVersion(LETTERHEAD_ID, VERSION_ID);
        expect(String(fetchMock.mock.calls[0][0])).toContain(
            `/report-letterheads/${LETTERHEAD_ID}/versions/${VERSION_ID}`
        );
    });

    it("createReportLetterheadVersion POSTs the configuration", async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: VERSION_ID }));
        vi.stubGlobal("fetch", fetchMock);
        const configuration = { paper: { size: "LETTER" } } as never;

        await createReportLetterheadVersion(LETTERHEAD_ID, { configuration });

        const [, init] = fetchMock.mock.calls[0];
        expect(init.method).toBe("POST");
        expect(JSON.parse(init.body).configuration).toEqual(configuration);
    });

    it("activateReportLetterheadVersion and archiveReportLetterheadVersion hit /activate and /archive", async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse(200, { id: VERSION_ID, status: "ACTIVE" }))
            .mockResolvedValueOnce(jsonResponse(200, { id: VERSION_ID, status: "ARCHIVED" }));
        vi.stubGlobal("fetch", fetchMock);

        await activateReportLetterheadVersion(LETTERHEAD_ID, VERSION_ID);
        expect(String(fetchMock.mock.calls[0][0])).toContain("/activate");

        await archiveReportLetterheadVersion(LETTERHEAD_ID, VERSION_ID);
        expect(String(fetchMock.mock.calls[1][0])).toContain("/archive");
    });
});

describe("uploadReportLetterheadLogo", () => {
    it("sends a real File in multipart form data under field 'file'", async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            jsonResponse(200, { storage_object_id: "s1", url: "https://cdn.example/x.png", content_type: "image/png", size_bytes: 10 })
        );
        vi.stubGlobal("fetch", fetchMock);

        const file = new File([new Uint8Array([1, 2, 3])], "logo.png", { type: "image/png" });
        const result = await uploadReportLetterheadLogo(LETTERHEAD_ID, file);

        expect(result.storage_object_id).toBe("s1");
        const [url, init] = fetchMock.mock.calls[0];
        expect(String(url)).toContain(`/report-letterheads/${LETTERHEAD_ID}/logo`);
        expect(init.method).toBe("POST");
        expect(init.body).toBeInstanceOf(FormData);
        expect((init.body as FormData).get("file")).toBe(file);
        // No explicit Content-Type — must let the browser set the multipart boundary.
        expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
    });
});

describe("importReportLetterhead", () => {
    it("POSTs the .celuma file as multipart form data", async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: VERSION_ID }));
        vi.stubGlobal("fetch", fetchMock);

        const file = new File([JSON.stringify({ format: "celuma-letterhead" })], "x.celuma", {
            type: "application/json",
        });
        await importReportLetterhead(file);

        const [url, init] = fetchMock.mock.calls[0];
        expect(String(url)).toContain("/report-letterheads/import");
        expect((init.body as FormData).get("file")).toBe(file);
    });

    it("maps 400 (corrupt/unsupported file) to a readable message", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(jsonResponse(400, { detail: "Unsupported .celuma format version: 999" }))
        );
        const file = new File([JSON.stringify({})], "x.celuma");
        await expect(importReportLetterhead(file)).rejects.toThrow("Unsupported .celuma format version: 999");
    });
});

describe("getReportLetterhead", () => {
    it("calls GET /report-letterheads/{id}", async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: LETTERHEAD_ID }));
        vi.stubGlobal("fetch", fetchMock);
        await getReportLetterhead(LETTERHEAD_ID);
        expect(String(fetchMock.mock.calls[0][0])).toContain(`/report-letterheads/${LETTERHEAD_ID}`);
    });
});
