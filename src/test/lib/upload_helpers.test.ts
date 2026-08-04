/**
 * Unit tests for extractUploadedFile — post-Phase-2 remediation, R8/R16.
 * Covers both shapes it must handle: the raw RcFile stored directly (the
 * pattern used after the Bug 1 fix) and an Ant-managed UploadFile with
 * originFileObj populated (the shape the pre-fix code assumed always
 * applied, which caused the silent no-op).
 */
import { describe, expect, it } from "vitest";
import { extractUploadedFile } from "../../lib/upload_helpers";
import type { UploadFile } from "antd/es/upload/interface";

describe("extractUploadedFile", () => {
    it("returns the file directly when given a raw File/RcFile", () => {
        const file = new File([new Uint8Array([1])], "a.png", { type: "image/png" });
        expect(extractUploadedFile(file)).toBe(file);
    });

    it("returns null for null input", () => {
        expect(extractUploadedFile(null)).toBeNull();
    });

    it("unwraps originFileObj when given an Ant-managed UploadFile", () => {
        const inner = new File([new Uint8Array([1])], "b.png", { type: "image/png" });
        const uploadFile = { uid: "1", name: "b.png", originFileObj: inner } as unknown as UploadFile;
        expect(extractUploadedFile(uploadFile)).toBe(inner);
    });

    it("returns null for an UploadFile with no originFileObj (the historical bug's exact shape)", () => {
        const uploadFile = { uid: "1", name: "b.png" } as unknown as UploadFile;
        expect(extractUploadedFile(uploadFile)).toBeNull();
    });
});
