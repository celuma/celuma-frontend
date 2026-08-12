/**
 * Céluma 1.3, Phase 4, Block F — presentation mapping and Spanish UI copy for
 * the tenant usage dashboard.
 *
 * Every backend enum of the usage domain is translated **here and nowhere
 * else**. The six `integrity_status` values, the five `error_code` values and
 * the three integrity findings each have exactly one label, one description and
 * one semantic tone, so a component never branches on a raw backend string and
 * the copy contract stays checkable against the Block E documents.
 *
 * Kept in a plain `.ts` module, following `lib/notification_ui.ts`: the eslint
 * react-refresh rule only tolerates constant exports from a component file, and
 * having every user-facing string of the feature in one place is what makes
 * this reviewable. Icons are therefore referenced by key and resolved to a
 * single antd element in `components/usage/usage_status_icon.tsx` — one map,
 * one resolution point.
 *
 * What is deliberately **not** here: any recomputation of what the backend
 * already decided. No `billable_bytes / limit_bytes`, no
 * `active_internal_users / user_limit`, no "unlimited" inference, no clamping
 * of a displayed percentage. Those semantics are Céluma's commercial rules and
 * they live on the server (block-f-dependencies.md §10).
 */
import { parseBackendUtcDate } from "./notification_dates";
import { DEFAULT_LOCALE } from "./locale";
import type { IntegrityStatus, ReconciliationErrorCode } from "../models/tenant_usage";

// ---------------------------------------------------------------------------
// Semantic tone
// ---------------------------------------------------------------------------

/**
 * The semantic status a piece of usage information carries.
 *
 * `neutral` and `info` both mean "nothing is asserted about health" — they are
 * distinct only visually. Neither is ever green: a check that did not run must
 * not look like a check that passed.
 */
export type UsageTone = "neutral" | "info" | "pending" | "success" | "warning" | "danger";

/**
 * Ink + soft background per tone, in the Céluma status palette
 * (CELUMA_DESIGN_SYSTEM.md §3: soft background + saturated ink, never a solid
 * block). `pending` uses the brand teal rather than an off-brand blue.
 */
export const USAGE_TONE_COLORS: Record<UsageTone, { color: string; bg: string }> = {
    neutral: { color: "#6b7280", bg: "#f3f4f6" },
    info: { color: "#3b82f6", bg: "#eff6ff" },
    pending: { color: "#49b6ad", bg: "#eaf7f5" },
    success: { color: "#10b981", bg: "#ecfdf5" },
    warning: { color: "#f59e0b", bg: "#fffbeb" },
    danger: { color: "#ef4444", bg: "#fef2f2" },
};

/**
 * The ink a usage figure and its bar are drawn in.
 *
 * Identical to the tone's own colour except at `neutral`, where the brand teal
 * replaces the muted gray: a tenant comfortably under its limit is a normal,
 * active state, and the design system reserves gray for inactive things
 * (CELUMA_DESIGN_SYSTEM.md §6). Centralized so the number and the bar beside it
 * can never drift into two different colours.
 */
export function usageAccentColor(tone: UsageTone): string {
    return tone === "neutral" ? "#49b6ad" : USAGE_TONE_COLORS[tone].color;
}

/** Icon identities, resolved to antd elements by `usage_status_icon.tsx`. */
export type UsageIconKey =
    | "unverified"
    | "running"
    | "healthy"
    | "partial"
    | "warning"
    | "failed"
    | "missing"
    | "orphan"
    | "mismatch";

// ---------------------------------------------------------------------------
// integrity_status
// ---------------------------------------------------------------------------

export interface IntegrityStatusUi {
    label: string;
    /**
     * The standing description. `FAILED` overrides it per `error_code` — see
     * `reconciliationErrorMessage`, which is what the card actually renders for
     * that state.
     */
    description: string;
    tone: UsageTone;
    icon: UsageIconKey;
}

/**
 * The one mapping of the derived health summary
 * (reconciliation-read-contract.md §3).
 *
 * Two entries carry the block's load-bearing honesty rules:
 *
 * - `NOT_RUN` is **neutral, not green**. A tenant that has never been
 *   reconciled has an unverified counter, and a clean-looking card would say
 *   the opposite.
 * - `ACCOUNTING_ONLY` is **informational, not green**. The run succeeded and
 *   its accounting half is trustworthy, but the file-integrity half never
 *   executed, so its counters are `null` = "not measured", not "verified, none
 *   found".
 */
export const INTEGRITY_STATUS_UI: Record<IntegrityStatus, IntegrityStatusUi> = {
    NOT_RUN: {
        label: "Sin verificar",
        description: "Aún no se ha realizado una verificación del almacenamiento.",
        tone: "neutral",
        icon: "unverified",
    },
    RUNNING: {
        label: "Verificando…",
        description: "La verificación del almacenamiento está en curso. Esto puede tardar varios minutos.",
        tone: "pending",
        icon: "running",
    },
    HEALTHY: {
        label: "Sin incidencias detectadas",
        description:
            "La última verificación comparó los archivos almacenados con los registros de Céluma y no encontró diferencias.",
        tone: "success",
        icon: "healthy",
    },
    ACCOUNTING_ONLY: {
        label: "Uso verificado · Integridad de archivos sin verificar",
        description:
            "El cálculo de uso fue verificado, pero no se comprobó el almacenamiento de archivos.",
        tone: "info",
        icon: "partial",
    },
    WARNING: {
        label: "Se detectaron incidencias",
        description:
            "La verificación finalizó correctamente, pero encontró diferencias que conviene revisar.",
        tone: "warning",
        icon: "warning",
    },
    FAILED: {
        label: "La verificación no se completó",
        description: "La última verificación del almacenamiento no pudo finalizar.",
        tone: "danger",
        icon: "failed",
    },
};

// ---------------------------------------------------------------------------
// error_code
// ---------------------------------------------------------------------------

const RECONCILIATION_ERROR_MESSAGES: Record<ReconciliationErrorCode, string> = {
    s3_access_denied: "No fue posible acceder al almacenamiento.",
    s3_timeout: "La verificación tardó más de lo esperado.",
    s3_unavailable: "El almacenamiento no estuvo disponible durante la verificación.",
    unexpected_error: "Ocurrió un error durante la verificación.",
    stale_run_recovered: "Una verificación anterior se interrumpió y fue cerrada automáticamente.",
};

/** Shown when a run failed without a code, and for a code this build predates. */
export const RECONCILIATION_ERROR_FALLBACK = "No fue posible completar la verificación.";

/**
 * Human text for a sanitized backend error code.
 *
 * The raw code is never primary user copy: it is an operator token, and the
 * backend sends no message string precisely so that no external exception text
 * reaches a client (reconciliation-read-contract.md §4). An unrecognised value
 * falls back rather than leaking itself into the UI.
 */
export function reconciliationErrorMessage(code: ReconciliationErrorCode | null | undefined): string {
    if (!code) return RECONCILIATION_ERROR_FALLBACK;
    return RECONCILIATION_ERROR_MESSAGES[code] ?? RECONCILIATION_ERROR_FALLBACK;
}

// ---------------------------------------------------------------------------
// Integrity findings
// ---------------------------------------------------------------------------

export type IntegrityFindingKey = "missing" | "orphans" | "metadata";

export interface IntegrityFindingUi {
    label: string;
    description: string;
    tone: UsageTone;
    icon: UsageIconKey;
}

/**
 * The three findings, each with its own meaning and its own weight.
 *
 * They are **never merged into one "issues" number**: a missing object may mean
 * the loss of a clinical artifact, an orphan is a cost question, and a mismatch
 * is a stale row (block-f-dependencies.md §5). `missing` therefore carries the
 * `danger` tone while the other two are `warning`, so the strongest finding
 * reads as the strongest finding without any component deciding that.
 *
 * The copy states what was observed and stops there. The backend does not know
 * *why* an object is absent, so "archivos eliminados" would be an invented
 * cause; an orphan is not attributed to a patient and is not described as
 * deletable; a mismatch is a disagreement, not corruption.
 */
export const INTEGRITY_FINDING_UI: Record<IntegrityFindingKey, IntegrityFindingUi> = {
    missing: {
        label: "Archivos no encontrados",
        description:
            "Hay registros de archivos que no pudieron localizarse en el almacenamiento. Requieren revisión.",
        tone: "danger",
        icon: "missing",
    },
    orphans: {
        label: "Archivos sin referencia",
        description:
            "Se detectaron objetos almacenados que ya no tienen una referencia activa en Céluma.",
        tone: "warning",
        icon: "orphan",
    },
    metadata: {
        label: "Metadatos inconsistentes",
        description:
            "Algunos archivos almacenados no coinciden con la información registrada por Céluma.",
        tone: "warning",
        icon: "mismatch",
    },
};

/**
 * The order findings are rendered in: strongest first.
 *
 * Not alphabetical and not the response's field order — a possible loss of a
 * clinical artifact is read before a cost question.
 */
export const INTEGRITY_FINDING_ORDER: IntegrityFindingKey[] = ["missing", "orphans", "metadata"];

// ---------------------------------------------------------------------------
// Visual thresholds
// ---------------------------------------------------------------------------

/**
 * Where a usage bar changes colour.
 *
 * **These are presentation values and nothing else.** Phase 4 enforces no
 * limit anywhere, and Block G — not this dashboard — owns whether crossing a
 * threshold is an event worth notifying anyone about, along with the
 * idempotency that requires. Block F must never raise a toast or create a
 * notification because it happened to render 90%.
 */
export const USAGE_WARNING_PERCENT = 80;
export const USAGE_OVER_LIMIT_PERCENT = 100;

/**
 * Tone for a usage percentage: neutral below 80%, warning from 80%, danger at
 * 100% and above.
 *
 * `null` (no limit configured, or usage not initialized) is `neutral` — there
 * is no denominator, so there is nothing to be warned about.
 */
export function usageTone(percent: number | null | undefined): UsageTone {
    if (percent === null || percent === undefined || !Number.isFinite(percent)) return "neutral";
    if (percent >= USAGE_OVER_LIMIT_PERCENT) return "danger";
    if (percent >= USAGE_WARNING_PERCENT) return "warning";
    return "neutral";
}

/**
 * The **bar's** width, clamped to 0–100.
 *
 * The only clamping Block F is allowed to do, and it applies to the geometry
 * alone: a bar cannot be drawn wider than its track. The number beside it keeps
 * the backend's real value, which may exceed 100 (block-f-dependencies.md
 * §3.3).
 *
 * Prefers `usage_ratio`, the unrounded quotient the backend keeps alongside the
 * rounded percentage for exactly this kind of use.
 */
export function progressBarWidthPercent(
    percent: number | null | undefined,
    ratio?: number | null,
): number {
    const source =
        ratio !== null && ratio !== undefined && Number.isFinite(ratio) ? ratio * 100 : percent;
    if (source === null || source === undefined || !Number.isFinite(source)) return 0;
    return Math.min(100, Math.max(0, source));
}

// ---------------------------------------------------------------------------
// Number and date formatting
// ---------------------------------------------------------------------------

/**
 * The backend's percentage, rendered.
 *
 * Already rounded to 2 decimals server-side, so this only strips the trailing
 * zeros a round value would otherwise carry: `80 -> "80%"`, `120 -> "120%"`,
 * `12.34 -> "12.34%"`. **Never clamped** — 120% is a real, supported state and
 * showing "100%" there would hide it.
 *
 * Returns `null` when the percentage is absent, so a caller has to render an
 * explicit "no denominator" state rather than falling through to "0%".
 */
export function formatUsagePercent(percent: number | null | undefined): string | null {
    if (percent === null || percent === undefined || !Number.isFinite(percent)) return null;
    const formatted = new Intl.NumberFormat(DEFAULT_LOCALE, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    }).format(percent);
    return `${formatted}%`;
}

/** A whole count with es-MX grouping: `1234 -> "1,234"`. */
export function formatCount(value: number): string {
    return new Intl.NumberFormat(DEFAULT_LOCALE).format(value);
}

/**
 * A run timestamp in the viewer's own timezone: `11 ago 2026, 8:14 p.m.`
 *
 * Parsing goes through `parseBackendUtcDate`, the utility the Notification
 * Center established: these timestamps are **naive UTC** ISO strings, and
 * `new Date("2026-08-11T20:14:00")` would be read as *local* time, silently
 * shifting every run by the viewer's offset. The formatting is the readable
 * admin form rather than the notification list's `dd/mm/yyyy, hh:mm` — one
 * timestamp on a settings page reads better spelled out — and no timezone
 * offset is ever appended by hand.
 */
export function formatUsageDateTime(value: string | null | undefined): string | null {
    const date = parseBackendUtcDate(value);
    if (!date) return null;
    return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
    }).format(date);
}

// ---------------------------------------------------------------------------
// Accessible labels
// ---------------------------------------------------------------------------

/**
 * The text a screen reader gets for a usage bar.
 *
 * Progress here is never conveyed by the bar's colour or width alone — the
 * percentage is stated in words, and the state (unlimited, not yet calculated)
 * is stated when there is no percentage to give.
 */
export function storageProgressLabel(percent: number | null | undefined): string {
    const formatted = formatUsagePercent(percent);
    return formatted
        ? `${formatted} del almacenamiento utilizado`
        : "Almacenamiento sin porcentaje de uso disponible";
}

export function userProgressLabel(percent: number | null | undefined): string {
    const formatted = formatUsagePercent(percent);
    return formatted
        ? `${formatted} de usuarios internos utilizados`
        : "Usuarios internos sin porcentaje de uso disponible";
}

// ---------------------------------------------------------------------------
// Spanish copy
// ---------------------------------------------------------------------------

/**
 * "Uso y límites", not "Facturación" / "Plan de pago" / "Suscripción".
 *
 * Phase 4 measures consumption against configured limits. It has no plan
 * catalog, no checkout, no invoice link and no enforcement, so any commercial
 * wording would promise a product surface that does not exist.
 */
export const USAGE_PAGE_TITLE = "Uso y límites";
export const USAGE_PAGE_SUBTITLE =
    "Consulta el almacenamiento y los usuarios de tu laboratorio frente a los límites configurados.";

export const USAGE_REFRESH = "Actualizar";

// Storage card
export const STORAGE_CARD_TITLE = "Almacenamiento";
export const STORAGE_USED_LABEL = "Almacenamiento utilizado";
export const STORAGE_UNLIMITED = "Sin límite configurado";
export const STORAGE_NOT_CALCULATED_TITLE = "Uso aún no calculado";
export const STORAGE_NOT_CALCULATED_DESCRIPTION =
    "Verifica el uso para calcular el almacenamiento actual del laboratorio.";
/**
 * Over-limit copy. States the fact and stops: nothing in Céluma blocks an
 * upload, a user or a report for being over a limit, so "las cargas están
 * deshabilitadas" would describe enforcement that does not exist.
 */
export const STORAGE_OVER_LIMIT = "Uso por encima del límite configurado";

// Users card
export const USERS_CARD_TITLE = "Usuarios internos";
export const USERS_UNLIMITED = "Sin límite configurado";
export const USERS_OVER_LIMIT = "Uso por encima del límite configurado";
export const USERS_SECONDARY_TITLE = "Otras cuentas";
export const USERS_REGISTERED_LABEL = "Usuarios registrados";
export const USERS_PHYSICIAN_PORTAL_LABEL = "Portal de médicos";
export const USERS_PHYSICIAN_PORTAL_HINT =
    "Las cuentas del portal de médicos no se contabilizan dentro del límite de usuarios internos.";
export const USERS_REGISTERED_HINT =
    "Incluye todas las cuentas del laboratorio, activas e inactivas. El límite se calcula solo con los usuarios internos activos.";

/** Copy for the count of active internal users, e.g. "8 de 10". */
export function usersOfLimitLabel(active: number, limit: number): string {
    return `${formatCount(active)} de ${formatCount(limit)}`;
}

/** Copy for the unlimited case, e.g. "8 usuarios internos activos". */
export function activeInternalUsersLabel(active: number): string {
    return active === 1
        ? "1 usuario interno activo"
        : `${formatCount(active)} usuarios internos activos`;
}

// Reconciliation card
export const RECONCILIATION_CARD_TITLE = "Verificación del almacenamiento";
export const RECONCILIATION_CARD_SUBTITLE =
    "Compara los archivos almacenados con los registros de Céluma y corrige el conteo de uso.";
export const RECONCILIATION_VERIFY = "Verificar ahora";
export const RECONCILIATION_VERIFYING = "Verificando…";
export const RECONCILIATION_LAST_RUN = "Última verificación";
export const RECONCILIATION_NEVER_RUN = "Sin verificaciones previas";
export const RECONCILIATION_OBJECTS_CHECKED = "Archivos verificados";
export const RECONCILIATION_ALREADY_RUNNING = "Ya hay una verificación en curso.";
/**
 * The client stopped waiting. Deliberately not "La verificación falló": the
 * run is synchronous and slow, and a client-side timeout says nothing about
 * its outcome (block-f-dependencies.md §9).
 */
export const RECONCILIATION_TIMEOUT =
    "La verificación puede continuar en segundo plano. Actualizando estado…";
export const RECONCILIATION_STARTED = "Verificación completada.";

// Page-level load failure
export const USAGE_LOAD_ERROR_TITLE = "No fue posible cargar la información de uso.";
export const USAGE_LOAD_ERROR_DESCRIPTION = "Revisa tu conexión e inténtalo de nuevo.";
export const USAGE_RETRY = "Reintentar";
/**
 * Shown when a *background* read fails while data is already on screen.
 *
 * Keeping the last known values and saying so beats replacing a working page
 * with an error, and beats a toast: a failing poll fires every few seconds and
 * would otherwise spam the app — the same reasoning behind the Notification
 * Center's `COUNT_STALE_MESSAGE`.
 */
export const USAGE_STALE_MESSAGE =
    "No fue posible actualizar la información. Mostrando el último valor conocido.";
