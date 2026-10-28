/**
 * Céluma 1.4 (#29), review R3 — the artifact detector used by the
 * serialization/rendering assertions must ignore legitimate text and paths
 * and still find every real checker artifact. Synthetic markup only.
 */
import { describe, expect, it } from "vitest";
import { spellingArtifacts } from "../fixtures/spelling_artifacts";

describe("spellingArtifacts", () => {
    it("ignores clinical text and asset paths that merely contain 'spelling' or 'spellcheck'", () => {
        const legitimate = [
            // The reviewer's checkout name inside Vite's logo URL (the original false positive).
            '<img src="/@fs/home/rafael/.worktrees-report-spelling/src/assets/celuma-isotipo.png" alt="Logo">',
            '<img src="/synthetic-assets/report-spelling/figura-spelling.png" alt="Figura 1">',
            "<p>Control sintético de spelling y spellcheck.</p>",
            '<div data-testid="report-figure-fig-1" class="report-section">Diagnóstico</div>',
            JSON.stringify({ title: "Spelling bee (sintético)", report: { sections: { notas: { content: "spellcheck=no aplica" } } } }),
        ].join("\n");
        expect(spellingArtifacts(legitimate)).toEqual([]);
    });

    it("finds each real checker artifact, in HTML and in JSON-escaped HTML", () => {
        const leaks = [
            '<div aria-hidden="true" class="celuma-spelling-layer" data-testid="spelling-mirror">x</div>',
            '<span data-spelling-mark="11:19:pacietne">pacietne</span>',
            "<div data-spelling-underline style=\"left:0\"></div>",
            '<textarea spellcheck="false"></textarea>',
            '<span id=":r1:">1 posible error ortográfico: pacietne. Alt+Enter muestra sugerencias.</span>',
        ];
        for (const leak of leaks) {
            expect(spellingArtifacts(leak), leak).not.toEqual([]);
            expect(spellingArtifacts(JSON.stringify({ content: leak })), `JSON ${leak}`).not.toEqual([]);
        }
        expect(spellingArtifacts(leaks[1])).toEqual(["checker data attribute: <span data-spelling-mark"]);
        expect(spellingArtifacts("<div class=\"x celuma-spelling-popover\"></div>")[0]).toMatch(/^checker class: /);
    });
});
