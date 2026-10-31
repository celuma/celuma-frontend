/**
 * Céluma 1.4 (#47): `usePreviewScrollAnchor` keeps the editor preview on the
 * figure (or page) being read while the renderer rebuilds every page.
 *
 * jsdom has no layout, so the geometry is modelled: pages are PAGE_H tall,
 * each figure has a content position given by the "report", rectangles follow
 * the scroll container's scrollTop, and — like a real browser — emptying the
 * page host clamps scrollTop to 0 unless something holds the container's
 * height. The real-browser proof is `tests-e2e/report_preview_viewport.spec.ts`;
 * this suite pins the effect ordering the fix relies on (record before the
 * renderer's effect, restore after it).
 */
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { usePreviewScrollAnchor, type PreviewPagesHandle } from "../../components/report/use_preview_scroll_anchor";

const PAGE_H = 1000;
const VIEW_TOP = 100; // the scroll container's top edge in the viewport
const VIEW_H = 500;

type FakeReport = { pages: number; figures: Record<string, number> };

let scroller: HTMLDivElement;
let scrollTop = 0;
const pinnedDuringRebuild: string[] = [];

function rect(top: number, height: number): DOMRect {
    return { top, bottom: top + height, height, left: 0, right: 100, width: 100, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
}

const FakeRenderer = forwardRef<PreviewPagesHandle, { report: FakeReport }>(({ report }, ref) => {
    const host = useRef<HTMLDivElement>(null);
    useImperativeHandle(ref, () => ({ getPages: () => Array.from(host.current?.children ?? []) as HTMLElement[] }), []);
    useEffect(() => {
        const el = host.current!;
        const container = el.parentElement!;
        pinnedDuringRebuild.push(container.style.minHeight);
        el.innerHTML = "";
        // The browser clamps the scroll position of a container whose content just collapsed.
        if (!container.style.minHeight) scrollTop = 0;
        for (let i = 0; i < report.pages; i += 1) {
            const page = document.createElement("div");
            page.getBoundingClientRect = () => rect(VIEW_TOP + i * PAGE_H - scrollTop, PAGE_H);
            for (const [n, top] of Object.entries(report.figures)) {
                if (Math.floor(top / PAGE_H) !== i) continue;
                const figure = document.createElement("div");
                figure.setAttribute("data-figure", n);
                figure.getBoundingClientRect = () => rect(VIEW_TOP + top - scrollTop, 200);
                page.appendChild(figure);
            }
            el.appendChild(page);
        }
    }, [report]);
    return <div ref={host} />;
});
FakeRenderer.displayName = "FakeRenderer";

function Preview({ report }: { report: FakeReport }) {
    return (
        <div data-testid="scroller" style={{ overflowY: "auto" }}>
            <div data-testid="container"><FakeRenderer report={report} /></div>
        </div>
    );
}

function AnchoredPreview({ report, scope = "report-1" }: { report: FakeReport; scope?: string }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const pagesRef = useRef<PreviewPagesHandle>(null);
    usePreviewScrollAnchor(containerRef, pagesRef, report, null, scope);
    return (
        <div data-testid="scroller" style={{ overflowY: "auto" }}>
            <div data-testid="container" ref={containerRef}><FakeRenderer ref={pagesRef} report={report} /></div>
        </div>
    );
}

/** Gives the rendered scroll container the modelled geometry. */
function wireScroller() {
    scroller = screen.getByTestId("scroller") as HTMLDivElement;
    Object.defineProperty(scroller, "scrollTop", { configurable: true, get: () => scrollTop, set: (v: number) => { scrollTop = v; } });
    Object.defineProperty(scroller, "scrollHeight", { configurable: true, get: () => 5 * PAGE_H });
    Object.defineProperty(scroller, "clientHeight", { configurable: true, get: () => VIEW_H });
    scroller.getBoundingClientRect = () => rect(VIEW_TOP, VIEW_H);
}

const container = () => screen.getByTestId("container");
const A: FakeReport = { pages: 5, figures: { "1": 3050, "4": 3350, "7": 3650, "10": 4050 } };

function setup(ui: (report: FakeReport) => React.ReactElement, report = A) {
    pinnedDuringRebuild.length = 0;
    scrollTop = 0;
    const utils = render(ui(report));
    wireScroller();
    return utils;
}

describe("usePreviewScrollAnchor (1.4 #47)", () => {
    it("control: without the hook, a rebuild throws the reader back to the first page", () => {
        const { rerender } = setup((r) => <Preview report={r} />);
        scrollTop = 3500;
        rerender(<Preview report={{ ...A }} />);
        expect(scrollTop).toBe(0);
    });

    it("keeps the first visible figure at the same place, also when the layout above moved it", () => {
        const { rerender } = setup((r) => <AnchoredPreview report={r} />);
        scrollTop = 3560; // figure 7 is the first visible one, 90 px below the visible top
        rerender(<AnchoredPreview report={{ pages: 5, figures: { ...A.figures, "7": 3669, "10": 4069 } }} />);
        expect(scrollTop).toBe(3579);
        // Held during the renderer's rebuild, released afterwards.
        expect(pinnedDuringRebuild.at(-1)).not.toBe("");
        expect(container().style.minHeight).toBe("");
    });

    it("anchors the page under the top edge when no figure is visible", () => {
        const { rerender } = setup((r) => <AnchoredPreview report={r} />);
        scrollTop = 1250; // inside page 2, figures far below
        rerender(<AnchoredPreview report={{ ...A }} />);
        expect(scrollTop).toBe(1250);
        expect(container().style.minHeight).toBe("");
    });

    it("follows the figure to another page when the refresh moves it there", () => {
        const { rerender } = setup((r) => <AnchoredPreview report={r} />);
        scrollTop = 3560;
        rerender(<AnchoredPreview report={{ pages: 5, figures: { ...A.figures, "7": 4010, "10": 4310 } }} />);
        expect(scrollTop).toBe(3920);
    });

    it("does nothing between refreshes, so the user's own scrolling stands", () => {
        const report = { ...A };
        const { rerender } = setup((r) => <AnchoredPreview report={r} />, report);
        const rebuilds = pinnedDuringRebuild.length;
        scrollTop = 1234;
        rerender(<AnchoredPreview report={report} />);
        expect(pinnedDuringRebuild.length).toBe(rebuilds);
        expect(scrollTop).toBe(1234);
        expect(container().style.minHeight).toBe("");
    });

    it("does not carry a position over to another report", () => {
        const { rerender } = setup((r) => <AnchoredPreview report={r} />);
        scrollTop = 3500;
        rerender(<AnchoredPreview report={{ ...A }} scope="report-2" />);
        expect(scrollTop).toBe(0);
        expect(container().style.minHeight).toBe("");
    });
});
