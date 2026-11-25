/**
 * Céluma 1.5 (#84): the consequences of an erroneous-capture removal, in Spanish.
 *
 * `GET /laboratory/orders/{id}/management` and `/samples/{id}/management` return
 * `removal_consequences` as English sentences with no code
 * (`app/api/v1/order_management.py`), so each known sentence is recognized and
 * rewritten, with Spanish singular/plural for the sample and draft-report counts.
 * A line that does not apply (no samples, no draft reports) is omitted. A Spanish
 * line is kept; an unknown English one is never shown raw: it becomes one generic note.
 */
import { looksSpanish } from "./api_error";

export const UNKNOWN_CONSEQUENCE = "El retiro tiene otras consecuencias; consulta al administrador de tu laboratorio si tienes dudas.";

type Rule = [RegExp, (m: RegExpMatchArray) => string | null];

const RULES: Rule[] = [
    // Order
    [/^The order and its code are retained as an auditable record and hidden from lists, searches and portals\.?$/i,
        () => "La orden y su código se conservan como registro auditable y se ocultan de listas, búsquedas y portales."],
    [/^The code is never reused and no other order is renumbered\.?$/i,
        () => "El código no se vuelve a usar y ninguna otra orden se renumera."],
    [/^(\d+) sample\(s\) are removed with the order; their images stay in storage\.?$/i, (m) => {
        const n = Number(m[1]);
        if (n === 0) return null;
        return n === 1
            ? "Se retira 1 muestra con la orden; sus imágenes se conservan en el almacenamiento."
            : `Se retiran ${n} muestras con la orden; sus imágenes se conservan en el almacenamiento.`;
    }],
    [/^Its invoice is kept in the database and hidden from billing; nothing is refunded or voided\.?$/i,
        () => "Su factura se conserva en la base de datos y se oculta de facturación; no se reembolsa ni se anula nada."],
    [/^(\d+) draft report\(s\) with no review history are kept and hidden with the order\.?$/i, (m) => {
        const n = Number(m[1]);
        if (n === 0) return null;
        return n === 1
            ? "Se conserva 1 reporte en borrador sin historial de revisión y se oculta junto con la orden."
            : `Se conservan ${n} reportes en borrador sin historial de revisión y se ocultan junto con la orden.`;
    }],
    // Sample
    [/^The sample and its code are retained as an auditable record and hidden from lists and searches\.?$/i,
        () => "La muestra y su código se conservan como registro auditable y se ocultan de listas y búsquedas."],
    [/^Automatic numbering will not reuse this code\. Images stay in storage\.?$/i,
        () => "La numeración automática no volverá a usar este código. Las imágenes se conservan en el almacenamiento."],
    [/^The order keeps its other samples; its status is recalculated\.?$/i,
        () => "La orden conserva sus demás muestras y su estado se recalcula."],
];

/** The Spanish consequences to list in the removal dialog, in the API's order. */
export function removalConsequences(lines: readonly string[]): string[] {
    const out: string[] = [];
    let unknown = false;
    for (const raw of lines) {
        const line = (raw ?? "").trim();
        if (!line) continue;
        const rule = RULES.find(([pattern]) => pattern.test(line));
        if (rule) {
            const text = rule[1](line.match(rule[0])!);
            if (text) out.push(text);
        } else if (looksSpanish(line)) {
            out.push(line);
        } else {
            unknown = true;
        }
    }
    if (unknown) out.push(UNKNOWN_CONSEQUENCE);
    return out;
}
