/**
 * Céluma 1.4 (#13): signing and reopening send the user's own current
 * password, and a refused confirmation surfaces as a typed
 * `PasswordConfirmationError` (nothing changed on the server) rather than a
 * generic failure.
 *
 * Follows the fetch-mocking convention of report_pdf_service.test.ts. The
 * passwords are synthetic.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    PasswordConfirmationError,
    cancelReportAmendment,
    getReportEmissions,
    isPasswordConfirmationError,
    openReportAmendment,
    reopenReport,
    signAndPublishReport,
    signReport,
} from "../../services/report_service";

const REPORT_ID = "11111111-1111-1111-1111-111111111111";
const PASSWORD = "synthetic-confirmation";

function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

const ROUTES = [
    {
        name: "signAndPublishReport",
        call: () => signAndPublishReport(REPORT_ID, { password: PASSWORD }),
        path: `/api/v1/reports/${REPORT_ID}/sign-and-publish`,
    },
    {
        name: "signReport",
        call: () => signReport(REPORT_ID, { password: PASSWORD }),
        path: `/api/v1/reports/${REPORT_ID}/sign`,
    },
    {
        name: "reopenReport",
        call: () => reopenReport(REPORT_ID, { password: PASSWORD, changelog: "Membrete incorrecto" }),
        path: `/api/v1/reports/${REPORT_ID}/reopen`,
    },
    // Céluma 1.4 (#13): amendments.
    {
        name: "openReportAmendment",
        call: () => openReportAmendment(REPORT_ID, { category: "SUPPLEMENT", reason: "IHC posterior", password: PASSWORD }),
        path: `/api/v1/reports/${REPORT_ID}/amendments`,
    },
    {
        name: "cancelReportAmendment",
        call: () => cancelReportAmendment(REPORT_ID, "amendment-1", { reason: "Se abrió por error", password: PASSWORD }),
        path: `/api/v1/reports/${REPORT_ID}/amendments/amendment-1/cancel`,
    },
];

beforeEach(() => {
    localStorage.setItem("auth_token", "Bearer test-token");
});

afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.unstubAllGlobals();
});

describe.each(ROUTES)("$name", ({ call, path }) => {
    it("sends the password in the JSON body, never in the URL", async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: REPORT_ID, status: "PUBLISHED", message: "ok" }));
        vi.stubGlobal("fetch", fetchMock);

        await call();

        const [url, init] = fetchMock.mock.calls[0];
        expect(String(url)).toBe(path);
        expect(String(url)).not.toContain(PASSWORD);
        expect(init.method).toBe("POST");
        expect(JSON.parse(init.body).password).toBe(PASSWORD);
        expect(init.headers["Authorization"]).toBe("Bearer test-token");
        // Nothing is persisted on the client.
        expect(JSON.stringify({ ...localStorage })).not.toContain(PASSWORD);
        expect(JSON.stringify({ ...sessionStorage })).not.toContain(PASSWORD);
    });

    it.each([
        [403, "password_confirmation_required"],
        [403, "password_confirmation_invalid"],
        [429, "password_confirmation_throttled"],
    ])("maps %i %s to a PasswordConfirmationError", async (status, code) => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                jsonResponse(status, {
                    detail: { code, message: "Mensaje del servidor", retry_after_seconds: 120 },
                })
            )
        );

        const err = await call().catch((e: unknown) => e);
        expect(isPasswordConfirmationError(err)).toBe(true);
        expect((err as PasswordConfirmationError).code).toBe(code);
        expect((err as PasswordConfirmationError).message).toBe("Mensaje del servidor");
        expect((err as PasswordConfirmationError).retryAfterSeconds).toBe(120);
    });

    it("keeps authorization and state refusals as ordinary errors", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                jsonResponse(403, { detail: "Only the assigned reviewer can perform this action" })
            )
        );

        const err = await call().catch((e: unknown) => e);
        expect(isPasswordConfirmationError(err)).toBe(false);
        expect((err as Error).message).toBe("Only the assigned reviewer can perform this action");
    });
});

it("reopenReport sends the optional reason as changelog", async () => {
    const fetchMock = vi.fn().mockImplementation(async () =>
        jsonResponse(200, { id: REPORT_ID, status: "DRAFT", message: "ok" })
    );
    vi.stubGlobal("fetch", fetchMock);

    await reopenReport(REPORT_ID, { password: PASSWORD, changelog: "Membrete incorrecto" });
    await reopenReport(REPORT_ID, { password: PASSWORD });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
        changelog: "Membrete incorrecto",
        password: PASSWORD,
    });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ password: PASSWORD });
});

it("openReportAmendment sends category, reason and password", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse(200, { id: REPORT_ID, status: "DRAFT", message: "ok" }));
    vi.stubGlobal("fetch", fetchMock);
    await openReportAmendment(REPORT_ID, { category: "CORRECTION", reason: "Lateralidad", password: PASSWORD });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
        category: "CORRECTION", reason: "Lateralidad", password: PASSWORD,
    });
});

it("getReportEmissions reads the authorized history", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse(200, { emissions: [], amendments: [] }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await getReportEmissions(REPORT_ID)).toEqual({ emissions: [], amendments: [] });
    expect(String(fetchMock.mock.calls[0][0])).toBe(`/api/v1/reports/${REPORT_ID}/emissions`);
});
