/**
 * Tests for the report-template-version service functions in
 * report_service.ts (Céluma 1.3 Phase 2, Block D, Story D3/D13/D14).
 *
 * No fetch mocking convention existed in this codebase yet — this
 * establishes one: `vi.stubGlobal("fetch", ...)` per test, asserting both
 * the request shape (URL/method/headers/body) and the response handling
 * (success + 401/403/404/409/422/network-failure mapping).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    listReportTemplateVersions,
    getReportTemplateVersion,
    createReportTemplateVersion,
    activateReportTemplateVersion,
    archiveReportTemplateVersion,
    uploadReportTemplateLogo,
} from "../../services/report_service";

function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

const TEMPLATE_ID = "11111111-1111-1111-1111-111111111111";
const VERSION_ID = "22222222-2222-2222-2222-222222222222";

beforeEach(() => {
    localStorage.setItem("auth_token", "Bearer test-token");
});

afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
});

describe("listReportTemplateVersions", () => {
    it("calls GET /templates/{id}/versions and returns the parsed body", async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            jsonResponse(200, { versions: [{ id: VERSION_ID, status: "PUBLISHED" }] })
        );
        vi.stubGlobal("fetch", fetchMock);

        const result = await listReportTemplateVersions(TEMPLATE_ID);

        expect(result.versions).toHaveLength(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(String(url)).toContain(`/reports/templates/${TEMPLATE_ID}/versions`);
        expect(init.method).toBe("GET");
    });

    it("maps 403 to a permission message", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(403, { detail: "Permission required: reports:manage_templates" })));
        await expect(listReportTemplateVersions(TEMPLATE_ID)).rejects.toThrow(
            "Permission required: reports:manage_templates"
        );
    });

    it("maps 404 to a not-found message", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(404, { detail: "Template not found" })));
        await expect(listReportTemplateVersions(TEMPLATE_ID)).rejects.toThrow("Template not found");
    });

    it("surfaces a network error distinctly", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
        await expect(listReportTemplateVersions(TEMPLATE_ID)).rejects.toThrow(/red/i);
    });
});

describe("getReportTemplateVersion", () => {
    it("calls GET /templates/{id}/versions/{versionId}", async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            jsonResponse(200, { id: VERSION_ID, configuration: { schema_version: 2 } })
        );
        vi.stubGlobal("fetch", fetchMock);

        const result = await getReportTemplateVersion(TEMPLATE_ID, VERSION_ID);
        expect(result.id).toBe(VERSION_ID);
        expect(String(fetchMock.mock.calls[0][0])).toContain(`/versions/${VERSION_ID}`);
    });
});

describe("createReportTemplateVersion", () => {
    it("POSTs the configuration as JSON", async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            jsonResponse(200, { id: VERSION_ID, status: "PUBLISHED", version_number: 1 })
        );
        vi.stubGlobal("fetch", fetchMock);

        const payload = { configuration: { schema_version: 2 as const } };
        const result = await createReportTemplateVersion(TEMPLATE_ID, payload);

        expect(result.status).toBe("PUBLISHED");
        const [url, init] = fetchMock.mock.calls[0];
        expect(String(url)).toContain(`/reports/templates/${TEMPLATE_ID}/versions`);
        expect(init.method).toBe("POST");
        expect(init.headers["Content-Type"]).toBe("application/json");
        expect(JSON.parse(init.body)).toEqual(payload);
    });

    it("maps 422 to a validation message", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                jsonResponse(422, { detail: [{ msg: "margins_cm.top: must be >= 0.5" }] })
            )
        );
        await expect(
            createReportTemplateVersion(TEMPLATE_ID, { configuration: {} })
        ).rejects.toThrow("margins_cm.top");
    });
});

describe("activateReportTemplateVersion / archiveReportTemplateVersion", () => {
    it("POSTs to the activate endpoint", async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: VERSION_ID, status: "ACTIVE" }));
        vi.stubGlobal("fetch", fetchMock);

        const result = await activateReportTemplateVersion(TEMPLATE_ID, VERSION_ID);
        expect(result.status).toBe("ACTIVE");
        expect(String(fetchMock.mock.calls[0][0])).toContain(`/versions/${VERSION_ID}/activate`);
    });

    it("maps 409 on archive to a conflict message", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                jsonResponse(409, { detail: "Cannot archive the active version. Activate a replacement version first." })
            )
        );
        await expect(archiveReportTemplateVersion(TEMPLATE_ID, VERSION_ID)).rejects.toThrow(
            "Cannot archive the active version"
        );
    });
});

describe("uploadReportTemplateLogo", () => {
    it("sends the file as multipart form data without a Content-Type header", async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            jsonResponse(200, {
                storage_object_id: "33333333-3333-3333-3333-333333333333",
                url: "https://cdn.example/logo.png",
                content_type: "image/png",
                size_bytes: 1234,
            })
        );
        vi.stubGlobal("fetch", fetchMock);

        const file = new File([new Uint8Array([1, 2, 3])], "logo.png", { type: "image/png" });
        const result = await uploadReportTemplateLogo(TEMPLATE_ID, file);

        expect(result.content_type).toBe("image/png");
        const [url, init] = fetchMock.mock.calls[0];
        expect(String(url)).toContain(`/reports/templates/${TEMPLATE_ID}/logo`);
        expect(init.method).toBe("POST");
        expect(init.body).toBeInstanceOf(FormData);
        expect(init.headers["Content-Type"]).toBeUndefined();
    });

    it("maps 400 (invalid format) to the backend's message", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                jsonResponse(400, { detail: "Only PNG, JPEG, or WEBP images are allowed (SVG is not supported)" })
            )
        );
        const file = new File([new Uint8Array([1])], "logo.svg", { type: "image/svg+xml" });
        await expect(uploadReportTemplateLogo(TEMPLATE_ID, file)).rejects.toThrow("SVG is not supported");
    });

    it("maps 401 to a session-expired message", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, {})));
        const file = new File([new Uint8Array([1])], "logo.png", { type: "image/png" });
        await expect(uploadReportTemplateLogo(TEMPLATE_ID, file)).rejects.toThrow(/sesión/i);
    });
});
