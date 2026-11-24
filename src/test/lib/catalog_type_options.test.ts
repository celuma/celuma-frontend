/**
 * Céluma 1.5 (#69) — options of the study-type and sample-type selectors.
 * Synthetic catalog only.
 */
import { describe, expect, it } from "vitest";
import {
    catalogTypeMatches,
    catalogTypeOptions,
    compareCatalogTypes,
    withCurrentValue,
} from "../../lib/catalog_type_options";

/** Long names that differ only at the end, codes that disagree with the names' order, accents and case. */
const CATALOG = [
    { id: "t-07", code: "BPC-02", name: "Biopsia de piel por sacabocado, región cervical izquierda" },
    { id: "t-03", code: "BPC-01", name: "Biopsia de piel por sacabocado, región cervical derecha" },
    { id: "t-11", code: "AAA", name: "Zeta histológica" },
    { id: "t-05", code: "CIT", name: "citología cervicovaginal en base líquida" },
    { id: "t-09", code: "EPS", name: "Épsilon dérmico" },
    { id: "t-02", code: "ECO", name: "ecografía mamaria" },
    { id: "t-12", code: "BX10", name: "Biopsia" },
    { id: "t-13", code: "BX01", name: "biopsia" },
    { id: "t-14", code: "BX01", name: "Biopsia" },
];

// "Biopsia (BX01)" and "biopsia (BX01)" are equal under the collation; the exact-string tie-break settles
// them the same way every time (upper case first), and the id would settle a full duplicate.
const EXPECTED_ORDER = ["t-14", "t-13", "t-12", "t-03", "t-07", "t-05", "t-02", "t-09", "t-11"];

function shuffled<T>(items: readonly T[], seed: number): T[] {
    const out = [...items];
    let state = seed;
    for (let i = out.length - 1; i > 0; i--) {
        state = (state * 1103515245 + 12345) % 2 ** 31;
        const j = state % (i + 1);
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

describe("catalog type options — order", () => {
    it("is alphabetical by name with accents and case folded, then by code", () => {
        expect(catalogTypeOptions(CATALOG).map((o) => o.value)).toEqual(EXPECTED_ORDER);
    });

    it("does not depend on the order the API returned the catalog in", () => {
        for (const seed of [1, 7, 42, 1234, 99991]) {
            expect(catalogTypeOptions(shuffled(CATALOG, seed)).map((o) => o.value)).toEqual(EXPECTED_ORDER);
        }
        expect(catalogTypeOptions([...CATALOG].reverse()).map((o) => o.value)).toEqual(EXPECTED_ORDER);
    });

    it("is total: only the very same entry compares equal", () => {
        for (const a of CATALOG) {
            for (const b of CATALOG) {
                const result = compareCatalogTypes(a, b);
                if (a === b) expect(result).toBe(0);
                else {
                    expect(result).not.toBe(0);
                    expect(Math.sign(result)).toBe(-Math.sign(compareCatalogTypes(b, a)));
                }
            }
        }
    });

    it("labels each option with its complete name and code, and does not mutate the input", () => {
        const input = [...CATALOG];
        const options = catalogTypeOptions(input);
        expect(input).toEqual(CATALOG);
        expect(options.find((o) => o.value === "t-07")).toEqual({
            value: "t-07",
            label: "Biopsia de piel por sacabocado, región cervical izquierda (BPC-02)",
            name: "Biopsia de piel por sacabocado, región cervical izquierda",
            code: "BPC-02",
        });
    });
});

describe("catalog type options — search by name or code", () => {
    const options = catalogTypeOptions(CATALOG);
    const find = (query: string) => options.filter((o) => catalogTypeMatches(query, o)).map((o) => o.value);

    it("finds an entry by its code alone, ignoring case and separators", () => {
        expect(find("BPC-02")).toEqual(["t-07"]);
        expect(find("bpc02")).toEqual(["t-07"]);
        expect(find("eco")).toEqual(["t-02"]);
    });

    it("keeps codes literal: a code is never typo-corrected into its neighbour", () => {
        expect(find("BX10")).toEqual(["t-12"]);
        expect(find("BX01")).toEqual(["t-14", "t-13"]);
    });

    it("finds by name ignoring accents and case, and narrows with several words", () => {
        expect(find("citologia")).toEqual(["t-05"]);
        expect(find("ÉPSILON")).toEqual(["t-09"]);
        expect(find("sacabocado")).toEqual(["t-03", "t-07"]);
        expect(find("sacabocado izquierda")).toEqual(["t-07"]);
    });

    it("never matches the punctuation that only the visible label adds", () => {
        expect(find("(")).toHaveLength(options.length); // punctuation-only query = no filter, like every list
        expect(find("derecha (BPC")).toEqual(["t-03"]);
        expect(find("izquierda BPC-01")).toEqual([]); // each term must match the same entry
    });

    it("matches nothing for a missing option", () => {
        expect(catalogTypeMatches("bio", undefined)).toBe(false);
    });
});

describe("catalog type options — a saved value the flow no longer offers", () => {
    const active = catalogTypeOptions(CATALOG.slice(0, 3));

    it("is added as a disabled, labelled option in the same order", () => {
        const inactive = { id: "t-old", code: "BAJA", name: "Biopsia de piel antigua" };
        const options = withCurrentValue(active, inactive);
        const added = options.find((o) => o.value === "t-old");
        expect(added).toMatchObject({ disabled: true, inactive: true, label: "Biopsia de piel antigua (BAJA) — inactivo" });
        expect(options.map((o) => o.value)).toEqual(["t-old", "t-03", "t-07", "t-11"]);
    });

    it("changes nothing when the value is offered or unknown", () => {
        expect(withCurrentValue(active, CATALOG[0])).toBe(active);
        expect(withCurrentValue(active, undefined)).toBe(active);
        expect(withCurrentValue(active, null)).toBe(active);
    });
});
