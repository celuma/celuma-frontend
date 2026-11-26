import { createRoot } from "react-dom/client";
import { useState } from "react";
import CelumaRichText from "../../src/components/ui/celuma_rich_text";
import { LIST_LAYOUT_HTML } from "../../src/test/fixtures/reports/versioned_v2";

/**
 * Céluma 1.5 (#61) — real-browser harness for the rich-text EDITOR alone.
 * Mounts the unmodified CelumaRichText (real Quill, real toolbar and styles)
 * with synthetic content shared with the report fixtures, so the editor and
 * the rendered report can be measured on identical HTML. No API, no backend.
 * Never bundled into the production app.
 *
 * Usage: /rich_text_editor.html?content=lists
 */
const CONTENT: Record<string, string> = {
    lists: LIST_LAYOUT_HTML,
};

const key = new URLSearchParams(window.location.search).get("content") ?? "lists";

function Harness() {
    const [value, setValue] = useState(CONTENT[key] ?? "");
    return (
        <div data-ready="true">
            <CelumaRichText value={value} onChange={(html) => setValue(html)} />
        </div>
    );
}

createRoot(document.getElementById("root")!).render(<Harness />);
