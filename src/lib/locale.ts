/**
 * Céluma 1.3, Phase 3, Block F — the locale a presentation map is read in.
 *
 * **This is not a localization system.** Céluma's UI is Spanish, `es-MX` is
 * the only locale, and Block F adds no language selector, no translation
 * files, no i18n package and no browser-language detection — all of them are
 * explicitly out of scope.
 *
 * What it adds is a parameter. `notificationTypeLabel(type)` becomes
 * `notificationTypeLabel(type, locale)` with the locale defaulting to
 * `DEFAULT_LOCALE`, so the presentation maps are already keyed the way a
 * second locale would need. Every existing call site keeps working unchanged
 * and every rendered string is byte-identical — which is why the visual
 * goldens do not move.
 *
 * The backend counterpart is `app/services/locale.py`, and the two agree on
 * `es-MX` as the default. They are deliberately not derived from one another:
 * the backend's locale decides what a notification's frozen `title`/`body`
 * say, this one decides what the surrounding chrome says, and a notification's
 * own text is never reconstructed on the client.
 */

/** The only locale Céluma renders. */
export const DEFAULT_LOCALE = "es-MX";

export const SUPPORTED_LOCALES = [DEFAULT_LOCALE] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

/** Whether a presentation map exists for this locale. */
export function isSupportedLocale(value: string): value is Locale {
    return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/**
 * The locale a lookup should actually use.
 *
 * A well-formed but unsupported locale falls back to `DEFAULT_LOCALE`, exactly
 * as the backend's `resolve_locale` does. Unlike the backend this does not
 * *reject* a malformed value — nothing on the client interpolates a locale
 * into a path or a query, so a bad value can only miss the map and fall back.
 * Throwing here would turn a cosmetic problem into a blank Notification
 * Center.
 */
export function resolveLocale(requested?: string | null): Locale {
    if (!requested) return DEFAULT_LOCALE;
    return isSupportedLocale(requested) ? requested : DEFAULT_LOCALE;
}
