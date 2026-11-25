/**
 * Céluma 1.5 (#64): constants and helpers of the numbering screens (kept out of the component files so
 * React fast refresh keeps working). Presentation only; every rule is the API's.
 */
import { composeFormat, type NumberingScope } from "../models/numbering";

/** Accessible teal ink for small text on light surfaces (brand system: 4.9:1 on white). */
export const TEAL_INK = "#1f7a75";
export const TEAL_TINT = "#eaf7f5";

export type Separator = "none" | "hyphen" | "custom";

export function detectSeparator(format: string, scope: NumberingScope): Separator {
    if (format === composeFormat("none", scope)) return "none";
    if (format === composeFormat("hyphen", scope)) return "hyphen";
    return "custom";
}

/** Focus ring for the bare disclosure button, consistent with the Céluma teal ring. */
export const NUMBERING_CSS = `
.celuma-disclosure:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(73,182,173,.35); }
.celuma-numbering button:focus-visible, .celuma-numbering [role="switch"]:focus-visible {
    /* !important: antd's CSS-in-JS focus outline is more specific; this stays scoped to the numbering screens. */
    outline: 2px solid #1f7a75 !important; outline-offset: 2px !important; box-shadow: 0 0 0 4px rgba(73,182,173,.25) !important;
}
.celuma-numbering-grid { display: grid; gap: 20px; grid-template-columns: minmax(0, 1fr); }
@media (min-width: 900px) { .celuma-numbering-grid.two { grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); align-items: start; } }
`;

export const TOKEN_HELP =
    "Variables: {BASE} código del tipo, {BRANCH} sucursal (solo con alcance por sucursal), {SEQ} consecutivo, {MM} mes, " +
    "{YY} o {YYYY} año. Cada una aparece una vez. Entre variables solo se permiten letras, números, '.', '_' y '-'.";
