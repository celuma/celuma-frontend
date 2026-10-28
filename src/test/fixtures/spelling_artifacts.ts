/**
 * Céluma 1.4 (#29), review R3 — finds what the spelling checker itself could
 * leak into rendered markup or saved JSON, and nothing else.
 *
 * Each pattern targets something only the checker produces: its classes, its
 * data attributes and test ids (inside a tag), the native `spellcheck` switch
 * it sets on covered controls, and the strings of its own UI (the summary and
 * the screen-reader hint, which carry no class). Clinical text or asset paths
 * that merely contain words such as "spelling" or "spellcheck" — a checkout
 * named `.worktrees-report-spelling` in an image URL, for instance — are not
 * artifacts. Patterns also match the JSON-escaped form (`=\"…\"`).
 */
export const SPELLING_ARTIFACT_PATTERNS: ReadonlyArray<{ name: string; pattern: RegExp }> = [
    { name: "checker class", pattern: /\bclass(?:Name)?=\\?["'][^"'<>]*\bceluma-spelling-[a-z-]+/g },
    { name: "checker data attribute", pattern: /<[^<>]*\sdata-spelling-[a-z-]+(?=[\s=>/])/g },
    { name: "checker test id", pattern: /<[^<>]*\sdata-testid=\\?["']spelling-[^"'\\]*/g },
    { name: "native spellcheck attribute", pattern: /<[^<>]*\sspellcheck=/gi },
    { name: "indication summary text", pattern: /\bposibles? errore?s? ortográficos?/gi },
    { name: "screen-reader hint", pattern: /Alt\+Enter muestra sugerencias/g },
];

/** Every checker artifact found in `markup` (HTML or serialized JSON), as `name: match`. */
export function spellingArtifacts(markup: string): string[] {
    return SPELLING_ARTIFACT_PATTERNS.flatMap(({ name, pattern }) =>
        [...markup.matchAll(pattern)].map((m) => `${name}: ${m[0].slice(-80)}`),
    );
}
