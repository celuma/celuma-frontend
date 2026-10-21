import { describe, expect, it } from "vitest";
import {
    ACCEPT_ANY_IMAGE,
    ACCEPT_EXTENSIONS,
    sampleImageFileError,
    sampleImageUploadErrorMessage,
} from "../../lib/sample_image_formats";

const MB = 1024 * 1024;

describe("accepted formats (Céluma 1.4, #21)", () => {
    it("offers HEIC/HEIF wherever images are picked", () => {
        for (const ext of [".heic", ".heif"]) {
            expect(ACCEPT_EXTENSIONS.split(",")).toContain(ext);
            expect(ACCEPT_ANY_IMAGE.split(",")).toContain(ext);
        }
        expect(ACCEPT_ANY_IMAGE.split(",")).toContain("image/*");
    });

    it("keeps JPEG, PNG and RAW", () => {
        for (const ext of [".jpg", ".jpeg", ".png", ".cr2", ".dng"]) {
            expect(ACCEPT_EXTENSIONS.split(",")).toContain(ext);
        }
    });
});

describe("sampleImageFileError", () => {
    it("accepts HEIC in any letter case under the non-RAW limit", () => {
        for (const name of ["IMG_1.HEIC", "a.heic", "b.HEIF", "c.heif"]) {
            expect(sampleImageFileError({ name, size: 5 * MB })).toBeNull();
        }
    });

    it("applies the existing 50 MB / 500 MB limits unchanged", () => {
        expect(sampleImageFileError({ name: "a.heic", size: 51 * MB })).toBe("La imagen excede el límite de 50 MB.");
        expect(sampleImageFileError({ name: "a.jpg", size: 51 * MB })).toBe("La imagen excede el límite de 50 MB.");
        expect(sampleImageFileError({ name: "a.dng", size: 400 * MB })).toBeNull();
        expect(sampleImageFileError({ name: "a.dng", size: 501 * MB })).toBe("El archivo RAW excede el límite de 500 MB.");
    });

    it("still refuses other formats and lists HEIC among the permitted ones", () => {
        const msg = sampleImageFileError({ name: "a.gif", size: 1 });
        expect(msg).toContain("Formato no compatible");
        expect(msg).toContain(".heic");
    });
});

describe("sampleImageUploadErrorMessage", () => {
    it("shows the backend's Spanish detail for an unusable image", () => {
        const body = JSON.stringify({ detail: "No se pudo leer el archivo HEIC: está dañado o incompleto." });
        expect(sampleImageUploadErrorMessage(422, body)).toBe(
            "No se pudo leer el archivo HEIC: está dañado o incompleto."
        );
    });

    it("never dumps raw JSON or a server stack to the user", () => {
        const msg = sampleImageUploadErrorMessage(500, JSON.stringify({ detail: "Internal server error", request_id: "x" }), "Internal Server Error");
        expect(msg).toBe("No se pudo subir la imagen (500 Internal Server Error). Inténtalo de nuevo.");
        expect(sampleImageUploadErrorMessage(502, "<html>bad gateway</html>")).toContain("502");
    });

    it("ignores a non-string 422 detail (validation error arrays)", () => {
        const msg = sampleImageUploadErrorMessage(422, JSON.stringify({ detail: [{ loc: ["body"], msg: "x" }] }));
        expect(msg).toContain("422");
    });

    it("maps 413 and 403 to actionable messages", () => {
        expect(sampleImageUploadErrorMessage(413, "")).toContain("50 MB");
        expect(sampleImageUploadErrorMessage(403, "")).toContain("permiso");
    });
});
