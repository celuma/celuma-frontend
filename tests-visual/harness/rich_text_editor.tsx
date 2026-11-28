import { createRoot } from "react-dom/client";
import { useState } from "react";
import CelumaRichText from "../../src/components/ui/celuma_rich_text";
import { ALIGNMENT_HTML, LINE_SPACING_HTML, LIST_LAYOUT_HTML } from "../../src/test/fixtures/reports/versioned_v2";

/**
 * Céluma 1.5 (#61, #62) — real-browser harness for the rich-text EDITOR alone.
 * Mounts the unmodified CelumaRichText (real Quill, real toolbar and styles)
 * with synthetic content shared with the report fixtures, so the editor and
 * the rendered report can be measured on identical HTML. No API, no backend.
 * Never bundled into the production app.
 *
 * `harness-html` exposes the HTML the editor would save; `harness-reopen`
 * mounts a fresh editor from that HTML, as reopening a saved draft does.
 *
 * Usage: /rich_text_editor.html?content=lists|alignment|spacing|formula
 */
const CONTENT: Record<string, string> = {
    lists: LIST_LAYOUT_HTML,
    alignment: ALIGNMENT_HTML,
    spacing: LINE_SPACING_HTML,
    // Céluma 1.5 (#95): a paragraph with one stored formula to edit, and room to insert another.
    formula: '<p>Índice: <span class="ql-formula" data-value="\\dfrac{a}{b} \\times 100"></span> = 18 %.</p>',
};

const key = new URLSearchParams(window.location.search).get("content") ?? "lists";

function Harness() {
    const [value, setValue] = useState(CONTENT[key] ?? "");
    const [mount, setMount] = useState(0);
    return (
        <div data-ready="true">
            <CelumaRichText key={mount} value={value} onChange={(html) => setValue(html)} />
            <button type="button" data-testid="harness-reopen" onClick={() => setMount((n) => n + 1)}>
                Reabrir (arnés)
            </button>
            <output data-testid="harness-html" hidden>{value}</output>
        </div>
    );
}

createRoot(document.getElementById("root")!).render(<Harness />);
