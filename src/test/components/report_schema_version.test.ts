import { describe, expect, it } from "vitest";
import {
    CURRENT_REPORT_SCHEMA_VERSION,
    LEGACY_REPORT_SCHEMA_VERSION,
    UnsupportedReportSchemaVersionError,
    resolveReportSchemaVersion,
} from "../../components/report/report_schema_version";
import { allReportFixtures } from "../fixtures/reports";

describe("report_schema_version — constants", () => {
    it("LEGACY_REPORT_SCHEMA_VERSION is 1", () => {
        expect(LEGACY_REPORT_SCHEMA_VERSION).toBe(1);
    });

    it("CURRENT_REPORT_SCHEMA_VERSION is 2", () => {
        expect(CURRENT_REPORT_SCHEMA_VERSION).toBe(2);
    });
});

describe("resolveReportSchemaVersion — existing fixtures (Fase 1, Workstream 5)", () => {
    for (const [name, envelope] of Object.entries(allReportFixtures)) {
        it(`resolves "${name}" (no schema_version field) as legacy (1)`, () => {
            expect(resolveReportSchemaVersion(envelope.report)).toBe(LEGACY_REPORT_SCHEMA_VERSION);
        });
    }
});

describe("resolveReportSchemaVersion — absent / malformed input", () => {
    it("resolves an object with no schema_version key as legacy (1)", () => {
        expect(resolveReportSchemaVersion({ base: {}, sections: {} })).toBe(1);
    });

    it("resolves undefined as legacy (1)", () => {
        expect(resolveReportSchemaVersion(undefined)).toBe(1);
    });

    it("resolves null as legacy (1)", () => {
        expect(resolveReportSchemaVersion(null)).toBe(1);
    });

    it("resolves a non-object (string) as legacy (1)", () => {
        expect(resolveReportSchemaVersion("not-a-report")).toBe(1);
    });

    it("resolves a non-object (number) as legacy (1)", () => {
        expect(resolveReportSchemaVersion(42)).toBe(1);
    });

    it("resolves an array as legacy (1)", () => {
        expect(resolveReportSchemaVersion([])).toBe(1);
    });
});

describe("resolveReportSchemaVersion — explicit valid versions", () => {
    it("resolves schema_version: 1 as 1 (legacy renderer)", () => {
        expect(resolveReportSchemaVersion({ schema_version: 1 })).toBe(1);
    });

    it("resolves schema_version: 2 as 2 (future V2 renderer)", () => {
        expect(resolveReportSchemaVersion({ schema_version: 2 })).toBe(2);
    });
});

describe("resolveReportSchemaVersion — unsupported/invalid values throw a controlled error", () => {
    it("throws for an unknown future version number (e.g. 3)", () => {
        expect(() => resolveReportSchemaVersion({ schema_version: 3 })).toThrow(
            UnsupportedReportSchemaVersionError,
        );
    });

    it("throws for schema_version: 0 (not a valid persisted version)", () => {
        expect(() => resolveReportSchemaVersion({ schema_version: 0 })).toThrow(
            UnsupportedReportSchemaVersionError,
        );
    });

    it("throws for a negative version number", () => {
        expect(() => resolveReportSchemaVersion({ schema_version: -1 })).toThrow(
            UnsupportedReportSchemaVersionError,
        );
    });

    it("throws for a non-numeric string value ('1'), does not coerce", () => {
        expect(() => resolveReportSchemaVersion({ schema_version: "1" })).toThrow(
            UnsupportedReportSchemaVersionError,
        );
    });

    it("throws for a non-numeric value (boolean)", () => {
        expect(() => resolveReportSchemaVersion({ schema_version: true })).toThrow(
            UnsupportedReportSchemaVersionError,
        );
    });

    it("throws for a non-numeric value (object)", () => {
        expect(() => resolveReportSchemaVersion({ schema_version: {} })).toThrow(
            UnsupportedReportSchemaVersionError,
        );
    });

    it("throws for schema_version: null (present but invalid, not the same as absent)", () => {
        expect(() => resolveReportSchemaVersion({ schema_version: null })).toThrow(
            UnsupportedReportSchemaVersionError,
        );
    });

    it("throws for schema_version: NaN", () => {
        expect(() => resolveReportSchemaVersion({ schema_version: NaN })).toThrow(
            UnsupportedReportSchemaVersionError,
        );
    });

    it("error message identifies the offending value", () => {
        try {
            resolveReportSchemaVersion({ schema_version: 99 });
            expect.unreachable();
        } catch (err) {
            expect(err).toBeInstanceOf(UnsupportedReportSchemaVersionError);
            expect((err as UnsupportedReportSchemaVersionError).schemaVersion).toBe(99);
            expect((err as Error).message).toContain("99");
        }
    });
});
