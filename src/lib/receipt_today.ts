/**
 * "Today" for the receipt date of a new sample (hotfix 1.4.3).
 *
 * The registration forms start each sample's «Fecha de recepción» on today's calendar date in the zone the
 * numbering uses for it: the branch's own zone for a branch-scoped numbering, the laboratory's numbering
 * timezone otherwise. The same visible `YYYY-MM-DD` is what the suggestion asks for and what is saved, so the
 * month of the code and the stored date can never disagree.
 */
export const DEFAULT_NUMBERING_ZONE = "America/Mexico_City";

export interface SampleNumberingZone {
    scope: "tenant" | "branch";
    timezone: string;
}

/** The calendar date (`YYYY-MM-DD`) `now` has in an IANA zone; an unknown zone falls back to the default one. */
export function todayInZone(zone: string | undefined | null, now: Date = new Date()): string {
    const format = (tz: string) =>
        new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
    try {
        return format(zone || DEFAULT_NUMBERING_ZONE);
    } catch {
        return format(DEFAULT_NUMBERING_ZONE);
    }
}

/** Same rule as the API (`NumberingSettings.zone_name`): the branch's zone only for a branch-scoped numbering. */
export function receiptZone(numbering: SampleNumberingZone | null, branchTimezone?: string | null): string {
    if (!numbering) return DEFAULT_NUMBERING_ZONE;
    return numbering.scope === "branch" && branchTimezone ? branchTimezone : numbering.timezone || DEFAULT_NUMBERING_ZONE;
}
