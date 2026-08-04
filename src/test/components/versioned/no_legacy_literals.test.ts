import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Cell 1.3 Phase 2, Block C, History C7. Confirms the tenant-ambassador
// letterhead (A1-A8 in ambassador-hardcoding-inventory.md) never leaks into
// the V2 module — those literals must remain exclusively inside
// src/components/report/legacy/, frozen and untouched by this block.

const VERSIONED_DIR = join(__dirname, "..", "..", "..", "components", "report", "versioned");

const FORBIDDEN_LEGACY_LITERALS = [
    "Villanueva",
    "DGP3833349",
    "Francisco Rojas González",
    "patologiaynefropatologia",
    "#002060",
    "report_logo.png",
];

function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && /\.(ts|tsx)$/.test(entry.name))
        .map((entry) => join(dir, entry.name));
}

describe("versioned/ — no legacy tenant-ambassador literals", () => {
    const files = sourceFiles(VERSIONED_DIR);

    it("finds at least one source file to check (sanity check for the test itself)", () => {
        expect(files.length).toBeGreaterThan(0);
    });

    for (const file of files) {
        for (const literal of FORBIDDEN_LEGACY_LITERALS) {
            it(`${file.split("/").pop()} does not contain "${literal}"`, () => {
                const content = readFileSync(file, "utf-8");
                expect(content).not.toContain(literal);
            });
        }
    }
});
