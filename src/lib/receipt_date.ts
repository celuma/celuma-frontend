/**
 * Receipt-date helpers for sample registration (Céluma 1.4, issue #33).
 *
 * A sample's monthly code is numbered by its RECEIPT date. The registration forms capture a calendar
 * date (`YYYY-MM-DD`) and send it AS IS: a date-only value is the laboratory's local calendar date and
 * the API interprets it in the numbering timezone. Never append a time or a `Z` offset: `…T00:00:00Z`
 * is an instant, and in a zone behind UTC (Mexico City) it is the previous evening, which moves the
 * first day of a month into the preceding month.
 */
import { z } from "zod";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const isLeapYear = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

function daysInMonth(year: number, month: number): number {
    if (month === 2) return isLeapYear(year) ? 29 : 28;
    return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/**
 * A real calendar date in `YYYY-MM-DD`. No business-year range is imposed (the API accepts any ISO date);
 * year `0000` is not a valid date. The check is arithmetic on purpose: `Date.UTC(0..99, ...)` would silently
 * coerce years 0-99 to 1900-1999.
 */
export function isValidReceiptDate(value: string | undefined | null): boolean {
    const match = DATE_RE.exec(String(value ?? ""));
    if (!match) return false;
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (year < 1 || month < 1 || month > 12 || day < 1) return false;
    return day <= daysInMonth(year, month);
}

/** Required receipt date of a NEW sample. There is no default: the user must state it. */
export const receiptDateSchema = z
    .string()
    .trim()
    .nonempty("La fecha de recepción es requerida.")
    .refine(isValidReceiptDate, "Fecha no válida (use AAAA-MM-DD).");

/** Optional collection date: independent of numbering, only its shape is checked. */
export const collectionDateSchema = z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), "Formato YYYY-MM-DD");

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** "septiembre 2026" for the period a preview reports. */
export function periodLabel(year: number, month: number): string {
    return `${MONTHS[month - 1] ?? month} ${year}`;
}
