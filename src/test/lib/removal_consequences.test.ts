/**
 * Céluma 1.5 (#84): the "Retirar orden" / "Retirar muestra" consequences are shown in
 * Spanish. The English lines here are exactly the ones `app/api/v1/order_management.py`
 * returns (synthetic counts).
 */
import { describe, expect, it } from "vitest";
import { UNKNOWN_CONSEQUENCE, removalConsequences } from "../../lib/removal_consequences";

const orderLines = (samples: number, reports: number) => {
    const lines = [
        "The order and its code are retained as an auditable record and hidden from lists, searches and portals.",
        "The code is never reused and no other order is renumbered.",
        `${samples} sample(s) are removed with the order; their images stay in storage.`,
        "Its invoice is kept in the database and hidden from billing; nothing is refunded or voided.",
    ];
    if (reports) lines.push(`${reports} draft report(s) with no review history are kept and hidden with the order.`);
    return lines;
};

const SAMPLE_LINES = [
    "The sample and its code are retained as an auditable record and hidden from lists and searches.",
    "Automatic numbering will not reuse this code. Images stay in storage.",
    "The order keeps its other samples; its status is recalculated.",
];

describe("removalConsequences — order", () => {
    it("translates every line, keeping its meaning and the API's order", () => {
        expect(removalConsequences(orderLines(2, 2))).toEqual([
            "La orden y su código se conservan como registro auditable y se ocultan de listas, búsquedas y portales.",
            "El código no se vuelve a usar y ninguna otra orden se renumera.",
            "Se retiran 2 muestras con la orden; sus imágenes se conservan en el almacenamiento.",
            "Su factura se conserva en la base de datos y se oculta de facturación; no se reembolsa ni se anula nada.",
            "Se conservan 2 reportes en borrador sin historial de revisión y se ocultan junto con la orden.",
        ]);
    });

    it("uses the singular for one sample and one draft report", () => {
        const lines = removalConsequences(orderLines(1, 1));
        expect(lines).toContain("Se retira 1 muestra con la orden; sus imágenes se conservan en el almacenamiento.");
        expect(lines).toContain("Se conserva 1 reporte en borrador sin historial de revisión y se oculta junto con la orden.");
    });

    it("omits the draft-report line when there is none (the API does not send it)", () => {
        const lines = removalConsequences(orderLines(3, 0));
        expect(lines).toHaveLength(4);
        expect(lines.some((l) => l.includes("reporte"))).toBe(false);
    });

    it("omits a line whose count is zero", () => {
        const lines = removalConsequences(orderLines(0, 0));
        expect(lines.some((l) => l.includes("muestra"))).toBe(false);
        expect(removalConsequences(["0 draft report(s) with no review history are kept and hidden with the order."])).toEqual([]);
    });

    it("never shows English", () => {
        for (const line of removalConsequences(orderLines(4, 3))) {
            expect(line).not.toMatch(/\b(the|order|sample|invoice|report)\b/i);
        }
    });
});

describe("removalConsequences — sample", () => {
    it("translates the sample removal lines", () => {
        expect(removalConsequences(SAMPLE_LINES)).toEqual([
            "La muestra y su código se conservan como registro auditable y se ocultan de listas y búsquedas.",
            "La numeración automática no volverá a usar este código. Las imágenes se conservan en el almacenamiento.",
            "La orden conserva sus demás muestras y su estado se recalcula.",
        ]);
    });
});

describe("removalConsequences — lines it does not know", () => {
    it("keeps a Spanish line as is", () => {
        expect(removalConsequences(["La orden deja de aparecer en el portal del médico."]))
            .toEqual(["La orden deja de aparecer en el portal del médico."]);
    });

    it("replaces unknown English lines with one generic note", () => {
        expect(removalConsequences([
            "The code is never reused and no other order is renumbered.",
            "Something new happens to the order.",
            "And something else happens too.",
        ])).toEqual([
            "El código no se vuelve a usar y ninguna otra orden se renumera.",
            UNKNOWN_CONSEQUENCE,
        ]);
    });

    it("ignores empty lines and an empty list", () => {
        expect(removalConsequences(["", "   "])).toEqual([]);
        expect(removalConsequences([])).toEqual([]);
    });
});
