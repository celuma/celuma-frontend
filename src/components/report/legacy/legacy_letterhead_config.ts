import logo from "../../../images/report_logo.png";

/**
 * Historical institutional letterhead for the legacy report renderer
 * (Céluma 1.3 Phase 2, Block A, Story A4).
 *
 * These values are the A1-A8 findings from ambassador-hardcoding-inventory.md
 * (Phase 1, Workstream 4), copied here VERBATIM — not reformatted, not
 * corrected, not translated. Every report ever published under the legacy
 * renderer (schema_version absent or 1) was rendered with exactly this
 * letterhead, so it must be reproduced identically to reconstruct those
 * documents. Do NOT connect these to live Tenant/Branch data, and do NOT
 * change any value here to "fix" or "modernize" it — see
 * legacy-renderer-contract.md for why.
 */

/** A1-A4: signing physician block printed in the header of every report. */
export const LEGACY_LETTERHEAD_PHYSICIAN_NAME = "Dra. Arisbeth Villanueva Pérez.";
export const LEGACY_LETTERHEAD_PHYSICIAN_SPECIALTY =
    "Anatomía Patológica, Nefropatología y Citología Exfoliativa";
export const LEGACY_LETTERHEAD_PHYSICIAN_AFFILIATION =
    "Centro Médico Nacional de Occidente IMSS. INCMNSZ";
export const LEGACY_LETTERHEAD_PHYSICIAN_LICENSES = "DGP3833349 | DGP. ESP 6133871";

/** A5-A6: address/phone/email printed in the footer of every report. */
export const LEGACY_LETTERHEAD_FOOTER_ADDRESS =
    "Francisco Rojas González No. 654 Col. Ladrón de Guevara, Guadalajara, Jalisco, México C.P. 44600";
export const LEGACY_LETTERHEAD_FOOTER_CONTACT =
    "Tel. 33 2015 0100, 33 2015 0101. Cel. 33 2823-1959  patologiaynefropatologia@gmail.com";

/** A7: logo bitmap embedded in the footer. */
export const LEGACY_LETTERHEAD_LOGO_SRC = logo;

/** A8: header/footer/section-title ink color used throughout the legacy renderer. */
export const LEGACY_LETTERHEAD_COLOR = "#002060";
