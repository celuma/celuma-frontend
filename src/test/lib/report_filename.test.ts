/**
 * H-0c — the canonical PDF filename contract, frontend half.
 *
 *     official    <ORDER_CODE>-<StudyTypePascalCase>.pdf
 *     local copy  <ORDER_CODE>-<StudyTypePascalCase>-v<VERSION>-LOCAL.pdf
 *
 * SHARED_CASES is the parity table. The identical table lives in
 * `celuma-backend/tests/test_report_filename.py`; the two runtimes cannot share
 * an implementation, so they share this contract and both assert against it.
 * Any change here must be mirrored there.
 */
import { describe, expect, it } from "vitest";
import {
    buildReportPdfFilename,
    pascalCase,
    reportPdfFilenameBase,
    sanitizeOrderCode,
} from "../../lib/report_filename";

// [orderCode, studyType, version, official, local]
const SHARED_CASES: Array<[string, string, number, string, string]> = [
    ["CTM-35", "Citología Mamaria", 1,
        "CTM-35-CitologiaMamaria.pdf", "CTM-35-CitologiaMamaria-v1-LOCAL.pdf"],
    ["CTM-35", "Citología Urinaria", 2,
        "CTM-35-CitologiaUrinaria.pdf", "CTM-35-CitologiaUrinaria-v2-LOCAL.pdf"],
    ["BIO-7", "Biopsia de Riñón", 12,
        "BIO-7-BiopsiaDeRinon.pdf", "BIO-7-BiopsiaDeRinon-v12-LOCAL.pdf"],
    ["CTM-35", "  Citología   Mamaria  ", 1,
        "CTM-35-CitologiaMamaria.pdf", "CTM-35-CitologiaMamaria-v1-LOCAL.pdf"],
    ["CTM-35", 'Citología: Mamaria/Urinaria?', 1,
        "CTM-35-CitologiaMamariaUrinaria.pdf", "CTM-35-CitologiaMamariaUrinaria-v1-LOCAL.pdf"],
    ["PCR-1", "prueba PCR rápida", 3,
        "PCR-1-PruebaPCRRapida.pdf", "PCR-1-PruebaPCRRapida-v3-LOCAL.pdf"],
    ["CTM-35", "", 1, "CTM-35-Reporte.pdf", "CTM-35-Reporte-v1-LOCAL.pdf"],
    ["", "Citología Mamaria", 1,
        "SIN-ORDEN-CitologiaMamaria.pdf", "SIN-ORDEN-CitologiaMamaria-v1-LOCAL.pdf"],
];

describe("the shared filename contract", () => {
    it.each(SHARED_CASES)(
        "%s / %s -> official %s",
        (code, study, version, official, local) => {
            expect(buildReportPdfFilename(code, study)).toBe(official);
            expect(buildReportPdfFilename(code, study, { version, localCopy: true })).toBe(local);
        },
    );

    it.each(SHARED_CASES)(
        "%s / %s shares one canonical base",
        (code, study, version, official, local) => {
            // The point of the contract: the two files must look like the same
            // report. Before H-0c they were `reporte-CTM-35-v1.pdf` and
            // `Reporte Citologia Mamaria - Luigi Mario (copia local).pdf`.
            const base = reportPdfFilenameBase(code, study);
            expect(official).toBe(`${base}.pdf`);
            expect(local).toBe(`${base}-v${version}-LOCAL.pdf`);
        },
    );
});

describe("version rule", () => {
    it("never puts a version in the official filename", () => {
        for (const v of [1, 2, 12, 999]) {
            const name = buildReportPdfFilename("CTM-35", "Citología Mamaria", { version: v });
            expect(name).toBe("CTM-35-CitologiaMamaria.pdf");
            expect(name).not.toContain(`-v${v}`);
        }
    });

    it.each([
        [1, "CTM-35-CitologiaMamaria-v1-LOCAL.pdf"],
        [2, "CTM-35-CitologiaMamaria-v2-LOCAL.pdf"],
        [12, "CTM-35-CitologiaMamaria-v12-LOCAL.pdf"],
    ])("local copy v%i", (version, expected) => {
        expect(
            buildReportPdfFilename("CTM-35", "Citología Mamaria", { version, localCopy: true }),
        ).toBe(expected);
    });

    it("a local copy without a version still cannot collide with the official", () => {
        const local = buildReportPdfFilename("CTM-35", "Citología Mamaria", { localCopy: true });
        expect(local).toBe("CTM-35-CitologiaMamaria-v1-LOCAL.pdf");
        expect(local).not.toBe(buildReportPdfFilename("CTM-35", "Citología Mamaria"));
    });
});

describe("filename safety", () => {
    it.each(["/", "\\", ":", "*", "?", '"', "<", ">", "|"])(
        "never emits %s",
        (bad) => {
            const name = buildReportPdfFilename(`CT${bad}M-1`, `Citolog${bad}ia`,
                { version: 1, localCopy: true });
            expect(name).not.toContain(bad);
        },
    );

    it("makes path traversal impossible", () => {
        const name = buildReportPdfFilename("../../etc", "../passwd",
            { version: 1, localCopy: true });
        expect(name).not.toContain("/");
        expect(name).not.toContain("..");
        expect(name.endsWith("-v1-LOCAL.pdf")).toBe(true);
    });

    it("bounds a very long study type deterministically", () => {
        const long = "Citología ".repeat(40);
        const official = buildReportPdfFilename("CTM-35", long);
        const local = buildReportPdfFilename("CTM-35", long, { version: 3, localCopy: true });
        expect(official).toBe(buildReportPdfFilename("CTM-35", long));
        expect(official.endsWith(".pdf")).toBe(true);
        expect(local.endsWith("-v3-LOCAL.pdf")).toBe(true);
        expect(official.length).toBeLessThan(100);
        expect(local.length).toBeLessThan(100);
    });

    it("keeps the order code's normal hyphen", () => {
        expect(sanitizeOrderCode("CTM-35")).toBe("CTM-35");
        expect(sanitizeOrderCode("  CTM-35  ")).toBe("CTM-35");
        expect(sanitizeOrderCode("CTM//35")).toBe("CTM-35");
    });
});

describe("no patient identity in the filename", () => {
    it("cannot carry a patient name", () => {
        const name = buildReportPdfFilename("CTM-35", "Citología Mamaria",
            { version: 1, localCopy: true });
        for (const token of ["Luigi", "Mario", "luigi", "mario", "@", "paciente"]) {
            expect(name).not.toContain(token);
        }
        expect(name).toBe("CTM-35-CitologiaMamaria-v1-LOCAL.pdf");
    });

    it("does not use the report's display title", () => {
        // The old local filename came from the report title, which embeds the
        // patient name: "Reporte Citologia Mamaria - Luigi Mario".
        const name = buildReportPdfFilename("CTM-35", "Citología Mamaria",
            { version: 1, localCopy: true });
        expect(name).not.toContain("Luigi");
        expect(name).not.toContain("Mario");
    });

    it("contains no uuid or storage key", () => {
        const name = buildReportPdfFilename("CTM-35", "Citología Mamaria",
            { version: 1, localCopy: true });
        expect(name).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
        expect(name).not.toContain("reports/");
    });
});

describe("pascalCase normalization", () => {
    it.each([
        ["Citología Mamaria", "CitologiaMamaria"],
        ["Citología Urinaria", "CitologiaUrinaria"],
        ["Biopsia de Riñón", "BiopsiaDeRinon"],
        ["  Citología   Mamaria  ", "CitologiaMamaria"],
        ["", ""],
        ["   ", ""],
        // interior casing preserved, so acronyms survive
        ["ÁÉÍÓÚ ñÑ", "AEIOUNN"],
    ])("%s -> %s", (raw, expected) => {
        expect(pascalCase(raw)).toBe(expected);
    });
});
