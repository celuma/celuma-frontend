/**
 * Neutral Céluma defaults for optional fields of a valid V2 rendering
 * snapshot (Céluma 1.3 Fase 2, Bloque C, Historia C1/C3). These are UI
 * fallbacks applied ONLY to `null`/absent optional fields inside an
 * otherwise-valid `ReportRenderingSnapshotV2` — never used to reinterpret an
 * invalid snapshot (see report_snapshot_validation.ts, which rejects those
 * before this module is ever consulted).
 *
 * Deliberately contains no tenant-embajador data: no physician names, no
 * professional licenses, no addresses, no phone numbers, no client emails,
 * and none of the legacy letterhead ink color or bitmap asset (see
 * legacy_letterhead_config.ts for those — this module must never reference
 * them, literally or otherwise; enforced by no_legacy_literals.test.ts).
 * See versioned-renderer-v2-contract.md for the full rationale of each
 * default chosen here.
 */
import celumaIsotipo from "../../../images/celuma-isotipo.png";
import { tokens } from "../../design/tokens";

/** Neutral isotype shown in the header/footer when no logo is configured
 *  and none was resolved from `logo_storage_id`. Same generic Céluma asset
 *  already used across the app chrome (login, sidebar) — not the
 *  report-specific bitmap the legacy renderer embeds unconditionally. */
export const DEFAULT_NEUTRAL_LOGO_SRC = celumaIsotipo;

/** Shown in the header when `institution_name` is null — identifies the
 *  platform, not a specific lab/physician, so it never impersonates a
 *  tenant's own branding. */
export const DEFAULT_INSTITUTION_NAME = "Céluma";

/** Shown in the footer when `custom_text` is null and the footer is enabled.
 *  Generic confidentiality notice — never a fabricated address/phone/email. */
export const DEFAULT_FOOTER_TEXT = "Documento generado en Céluma.";

/** Ink color used for header/footer text when nothing else applies. Backend
 *  already defaults `style.primary_color` to "#4A4A4A" for every valid
 *  snapshot (never null), so this is a defensive fallback only — never the
 *  legacy ink color, and never teal `#49b6ad` (too vivid for document ink). */
export const DEFAULT_PRIMARY_COLOR = "#4A4A4A";

/** Body text color, matching the design system's neutral document ink. */
export const NEUTRAL_TEXT_COLOR = tokens.textPrimary;
