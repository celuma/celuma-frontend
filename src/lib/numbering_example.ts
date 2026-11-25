/**
 * Céluma 1.5 (#64): a local, illustrative rendering of a numbering format — for the at-a-glance "Ejemplo" of a
 * list row only. It is NOT the estimate: the server preview (`POST /numbering/preview`) is the authority for
 * what a registration would get (occupied codes, counters, start value). This mirrors the closed grammar of
 * the API (`{BASE}`, `{BRANCH}`, `{SEQ}`, `{MM}`, `{YY}`, `{YYYY}`) and never validates; an unknown token is
 * left as written.
 */
import type { NumberingScope } from "../models/numbering";

export interface ExampleInput {
    format: string;
    sequence_min_width: number;
    /** The sequence shown: by default the start value (the first code of a new month). */
    sequence: number;
    base: string;
    scheme: "monthly" | "legacy";
    scope?: NumberingScope;
    timezone?: string;
    /** For tests: the instant whose local month is shown. */
    now?: Date;
}

/** Year and month of `now` in an IANA zone (falls back to the browser's zone if the name is unknown). */
export function monthIn(timezone: string | undefined, now: Date = new Date()): { year: number; month: number } {
    try {
        const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit" }).formatToParts(now);
        const year = Number(parts.find((p) => p.type === "year")?.value);
        const month = Number(parts.find((p) => p.type === "month")?.value);
        if (year && month) return { year, month };
    } catch {
        // unknown zone: the browser's month
    }
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

/** The branch placeholder shown in examples of a branch-scoped numbering. */
export const EXAMPLE_BRANCH = "SUC";

export function renderExample({ format, sequence_min_width, sequence, base, scheme, scope, timezone, now }: ExampleInput): string {
    if (scheme === "legacy") return `${base}-${sequence}`;
    const { year, month } = monthIn(timezone, now);
    const seq = String(Math.max(1, Math.trunc(sequence) || 1)).padStart(Math.max(1, Math.trunc(sequence_min_width) || 1), "0");
    return format
        .replace(/\{BASE\}/g, base)
        .replace(/\{BRANCH\}/g, scope === "branch" ? EXAMPLE_BRANCH : "")
        .replace(/\{SEQ\}/g, seq)
        .replace(/\{MM\}/g, String(month).padStart(2, "0"))
        .replace(/\{YYYY\}/g, String(year).padStart(4, "0"))
        .replace(/\{YY\}/g, String(year % 100).padStart(2, "0"));
}

/** "noviembre de 2026" */
export function monthLabel(year: number, month: number): string {
    return new Date(Date.UTC(year, month - 1, 15)).toLocaleDateString("es-MX", { month: "long", year: "numeric", timeZone: "UTC" });
}
