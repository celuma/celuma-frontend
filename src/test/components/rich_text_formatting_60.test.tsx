/**
 * Céluma 1.5 (#60) — font size and sub/superscript in Reports V2 rich text.
 *
 * jsdom proves the contract's structure: which formats the editor keeps, that
 * the toolbar offers the controls with Spanish names, and that the rules giving
 * the stored classes their meaning travel inside every V2 page (and therefore
 * into the official PDF and the local print copy) but not into the frozen
 * Legacy renderer. Real sizes, wrapping and page breaks are measured in
 * Chromium by `tests-visual/rich_text_formatting.visual.spec.ts`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, renderHook, screen } from "@testing-library/react";
import { createRef } from "react";
import CelumaRichText from "../../components/ui/celuma_rich_text";
import VersionedReportRendererV2, {
    type VersionedReportRendererV2Ref,
} from "../../components/report/versioned/versioned_report_renderer_v2";
import LegacyReportRendererV1 from "../../components/report/legacy/legacy_report_renderer_v1";
import type { ReportRendererRef } from "../../components/report/legacy/legacy_report_types";
import { useLocalPrint } from "../../hooks/use_local_print";
import {
    RICH_TEXT_EDITOR_FORMATS,
    RICH_TEXT_FORMAT_CSS,
    RICH_TEXT_SIZE_PICKER,
    RICH_TEXT_SIZE_VALUES,
    richTextFormatCss,
} from "../../components/report/rich_text_formats";
import { RICH_TEXT_CONTENT_CLASS } from "../../components/report/rich_text_render";
import { v2CompleteBranding } from "../fixtures/reports/versioned_v2";
import { draftSingleSampleNoImages } from "../fixtures/reports";
import type { ReportEnvelope } from "../../models/report";

/** A paragraph mixing every #60 format with plain text, as Quill stores it. */
const FORMATTED =
    '<p>Texto normal, <span class="ql-size-8pt">ocho</span>, <span class="ql-size-12pt">doce</span>, '
    + '<strong><span class="ql-size-16pt">dieciséis en negrita</span></strong>, '
    + '<em>cursiva</em>, <u>subrayado</u>, ×10<sup>9</sup>/L y CO<sub>2</sub>.</p>';

function withRichText(envelope: ReportEnvelope, sectionKey: string, content: string): ReportEnvelope {
    const report = structuredClone(envelope.report) as ReportEnvelope["report"];
    (report.sections[sectionKey] as { content: string }).content = content;
    return { ...envelope, report };
}

function pageCss(page: HTMLElement): string {
    return Array.from(page.querySelectorAll("style")).map((s) => s.textContent).join("\n");
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("#60 — the size list", () => {
    it("offers 8–16 pt with Normal (no size) between 9 and 11 pt", () => {
        expect(RICH_TEXT_SIZE_PICKER).toEqual(["8pt", "9pt", false, "11pt", "12pt", "14pt", "16pt"]);
        expect(RICH_TEXT_SIZE_VALUES).toEqual(["8pt", "9pt", "11pt", "12pt", "14pt", "16pt"]);
    });

    it("writes each size as N report points, scaled by the surface's point variable", () => {
        for (const pt of [8, 9, 11, 12, 14, 16]) {
            expect(RICH_TEXT_FORMAT_CSS).toContain(
                `.${RICH_TEXT_CONTENT_CLASS} .ql-size-${pt}pt { font-size: calc(${pt} * var(--celuma-rt-pt, 1pt)); }`,
            );
        }
        expect(RICH_TEXT_FORMAT_CSS).not.toContain("ql-size-10pt");
        expect(RICH_TEXT_FORMAT_CSS).toContain(`.${RICH_TEXT_CONTENT_CLASS} sub, .${RICH_TEXT_CONTENT_CLASS} sup { line-height: 0; }`);
        expect(richTextFormatCss(".x")).toContain(".x .ql-size-12pt");
    });

    it("numbers nested lists 1. → a. → i. by depth and bullets • ◦ ▪", () => {
        const scope = `.${RICH_TEXT_CONTENT_CLASS}`;
        expect(RICH_TEXT_FORMAT_CSS).toContain(`${scope} ol { list-style-type: decimal; }`);
        expect(RICH_TEXT_FORMAT_CSS).toContain(`${scope} :is(ol, ul) ol { list-style-type: lower-alpha; }`);
        expect(RICH_TEXT_FORMAT_CSS).toContain(`${scope} :is(ol, ul) :is(ol, ul) ol { list-style-type: lower-roman; }`);
        expect(RICH_TEXT_FORMAT_CSS).toContain(`${scope} :is(ol, ul) :is(ol, ul) :is(ol, ul) ol { list-style-type: decimal; }`);
        expect(RICH_TEXT_FORMAT_CSS).toContain(`${scope} :is(ol, ul) ul { list-style-type: circle; }`);
        expect(RICH_TEXT_FORMAT_CSS).toContain(`${scope} :is(ol, ul) :is(ol, ul) :is(ol, ul) ul { list-style-type: square; }`);
    });
});

describe("#60 — the editor", () => {
    it("keeps the approved sizes, emphasis and sub/superscript of stored content", () => {
        render(<CelumaRichText value={FORMATTED} onChange={() => {}} />);
        const editor = document.querySelector(".ql-editor")!;
        expect(editor.querySelector(".ql-size-8pt")).toHaveTextContent("ocho");
        expect(editor.querySelector(".ql-size-12pt")).toHaveTextContent("doce");
        // Quill canonicalizes the nesting (size outside or inside <strong>); both are the same text.
        const big = editor.querySelector(".ql-size-16pt")!;
        expect(big).toHaveTextContent("dieciséis en negrita");
        expect(big.closest("strong") ?? big.querySelector("strong")).not.toBeNull();
        expect(editor.querySelector("em")).toHaveTextContent("cursiva");
        expect(editor.querySelector("u")).toHaveTextContent("subrayado");
        expect(editor.querySelector("sup")).toHaveTextContent("9");
        expect(editor.querySelector("sub")).toHaveTextContent("2");
    });

    it("drops sizes and formatting no renderer supports, keeping the text", () => {
        const pasted =
            '<p><span class="ql-size-huge">enorme</span> <span style="color: rgb(230, 0, 0);">rojo</span> '
            + '<span class="ql-font-serif">serif</span></p>';
        render(<CelumaRichText value={pasted} onChange={() => {}} />);
        const editor = document.querySelector(".ql-editor")!;
        expect(editor.textContent).toBe("enorme rojo serif");
        expect(editor.querySelector("[class*='ql-size']")).toBeNull();
        expect(editor.querySelector("[style*='color']")).toBeNull();
        expect(editor.querySelector(".ql-font-serif")).toBeNull();
    });

    it("leaves prose without a size untouched", () => {
        render(<CelumaRichText value="<p>Descripción sin formato.</p>" onChange={() => {}} />);
        expect(document.querySelector(".ql-editor")!.innerHTML).toBe("<p>Descripción sin formato.</p>");
    });

    it("offers size and sub/superscript controls with Spanish accessible names", () => {
        render(<CelumaRichText value="" onChange={() => {}} />);
        expect(screen.getByRole("button", { name: "Subíndice" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Superíndice" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Tamaño de letra" })).toBeInTheDocument();
        const items = Array.from(document.querySelectorAll(".ql-picker.ql-size .ql-picker-item"));
        expect(items.map((item) => item.getAttribute("aria-label"))).toEqual([
            "8 pt", "9 pt", "10 pt", "11 pt", "12 pt", "14 pt", "16 pt",
        ]);
    });

    it("names the picker options in Spanish, with no size preview in the size list", () => {
        render(<CelumaRichText value="" onChange={() => {}} />);
        expect(screen.getByRole("button", { name: "Estilo de párrafo" })).toBeInTheDocument();
        const headers = Array.from(document.querySelectorAll(".ql-picker.ql-header .ql-picker-item"));
        expect(headers.map((item) => item.getAttribute("aria-label"))).toEqual([
            "Título 1", "Título 2", "Título 3", "Normal",
        ]);

        const css = Array.from(document.querySelectorAll(".celuma-quill style")).map((s) => s.textContent).join("\n");
        for (const level of [1, 2, 3]) expect(css).toContain(`content: "Título ${level}"`);
        expect(css).toMatch(/\.ql-size \.ql-picker-item:not\(\[data-value\]\)::before \{ content: "10 pt"; \}/);
        expect(css).not.toContain("Heading");
        // Every size option is listed in the toolbar's own type size.
        expect(css).not.toMatch(/ql-picker\.ql-size [^{]*\{[^}]*font-size/);
    });

    it("names every toolbar button in Spanish, as tooltip and accessible name", () => {
        render(<CelumaRichText value="" onChange={() => {}} />);
        const names = [
            "Negrita", "Cursiva", "Subrayado", "Subíndice", "Superíndice",
            "Lista numerada", "Lista con viñetas", "Insertar enlace", "Quitar formato",
        ];
        for (const name of names) {
            expect(screen.getByRole("button", { name })).toHaveAttribute("title", name);
        }
        const unnamed = Array.from(document.querySelectorAll(".ql-toolbar button")).filter(
            (button) => !button.getAttribute("aria-label"),
        );
        expect(unnamed).toHaveLength(0);
        for (const name of ["Estilo de párrafo", "Tamaño de letra"]) {
            expect(screen.getByRole("button", { name })).toHaveAttribute("title", name);
        }
    });

    it("shows bullets by level (• ◦ ▪), as the report does", () => {
        render(<CelumaRichText value="" onChange={() => {}} />);
        const css = Array.from(document.querySelectorAll(".celuma-quill style")).map((s) => s.textContent).join("\n");
        expect(css).toContain('li[data-list="bullet"].ql-indent-1 > .ql-ui::before { content: "\\25E6"; }');
        expect(css).toContain('li[data-list="bullet"].ql-indent-2 > .ql-ui::before { content: "\\25AA"; }');
        expect(css).toContain('li[data-list="bullet"].ql-indent-5 > .ql-ui::before { content: "\\25AA"; }');
    });

    it("keeps exactly the formats its toolbar produces", () => {
        expect(RICH_TEXT_EDITOR_FORMATS).toEqual(
            expect.arrayContaining(["header", "bold", "italic", "underline", "script", "size", "list", "indent", "link"]),
        );
        expect(RICH_TEXT_EDITOR_FORMATS).not.toContain("color");
        expect(RICH_TEXT_EDITOR_FORMATS).not.toContain("font");
    });
});

describe("#60 — every V2 surface gives the classes the same meaning", () => {
    function renderV2(report: ReportEnvelope) {
        const ref = createRef<VersionedReportRendererV2Ref>();
        render(<VersionedReportRendererV2 report={report} ref={ref} />);
        return ref.current?.getPages() ?? [];
    }

    it("renders the stored formatting unchanged and carries the rules in every page", () => {
        const pages = renderV2(withRichText(v2CompleteBranding, "section_macroscopic", FORMATTED));
        expect(pages.length).toBeGreaterThan(0);
        const host = pages
            .flatMap((page) => Array.from(page.querySelectorAll<HTMLElement>(`.${RICH_TEXT_CONTENT_CLASS}`)))
            .find((h) => h.textContent?.includes("ocho"))!;
        expect(host.querySelector(".ql-size-12pt")).toHaveTextContent("doce");
        expect(host.querySelector("sup")).toHaveTextContent("9");
        for (const page of pages) {
            expect(pageCss(page)).toContain(RICH_TEXT_FORMAT_CSS);
        }
    });

    it("the local print copy carries the formatting and its rules", async () => {
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
        const pages = renderV2(withRichText(v2CompleteBranding, "section_macroscopic", FORMATTED));
        // The hook waits for images; the letterhead logo never loads in jsdom.
        pages.forEach((page) => page.querySelectorAll("img").forEach((img) => img.remove()));

        const { result } = renderHook(() => useLocalPrint());
        await result.current.printLocalCopy({ current: { getPages: () => pages } } as never, {
            filename: "R.pdf",
            mark: null,
        });

        expect(printed).toHaveLength(1);
        const doc = printed[0];
        expect(doc.querySelector(".ql-size-16pt")).toHaveTextContent("dieciséis en negrita");
        expect(doc.querySelector("sub")).toHaveTextContent("2");
        expect(doc.documentElement.outerHTML).toContain("ql-size-16pt { font-size: calc(16 * var(--celuma-rt-pt, 1pt)); }");
    });

    it("the frozen Legacy renderer does not gain the new rules", () => {
        const ref = createRef<ReportRendererRef>();
        render(<LegacyReportRendererV1 report={draftSingleSampleNoImages} ref={ref} />);
        const pages = ref.current?.getPages() ?? [];
        expect(pages.length).toBeGreaterThan(0);
        for (const page of pages) {
            expect(pageCss(page)).not.toContain("ql-size-");
        }
    });
});

describe("#61 — list layout rules", () => {
    const scope = `.${RICH_TEXT_CONTENT_CLASS}`;
    const step = "calc(17 * var(--celuma-rt-pt, 1pt))";

    it("indents every rendered list level one step, with hanging markers and no list margins", () => {
        expect(RICH_TEXT_FORMAT_CSS).toContain(
            `${scope} ol, ${scope} ul { margin: 0; padding-left: ${step}; list-style-position: outside; }`,
        );
        expect(RICH_TEXT_FORMAT_CSS).toContain(`${scope} li { margin: 0; padding-left: 0; }`);
    });

    it("gives the editor the same steps, by ql-indent level", () => {
        render(<CelumaRichText value="" onChange={() => {}} />);
        const css = Array.from(document.querySelectorAll(".celuma-quill style")).map((s) => s.textContent).join("\n");
        expect(css).toContain(`.celuma-quill .ql-editor li[data-list] { padding-left: ${step}; }`);
        expect(css).toContain(`.celuma-quill .ql-editor li[data-list].ql-indent-1 { padding-left: calc(2 * ${step}); }`);
        expect(css).toContain(`.celuma-quill .ql-editor li[data-list].ql-indent-2 { padding-left: calc(3 * ${step}); }`);
        expect(css).toContain("text-align: right;");
    });
});
