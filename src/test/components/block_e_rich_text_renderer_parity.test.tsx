/**
 * Céluma 1.3.1 Block E (CEL-131-09) — renderer / PDF / print parity for
 * rich-text lists and whitespace.
 *
 * `block_e_rich_text_render.test.ts` pins the transform itself. This file
 * proves the three surfaces that actually show a report agree, by driving the
 * real components:
 *
 *   preview + official PDF   both renderers (the PDF is this same React tree,
 *                            rendered at `/internal/report-render/...` by the
 *                            backend's headless Chromium — one code path, so
 *                            asserting the renderer asserts the PDF)
 *   local print              `useLocalPrint`, which CLONES renderer pages into
 *                            a bare iframe; a rule living in the app's
 *                            stylesheet would not survive that copy, which is
 *                            why the content rule is injected per page
 *
 * jsdom has no layout engine, so what is asserted here is structure and the
 * presence of the rule — never pixels. The Playwright golden suite
 * (`npm run test:visual`) covers appearance.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, renderHook } from "@testing-library/react";
import { createRef } from "react";
import VersionedReportRendererV2, {
    type VersionedReportRendererV2Ref,
} from "../../components/report/versioned/versioned_report_renderer_v2";
import LegacyReportRendererV1 from "../../components/report/legacy/legacy_report_renderer_v1";
import type { ReportRendererRef } from "../../components/report/legacy/legacy_report_types";
import { useLocalPrint } from "../../hooks/use_local_print";
import { RICH_TEXT_CONTENT_CLASS } from "../../components/report/rich_text_render";
import { v2CompleteBranding } from "../fixtures/reports/versioned_v2";
import { draftSingleSampleNoImages } from "../fixtures/reports";
import type { ReportEnvelope } from "../../models/report";

/**
 * AS STORED by the real Quill 2 editor: two bullets, then two numbered items,
 * then a paragraph with a run of spaces and a blank paragraph. Rendered bare,
 * all four list items were numbered 1-4.
 */
const QUILL_CONTENT =
    '<ol><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span>Fragmento A: sin alteraciones.</li>'
    + '<li data-list="bullet"><span class="ql-ui" contenteditable="false"></span>Fragmento B: sin alteraciones.</li>'
    + '<li data-list="ordered"><span class="ql-ui" contenteditable="false"></span>Primer paso.</li>'
    + '<li data-list="ordered"><span class="ql-ui" contenteditable="false"></span>Segundo paso.</li></ol>'
    + "<p>margen    libre</p><p><br></p><p>Cierre.</p>";

/** Swaps one richtext section's content, leaving everything else untouched. */
function withRichText(envelope: ReportEnvelope, sectionKey: string, content: string): ReportEnvelope {
    const report = structuredClone(envelope.report) as ReportEnvelope["report"];
    (report.sections[sectionKey] as { content: string }).content = content;
    return { ...envelope, report };
}

function renderV2(report: ReportEnvelope) {
    const ref = createRef<VersionedReportRendererV2Ref>();
    const view = render(<VersionedReportRendererV2 report={report} ref={ref} />);
    return { ...view, pages: ref.current?.getPages() ?? [], ref };
}

function renderLegacy(report: ReportEnvelope) {
    const ref = createRef<ReportRendererRef>();
    const view = render(<LegacyReportRendererV1 report={report} ref={ref} />);
    return { ...view, pages: ref.current?.getPages() ?? [], ref };
}

/** The rich-text host inside a rendered page. */
function richHosts(pages: HTMLElement[]): HTMLElement[] {
    return pages.flatMap((page) =>
        Array.from(page.querySelectorAll(`.${RICH_TEXT_CONTENT_CLASS}`)) as HTMLElement[],
    );
}

function listKindsIn(host: HTMLElement): string[] {
    return Array.from(host.children).map((el) => el.tagName.toLowerCase());
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe.each([
    ["VersionedReportRendererV2", () => renderV2(withRichText(v2CompleteBranding, "section_macroscopic", QUILL_CONTENT))],
    ["LegacyReportRendererV1", () => renderLegacy(withRichText(draftSingleSampleNoImages, "section_macroscopic", QUILL_CONTENT))],
])("CEL-131-09 — %s renders Quill lists semantically", (_name, mount) => {
    it("shows the bullet run as a <ul> and the numbered run as its own <ol>", () => {
        const { pages } = mount();
        const host = richHosts(pages).find((h) => h.textContent?.includes("Fragmento A"));
        expect(host, "rich-text host not found in the rendered page").toBeTruthy();

        expect(listKindsIn(host!)).toEqual(["ul", "ol", "p", "p", "p"]);
        expect(host!.querySelector("ul")!.querySelectorAll("li")).toHaveLength(2);
        expect(host!.querySelector("ol")!.querySelectorAll("li")).toHaveLength(2);
    });

    it("leaves no <ol> holding bullet items — the defect, asserted gone", () => {
        const { pages } = mount();
        const host = richHosts(pages).find((h) => h.textContent?.includes("Fragmento A"))!;
        expect(host.querySelectorAll("[data-list]")).toHaveLength(0);
        expect(host.querySelectorAll(".ql-ui")).toHaveLength(0);
        for (const ol of Array.from(host.querySelectorAll("ol"))) {
            expect(ol.textContent).not.toContain("Fragmento A");
        }
    });

    it("keeps every item's text, in the author's order", () => {
        const { pages } = mount();
        const host = richHosts(pages).find((h) => h.textContent?.includes("Fragmento A"))!;
        const items = Array.from(host.querySelectorAll("li")).map((li) => li.textContent);
        expect(items).toEqual([
            "Fragmento A: sin alteraciones.",
            "Fragmento B: sin alteraciones.",
            "Primer paso.",
            "Segundo paso.",
        ]);
    });

    it("keeps the blank paragraph and the run of spaces the author typed", () => {
        const { pages } = mount();
        const host = richHosts(pages).find((h) => h.textContent?.includes("margen"))!;
        expect(host.innerHTML).toContain("margen    libre");
        expect(host.querySelectorAll("br")).toHaveLength(1);
    });

    it("carries the content rule inside every page, not in the document stylesheet", () => {
        const { pages } = mount();
        expect(pages.length).toBeGreaterThan(0);
        for (const page of pages) {
            const css = Array.from(page.querySelectorAll("style")).map((s) => s.textContent).join("");
            expect(css).toContain(`.${RICH_TEXT_CONTENT_CLASS}`);
            expect(css).toContain("white-space: pre-wrap");
        }
    });
});

describe("CEL-131-09 — content with no Quill list renders exactly as before", () => {
    it("an already-semantic <ul> keeps its bullets and is not rewritten", () => {
        const html = "<p>Intro.</p><ul><li>uno</li><li>dos</li></ul>";
        const { pages } = renderV2(withRichText(v2CompleteBranding, "section_macroscopic", html));
        const host = richHosts(pages).find((h) => h.textContent?.includes("Intro."))!;
        expect(host.innerHTML).toBe(html);
    });

    it("a plain paragraph section is untouched", () => {
        const html = "<p>Fragmento único de tejido sintético, 1.0 x 0.5 cm.</p>";
        const { pages } = renderLegacy(withRichText(draftSingleSampleNoImages, "section_macroscopic", html));
        const host = richHosts(pages).find((h) => h.textContent?.includes("Fragmento único"))!;
        expect(host.innerHTML).toBe(html);
    });
});

describe("CEL-131-09 — the local print copy agrees with the renderer", () => {
    /**
     * `useLocalPrint` clones each renderer page and writes the clones into a
     * hidden iframe whose only stylesheet is the print overlay. Anything the
     * rich text depends on must therefore live inside the page itself.
     *
     * Uses the repository's established harness (`use_local_print.test.tsx`):
     * a real iframe with `contentWindow.print` stubbed, so the document the
     * hook actually composed can be inspected.
     */
    /**
     * The hook waits for every image inside the clone to finish loading before
     * printing. jsdom fetches nothing and the clone lives in the iframe's own
     * window, so the letterhead logo on each page would never resolve and the
     * print would never happen. The logos are irrelevant to a rich-text
     * assertion, so they are removed from the pages first — everything the
     * test does assert is still the renderer's own output.
     */
    function withoutLetterheadImages(pages: HTMLElement[]): HTMLElement[] {
        for (const page of pages) {
            page.querySelectorAll("img").forEach((img) => img.remove());
        }
        return pages;
    }

    function stubPrint() {
        const printed: Document[] = [];
        const original = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "contentWindow");
        vi.spyOn(HTMLIFrameElement.prototype, "contentWindow", "get").mockImplementation(function (
            this: HTMLIFrameElement,
        ) {
            const win = original?.get?.call(this) as Window & typeof globalThis;
            if (!win) return win;
            if (!("__stubbed" in win)) {
                Object.defineProperty(win, "__stubbed", { value: true });
                win.print = () => { printed.push(win.document); };
                win.focus = () => {};
            }
            return win;
        });
        return printed;
    }

    it("the printed HTML carries the semantic lists AND the content rule", async () => {
        const printed = stubPrint();
        const { pages } = renderV2(withRichText(v2CompleteBranding, "section_macroscopic", QUILL_CONTENT));
        expect(pages.length).toBeGreaterThan(0);
        const printablePages = withoutLetterheadImages(pages);

        const { result } = renderHook(() => useLocalPrint());
        await result.current.printLocalCopy({ current: { getPages: () => printablePages } } as never, {
            filename: "R.pdf",
            mark: null,
        });

        expect(printed).toHaveLength(1);
        const doc = printed[0];
        const html = doc.documentElement.outerHTML;

        // The lists are semantic in the clone, so the bare iframe renders
        // bullets as bullets with no stylesheet involvement at all.
        expect(doc.querySelectorAll("ul").length).toBeGreaterThan(0);
        expect(doc.querySelectorAll("ol").length).toBeGreaterThan(0);
        expect(html).not.toContain("data-list=");
        expect(html).not.toContain("ql-ui");
        const bulletList = Array.from(doc.querySelectorAll("ul")).find((ul) =>
            ul.textContent?.includes("Fragmento A"),
        );
        expect(bulletList, "the bullet run did not survive the clone as a <ul>").toBeTruthy();
        expect(bulletList!.querySelectorAll("li")).toHaveLength(2);

        // …and the whitespace rule travelled with the page, which a rule in
        // the app's own stylesheet could never have done.
        expect(html).toContain(`.${RICH_TEXT_CONTENT_CLASS}`);
        expect(html).toContain("white-space: pre-wrap");
        expect(html).toContain("margen    libre");
    });
});
