/**
 * Céluma 1.5 (#69) — options for the study-type and sample-type selectors.
 *
 * Laboratories keep long catalogs whose names differ only near the end
 * ("Biopsia de piel por sacabocado, región cervical derecha" / "… izquierda").
 * Every selector of those two catalogs builds its options here so they behave
 * the same in reception and in configuration:
 *
 *  - **Order.** Alphabetical by name with the shared C-003 collation
 *    (`compareLabels`), then by code, then by the exact strings and the id.
 *    The tie-breakers make the order total, so two options never swap places
 *    because the API returned them in another order.
 *  - **Search.** By name *or* code, with the shared list matcher
 *    (`matchesQuery`): accent/case/separator-insensitive, codes are literal,
 *    multi-word queries are AND-matched. The visible label is only used for
 *    display, so a query never matches the punctuation of "Nombre (CÓDIGO)".
 *  - **Eligibility stays with the caller.** This module never adds or hides a
 *    catalog entry by itself: callers pass the entries their flow allows (the
 *    active ones). `withCurrentValue` only keeps an already saved, no longer
 *    eligible value readable, as a disabled option.
 */
import { matchesQuery } from "./search";
import { compareLabels } from "./sort";

/** The part of a study type or sample type the selectors need. */
export interface CatalogTypeLike {
    id: string;
    code: string;
    name: string;
}

export interface CatalogTypeOption {
    value: string;
    /** Plain-text label, "Nombre (CÓDIGO)": the accessible name and the closed field's tooltip. */
    label: string;
    name: string;
    code: string;
    /** A saved value the flow no longer offers (see `withCurrentValue`). */
    disabled?: boolean;
    inactive?: boolean;
}

function compareExact(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

/** Total, input-order-independent ordering of catalog types (see the module comment). */
export function compareCatalogTypes(a: CatalogTypeLike, b: CatalogTypeLike): number {
    return (
        compareLabels(a.name, b.name) ||
        compareLabels(a.code, b.code) ||
        compareExact(a.name, b.name) ||
        compareExact(a.code, b.code) ||
        compareExact(a.id, b.id)
    );
}

export function catalogTypeLabel(item: Pick<CatalogTypeLike, "code" | "name">): string {
    return `${item.name} (${item.code})`;
}

function toOption(item: CatalogTypeLike, inactive = false): CatalogTypeOption {
    const option: CatalogTypeOption = { value: item.id, label: catalogTypeLabel(item), name: item.name, code: item.code };
    if (inactive) {
        option.label = `${option.label} — inactivo`;
        option.disabled = true;
        option.inactive = true;
    }
    return option;
}

/** Selector options for `items`, in the stable alphabetical order. Does not mutate `items`. */
export function catalogTypeOptions(items: readonly CatalogTypeLike[]): CatalogTypeOption[] {
    return [...items].sort(compareCatalogTypes).map((item) => toOption(item));
}

/**
 * Keep a saved value readable when the flow no longer offers it (for example a
 * price whose study type was deactivated): it is added as a *disabled* option,
 * so it can stay selected but cannot be picked again. Without it the field
 * showed the raw id. Returns `options` unchanged when there is nothing to add.
 */
export function withCurrentValue(
    options: CatalogTypeOption[],
    current: CatalogTypeLike | null | undefined,
): CatalogTypeOption[] {
    if (!current || options.some((option) => option.value === current.id)) return options;
    const asType = (option: CatalogTypeOption): CatalogTypeLike => ({ id: option.value, code: option.code, name: option.name });
    return [...options, toOption(current, true)].sort((a, b) => compareCatalogTypes(asType(a), asType(b)));
}

/** Whether `query` finds `option` by its name or its code. */
export function catalogTypeMatches(query: string, option: Pick<CatalogTypeOption, "name" | "code"> | undefined): boolean {
    if (!option) return false;
    return matchesQuery([option.name, option.code], query);
}
