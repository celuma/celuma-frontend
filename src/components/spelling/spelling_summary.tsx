import type { CSSProperties } from "react";
import { tokens } from "../design/tokens";
import { indicationCountText, SPELLING_MARK_COLOR, useSpellingApi, useSpellingGroup } from "./spelling_context";

const linkButton: CSSProperties = {
    border: "none",
    background: "transparent",
    padding: "0 2px",
    color: "#1f6f69",
    fontWeight: 600,
    fontSize: 12,
    cursor: "pointer",
    textDecoration: "underline",
    textUnderlineOffset: 2,
};

/**
 * Céluma 1.4 (#29) — per-field (or per-table) spelling summary: the
 * non-pointer route to the indications. Shows nothing while there is nothing
 * to say; "Revisar" opens the first indication with keyboard focus.
 */
export function SpellingSummary({ groupId, style }: { groupId: string; style?: CSSProperties }) {
    const api = useSpellingApi();
    const { entries, partial } = useSpellingGroup(groupId);
    if (!api?.enabled || (entries.length === 0 && !partial)) return null;
    const countText = indicationCountText(entries.length);
    return (
        <div
            className="celuma-spelling-summary"
            data-testid={`spelling-summary-${groupId}`}
            style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, fontSize: 12, color: tokens.textSecondary, ...style }}
        >
            {entries.length > 0 && (
                <>
                    <span
                        aria-hidden="true"
                        style={{
                            display: "inline-block",
                            width: 14,
                            height: 6,
                            borderBottom: `2px dotted ${SPELLING_MARK_COLOR}`,
                            transform: "translateY(-3px)",
                        }}
                    />
                    <span>{countText}</span>
                    <button
                        type="button"
                        style={linkButton}
                        aria-label={`Revisar ortografía: ${countText}`}
                        onClick={() => api.openGroup(groupId)}
                    >
                        Revisar
                    </button>
                </>
            )}
            {partial && <span>Revisión parcial: parte del texto no se revisó por su extensión.</span>}
        </div>
    );
}

/**
 * Shown once in the editor when the local checker cannot run. Editing, saving
 * and every clinical action keep working; nothing falls back to the browser's
 * or the operating system's checker.
 */
export function SpellingStatusNotice() {
    const api = useSpellingApi();
    if (!api?.enabled || api.status !== "unavailable") return null;
    return (
        <div
            role="status"
            className="celuma-spelling-summary"
            data-testid="spelling-unavailable"
            style={{
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 8,
                fontSize: 12.5,
                color: tokens.textSecondary,
                background: "#fafbfc",
                border: "1px solid #eef1f0",
                borderRadius: 10,
                padding: "6px 10px",
            }}
        >
            <span>
                La revisión ortográfica local no está disponible en este momento. Puedes seguir editando y guardando con normalidad.
            </span>
            <button type="button" style={linkButton} onClick={() => api.retry()}>
                Reintentar
            </button>
        </div>
    );
}
