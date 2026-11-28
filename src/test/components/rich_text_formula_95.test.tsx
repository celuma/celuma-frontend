/**
 * Céluma 1.5 (#95) — LaTeX formulas in Reports V2 rich text.
 *
 * jsdom proves the contract's structure: the LaTeX source in `data-value` is
 * the only content every surface trusts, unsafe or invalid sources stay
 * readable text, the editor offers the control with Spanish names and keeps
 * formulas across save/reopen, a rendered formula is one indivisible unit for
 * the paginator, and the KaTeX stylesheet travels in exactly the V2 pages that
 * hold a formula (and so into the local print copy). Real glyph metrics,
 * wrapping and page breaks are measured in Chromium by
 * `tests-visual/rich_text_formula.visual.spec.ts`.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { createRef, useState } from "react";
import CelumaRichText from "../../components/ui/celuma_rich_text";
import VersionedReportRendererV2, {
    type VersionedReportRendererV2Ref,
} from "../../components/report/versioned/versioned_report_renderer_v2";
import { useLocalPrint } from "../../hooks/use_local_print";
import { RICH_TEXT_EDITOR_FORMATS } from "../../components/report/rich_text_formats";
import { normalizeRichTextForRender } from "../../components/report/rich_text_render";
import {
    FORMULA_CLASS,
    FORMULA_INVALID_CLASS,
    FORMULA_STYLE_ATTR,
    typesetFormula,
} from "../../components/report/rich_text_formula";
import { ATOMIC_ATTR, paginateSource } from "../../components/report/versioned/report_pagination";
import { v2CompleteBranding } from "../fixtures/reports/versioned_v2";
import type { ReportEnvelope } from "../../models/report";

const KI67 = "\\frac{\\text{células positivas}}{\\text{células totales}} \\times 100";

/** A formula as the editor stores it: source in data-value plus a cached drawing and guard characters. */
function storedFormula(latex: string, cached = '<span class="katex">viejo</span>'): string {
    const attr = latex.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    return `<span class="ql-formula" data-value="${attr}">\uFEFF<span contenteditable="false">${cached}</span>\uFEFF</span>`;
}

const PARAGRAPH = `<p>Índice Ki-67: ${storedFormula(KI67)} = 15 %.</p>`;

function withRichText(envelope: ReportEnvelope, sectionKey: string, content: string): ReportEnvelope {
    const report = structuredClone(envelope.report) as ReportEnvelope["report"];
    (report.sections[sectionKey] as { content: string }).content = content;
    return { ...envelope, report };
}

function renderV2(report: ReportEnvelope) {
    const ref = createRef<VersionedReportRendererV2Ref>();
    render(<VersionedReportRendererV2 report={report} ref={ref} />);
    return ref.current?.getPages() ?? [];
}

// jsdom has no Range geometry; Quill asks for it when it scrolls the selection into view.
beforeAll(() => {
    const rect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) }) as DOMRect;
    if (!Range.prototype.getBoundingClientRect) Range.prototype.getBoundingClientRect = rect;
    if (!Range.prototype.getClientRects) {
        Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList;
    }
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("#95 — typesetting", () => {
    it("draws valid LaTeX with KaTeX, including hidden MathML for screen readers", () => {
        const result = typesetFormula(KI67);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.html).toContain('class="katex"');
        expect(result.html).toContain("<math");
        expect(result.html).toContain("mfrac");
    });

    it("refuses sources KaTeX cannot parse, and empty ones", () => {
        expect(typesetFormula("\\frac{a}{").ok).toBe(false);
        expect(typesetFormula("\\comandoinexistente{x}").ok).toBe(false);
        expect(typesetFormula("   ").ok).toBe(false);
    });

    it("never produces links, images or raw HTML from a formula", () => {
        for (const latex of ["\\href{https://example.test}{x}", "\\url{https://example.test}", "\\includegraphics{x.png}", "\\htmlClass{x}{y}"]) {
            const result = typesetFormula(latex);
            const html = result.ok ? result.html : "";
            expect(html).not.toMatch(/<a\b|<img\b|example\.test"|class="x"/);
        }
        const script = typesetFormula("\\text{<script>alert(1)</script>}");
        expect(script.ok ? script.html : "").not.toContain("<script>");
    });
});

describe("#95 — rendering stored formulas", () => {
    it("redraws each formula from data-value and discards the editor's cached markup", () => {
        const html = normalizeRichTextForRender(PARAGRAPH);
        const root = document.createElement("div");
        root.innerHTML = html;
        const span = root.querySelector<HTMLElement>(`span.${FORMULA_CLASS}`)!;
        expect(span.getAttribute("data-value")).toBe(KI67);
        expect(span.textContent).not.toContain("viejo");
        expect(span.textContent).not.toContain("\uFEFF");
        expect(span.querySelector(".katex")).not.toBeNull();
        expect(span.hasAttribute("contenteditable")).toBe(false);
        expect(span.getAttribute(ATOMIC_ATTR)).toBe("true");
        expect(root.textContent).toContain("Índice Ki-67:");
        expect(root.textContent).toContain("= 15 %.");
    });

    it("shows a source it cannot typeset as readable text", () => {
        const html = normalizeRichTextForRender(`<p>Antes ${storedFormula("\\frac{a}{")} después</p>`);
        const root = document.createElement("div");
        root.innerHTML = html;
        const span = root.querySelector<HTMLElement>(`span.${FORMULA_CLASS}`)!;
        expect(span).toHaveClass(FORMULA_INVALID_CLASS);
        expect(span.textContent).toBe("\\frac{a}{");
        expect(span.querySelector(".katex")).toBeNull();
    });

    it("leaves content without formulas byte for byte unchanged", () => {
        const plain = '<p>Sin fórmulas: ×10<sup>9</sup>/L y <span class="ql-size-12pt">doce</span>.</p>';
        expect(normalizeRichTextForRender(plain)).toBe(plain);
    });

    it("keeps a rendered formula in one piece when a paragraph is split between pages", () => {
        const root = document.createElement("div");
        root.innerHTML = normalizeRichTextForRender(`<p>uno dos ${storedFormula("a+b")} tres cuatro</p>`);
        document.body.appendChild(root);
        const bodies: HTMLElement[] = [];
        const newPage = () => {
            const body = document.createElement("div");
            bodies.push(body);
            return body;
        };
        // A page holds at most three inline tokens (words or atoms) of this paragraph.
        const fits = (body: HTMLElement) => {
            const p = body.querySelector("p");
            if (!p) return true;
            const words = (Array.from(p.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent ?? "").join("").match(/\S+/g) ?? []).length;
            return words + p.querySelectorAll(`span.${FORMULA_CLASS}`).length <= 3;
        };
        paginateSource(root, { newPage, fits, discardLastPage: () => bodies.pop() });
        const pieces = bodies.flatMap((b) => Array.from(b.querySelectorAll(`span.${FORMULA_CLASS}`)));
        expect(pieces).toHaveLength(1);
        expect(pieces[0].getAttribute("data-value")).toBe("a+b");
        expect(pieces[0].querySelector(".katex")).not.toBeNull();
        root.remove();
    });
});

describe("#95 — V2 pages and the local print copy", () => {
    it("draws the formula in the page and carries the formula stylesheet only where needed", () => {
        const pages = renderV2(withRichText(v2CompleteBranding, "section_macroscopic", PARAGRAPH));
        expect(pages.length).toBeGreaterThan(0);
        const withFormula = pages.filter((p) => p.querySelector(`.${FORMULA_CLASS}`));
        expect(withFormula.length).toBeGreaterThan(0);
        for (const page of pages) {
            const styled = page.querySelector(`style[${FORMULA_STYLE_ATTR}]`) != null;
            expect(styled).toBe(page.querySelector(`.${FORMULA_CLASS}`) != null);
        }
        const span = withFormula[0].querySelector<HTMLElement>(`.${FORMULA_CLASS}`)!;
        expect(span.querySelector(".katex")).not.toBeNull();
        expect(span.textContent).not.toContain("viejo");
    });

    it("adds nothing to a report without formulas", () => {
        const pages = renderV2(withRichText(v2CompleteBranding, "section_macroscopic", "<p>Texto sin fórmulas.</p>"));
        expect(pages.length).toBeGreaterThan(0);
        for (const page of pages) expect(page.querySelector(`style[${FORMULA_STYLE_ATTR}]`)).toBeNull();
    });

    it("the local print copy carries the drawn formula and its stylesheet", async () => {
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
        const pages = renderV2(withRichText(v2CompleteBranding, "section_macroscopic", PARAGRAPH));
        pages.forEach((page) => page.querySelectorAll("img").forEach((img) => img.remove()));

        const { result } = renderHook(() => useLocalPrint());
        await result.current.printLocalCopy({ current: { getPages: () => pages } } as never, { filename: "R.pdf", mark: null });

        expect(printed).toHaveLength(1);
        const doc = printed[0];
        expect(doc.querySelector(`.${FORMULA_CLASS} .katex`)).not.toBeNull();
        expect(doc.querySelector(`style[${FORMULA_STYLE_ATTR}]`)).not.toBeNull();
    });
});

/** The editor as the report editor uses it: the parent keeps the HTML it emits. */
function Controlled({ initial, onChange }: { initial: string; onChange: (html: string, source?: string) => void }) {
    const [value, setValue] = useState(initial);
    return (
        <CelumaRichText
            value={value}
            onChange={(html, source) => {
                setValue(html);
                onChange(html, source);
            }}
        />
    );
}

describe("#95 — the editor", () => {
    it("keeps the formula format and offers the control with a Spanish name", () => {
        expect(RICH_TEXT_EDITOR_FORMATS).toContain("formula");
        render(<CelumaRichText value="" onChange={() => {}} />);
        expect(screen.getByRole("button", { name: "Fórmula" })).toHaveAttribute("title", "Fórmula");
    });

    it("reopens stored content with the same LaTeX source, redrawn", () => {
        const { container } = render(<CelumaRichText value={PARAGRAPH} onChange={() => {}} />);
        const span = container.querySelector<HTMLElement>(`.ql-editor span.${FORMULA_CLASS}`)!;
        expect(span.getAttribute("data-value")).toBe(KI67);
        expect(span.textContent).not.toContain("viejo");
        expect(span.querySelector(".katex")).not.toBeNull();
    });

    it("inserts a formula from the dialog and reports it as a user edit", async () => {
        const onChange = vi.fn();
        render(<Controlled initial="<p>Ki-67 </p>" onChange={onChange} />);
        fireEvent.click(screen.getByRole("button", { name: "Fórmula" }));
        const source = await screen.findByLabelText("Fórmula en notación LaTeX");
        const confirm = screen.getByRole("button", { name: "Insertar fórmula" });
        expect(confirm).toBeDisabled();

        fireEvent.change(source, { target: { value: "\\frac{a}{" } });
        expect(screen.getByText(/No se pudo interpretar la fórmula/)).toBeInTheDocument();
        expect(confirm).toBeDisabled();

        fireEvent.change(source, { target: { value: "\\frac{15}{100}" } });
        expect(screen.getByTestId("formula-preview").querySelector(".katex")).not.toBeNull();
        expect(confirm).toBeEnabled();
        fireEvent.click(confirm);

        await waitFor(() => {
            const [html, origin] = onChange.mock.calls.at(-1) ?? [];
            expect(origin).toBe("user");
            expect(html).toContain('data-value="\\frac{15}{100}"');
        });
    });

    it("edits an existing formula when it is clicked", async () => {
        const onChange = vi.fn();
        const { container } = render(<Controlled initial={`<p>A ${storedFormula("x^2")} B</p>`} onChange={onChange} />);
        fireEvent.click(container.querySelector(`.ql-editor span.${FORMULA_CLASS}`)!);
        const source = await screen.findByLabelText("Fórmula en notación LaTeX");
        expect(source).toHaveValue("x^2");
        fireEvent.change(source, { target: { value: "x^3" } });
        fireEvent.click(screen.getByRole("button", { name: "Guardar fórmula" }));
        await waitFor(() => {
            const html = String(onChange.mock.calls.at(-1)?.[0] ?? "");
            expect(html).toContain('data-value="x^3"');
            expect(html).not.toContain('data-value="x^2"');
        });
    });

    it("does not open the dialog in a read-only editor", () => {
        const { container } = render(<CelumaRichText value={`<p>${storedFormula("x^2")}</p>`} onChange={() => {}} readOnly />);
        fireEvent.click(container.querySelector(`.ql-editor span.${FORMULA_CLASS}`)!);
        expect(screen.queryByLabelText("Fórmula en notación LaTeX")).toBeNull();
    });
});
