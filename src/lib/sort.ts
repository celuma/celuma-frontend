/**
 * Céluma shared alphabetical ordering.
 *
 * `Céluma1.3-Phase1.md` §Sorting asks for two things together:
 *
 *   - "Studies and price lists appear in alphabetical order when appropriate."
 *   - "Catalogs used in selectors and autocomplete use the same criteria."
 *
 * The list *tables* already sort through `CelumaTable`'s column sorters. The
 * catalogue *selectors* did not sort at all — they rendered whatever order the
 * API returned, and no list endpoint has an `ORDER BY`. This module is the
 * "same criteria" the second bullet requires, defined once rather than pasted
 * into each combo box (Phase 5 Block C finding C-003).
 *
 * Locale comes from `DEFAULT_LOCALE` rather than a bare `localeCompare(a, b)`.
 * Phase 1 risk **R6** recorded that the app's existing `localeCompare()` call
 * sites pass no locale and therefore depend on the runtime's, which is not
 * guaranteed; at the time of writing there are 36 such sites outside `src/test`
 * and this module is the only one that passes a locale explicitly. New
 * ordering behaviour should not add to that count. Retrofitting the other 36 is
 * separate accepted debt (U2) — deliberately not attempted here, because
 * changing the collation of existing lists mid-release-validation is a wider
 * change than this remediation is scoped for.
 */
import { DEFAULT_LOCALE } from "./locale";

/**
 * Compare two user-visible strings the way a Spanish-reading user expects:
 * accents and case do not create separate buckets, so "ecografía" sorts next
 * to "Épsilon" and a lowercase name does not fall after every capitalised one.
 */
export function compareLabels(a: string, b: string): number {
    return a.localeCompare(b, DEFAULT_LOCALE, { sensitivity: "base" });
}

/**
 * A new array ordered by each item's user-visible label.
 *
 * Copies before sorting: callers routinely pass React state or a mapped view
 * of it, and `Array.prototype.sort` mutates in place. Sorting the source array
 * would reorder the state or cache the caller still holds.
 */
export function sortByLabel<T>(items: readonly T[], toLabel: (item: T) => string): T[] {
    return [...items].sort((a, b) => compareLabels(toLabel(a), toLabel(b)));
}
