import { describe, expect, it } from "vitest";
import { formatHttpError, parseFastApiDetail } from "../../lib/api_error";

describe("api_error — structured detail (catalog transfer, monthly numbering)", () => {
    it("reads the message of a {code, message} detail", () => {
        const body = JSON.stringify({ detail: { code: "numbering_code_required", message: "A code is required: automatic numbering is disabled" } });
        expect(parseFastApiDetail(body)).toBe("A code is required: automatic numbering is disabled");
        expect(formatHttpError(422, body)).toBe("A code is required: automatic numbering is disabled");
    });

    it("keeps handling string and validation-array details", () => {
        expect(parseFastApiDetail(JSON.stringify({ detail: "plain" }))).toBe("plain");
        expect(parseFastApiDetail(JSON.stringify({ detail: [{ msg: "a" }, { msg: "b" }] }))).toBe("a. b");
    });

    it("returns null for a detail object without a message", () => {
        expect(parseFastApiDetail(JSON.stringify({ detail: { code: "x" } }))).toBeNull();
    });
});
