/**
 * Céluma 1.3, Phase 4, Block F — the one byte formatter.
 *
 * The backend's accounting contract is one unit deep: every storage value on
 * the wire is a plain count of bytes, and the API never sends a formatted
 * string (usage-response-semantics.md §2). Turning those into human units is
 * purely a display decision, and this module is where it is made — once.
 *
 * ## Decimal units, deliberately
 *
 * Céluma had no byte formatter before this block, so there was no existing
 * convention to inherit and the choice had to be made explicitly:
 *
 *     1 KB = 1,000 bytes        1 GB = 1,000,000,000 bytes
 *     1 MB = 1,000,000 bytes    1 TB = 1,000,000,000,000 bytes
 *
 * **Decimal**, because the surface these numbers appear on is a commercial
 * plan/administration screen. A tenant's configured limit is a commercial
 * quantity communicated the way storage plans are sold and the way the cloud
 * bill states them — "1 TB" should read as the round number an administrator
 * was quoted, not as `0.91 TiB`. Binary units would be the right call for a
 * memory or filesystem readout; this is neither.
 *
 * This changes nothing about accounting. The backend keeps counting bytes, the
 * limits keep being stored in bytes, and both sides of the ratio are computed
 * server-side from those bytes — the divisor chosen here only affects the
 * string a human reads.
 *
 * ## es-MX formatting
 *
 * Mexican Spanish uses `.` for decimals and `,` for thousands, the same as the
 * `toFixed(2)` money formatting already shipping in the billing pages, so the
 * two surfaces read consistently.
 */
import { DEFAULT_LOCALE } from "./locale";

/** Decimal step. See the module docstring for why this is 1000 and not 1024. */
const STEP = 1000;

const UNITS = ["B", "KB", "MB", "GB", "TB", "PB"] as const;

/** Rendered wherever a byte count is absent — never "0 B". */
export const UNKNOWN_BYTES_LABEL = "Sin calcular";

/**
 * Formats a byte count into decimal units: `0 B`, `999 B`, `127.9 MB`, `1 TB`.
 *
 * Deterministic by construction: the unit is the largest whose value is at
 * least 1, the magnitude is rounded to one decimal, and a trailing `.0` is
 * dropped so a round number reads as one (`1 TB`, not `1.0 TB`). Bytes
 * themselves are never fractional.
 *
 * `null` / `undefined` return `UNKNOWN_BYTES_LABEL`. That is the whole point of
 * the null-preserving model: a caller must never be able to turn "not
 * calculated" into "0 B" by passing it here.
 */
export function formatBytes(value: number | null | undefined): string {
    if (value === null || value === undefined || !Number.isFinite(value)) {
        return UNKNOWN_BYTES_LABEL;
    }

    const negative = value < 0;
    const magnitude = Math.abs(value);

    let unitIndex = 0;
    let scaled = magnitude;
    while (scaled >= STEP && unitIndex < UNITS.length - 1) {
        scaled /= STEP;
        unitIndex += 1;
    }

    // Bytes are whole; every larger unit gets at most one decimal.
    const decimals = unitIndex === 0 ? 0 : 1;
    const rounded = Number(scaled.toFixed(decimals));

    // Rounding can push a value up into the next unit (999.95 MB -> 1000.0 MB).
    if (rounded >= STEP && unitIndex < UNITS.length - 1) {
        return `${negative ? "-" : ""}1 ${UNITS[unitIndex + 1]}`;
    }

    const formatted = new Intl.NumberFormat(DEFAULT_LOCALE, {
        minimumFractionDigits: 0,
        maximumFractionDigits: decimals,
    }).format(rounded);

    return `${negative ? "-" : ""}${formatted} ${UNITS[unitIndex]}`;
}
