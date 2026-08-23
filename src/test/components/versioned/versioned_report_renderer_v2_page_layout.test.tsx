/**
 * Pre-Phase-5 final renderer-layout remediation — DOM-level regression.
 *
 * The pure-geometry counterpart lives in page_layout.test.ts. These tests
 * assert the same invariants on the ACTUAL rendered page DOM produced by
 * `VersionedReportRendererV2` — the same component the editor preview, the
 * report editor, and the Playwright/PDF pipeline all render — so a failure
 * here means real content really would overlap the letterhead.
 *
 * The regression being guarded: the previous remediation set
 * `bodyTop = marginTop` unconditionally, so a `0.5cm` top margin drew the
 * patient/order metadata on top of a `28mm` header band.
 */
import { describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { createRef } from "react";
import VersionedReportRendererV2, {
    type VersionedReportRendererV2Ref,
} from "../../../components/report/versioned/versioned_report_renderer_v2";
import { v2CompleteBranding } from "../../fixtures/reports/versioned_v2";
import { parityMultipageV2, paritySignedV2 } from "../../fixtures/reports/legacy_v2_parity";
import type { ReportEnvelope } from "../../../models/report";

function clone(report: ReportEnvelope): ReportEnvelope {
    return JSON.parse(JSON.stringify(report)) as ReportEnvelope;
}

type MutablePresentation = {
    paper: Record<string, unknown>;
    header: Record<string, unknown>;
    footer: Record<string, unknown>;
    style: Record<string, unknown>;
    signer: Record<string, unknown> | null;
};

function presentationOf(report: ReportEnvelope): MutablePresentation {
    return (report.report.rendering_snapshot as { presentation: MutablePresentation }).presentation;
}

function setMargins(report: ReportEnvelope, margins: Partial<Record<"top" | "right" | "bottom" | "left", number>>) {
    const paper = presentationOf(report).paper as unknown as {
        margins_cm: { top: number; right: number; bottom: number; left: number };
    };
    paper.margins_cm = { ...paper.margins_cm, ...margins };
}

/**
 * Renders one report and returns its page elements.
 *
 * `cleanup()` first because two `VersionedReportRendererV2` instances
 * mounted at once cannot both paginate: each looks up its hidden source by
 * `#reporte-content-v2`, and the duplicate id means the second instance
 * finds nothing and renders zero pages. That is a pre-existing test-harness
 * constraint (the app never mounts two at once), not something this
 * remediation introduced — but it makes any test that renders twice silently
 * assert on an empty page list, so unmount between renders.
 *
 * The returned elements stay detached-but-readable afterwards: their inline
 * `style` values are what these tests assert on.
 */
function renderPages(report: ReportEnvelope) {
    cleanup();
    const ref = createRef<VersionedReportRendererV2Ref>();
    render(<VersionedReportRendererV2 report={report} ref={ref} />);
    return ref.current?.getPages() ?? [];
}

/** The three bands are direct children of a page element. */
function bandsOf(page: HTMLElement) {
    const children = Array.from(page.children).filter(
        (el): el is HTMLElement => el instanceof HTMLElement,
    );
    return {
        header: children.find((el) => el.style.top && !el.style.bottom),
        footer: children.find((el) => el.style.bottom && !el.style.top),
        body: children.find((el) => el.style.top && el.style.bottom),
    };
}

/** `"33mm"` -> `33`. */
function mm(value: string | undefined): number {
    return parseFloat(value ?? "");
}

describe("VersionedReportRendererV2 — header must never overlap the body (§21)", () => {
    it("0.5cm top margin + 28mm header: body starts BELOW the header band, not at 5mm", () => {
        const report = clone(v2CompleteBranding);
        setMargins(report, { top: 0.5 });
        const p = presentationOf(report);
        p.header.height_mm = 28;
        p.header.content_gap_mm = 3;

        const { header, body } = bandsOf(renderPages(report)[0] as HTMLElement);

        // The PAGE MARGIN stays literal: the topmost occupied element (the
        // header band) sits exactly 5mm from the physical page edge.
        expect(header!.style.top).toBe("5mm");
        // The BODY SAFE AREA clears the band: 5 + 28 + 3.
        expect(body!.style.top).toBe("36mm");
        expect(mm(body!.style.top)).toBeGreaterThanOrEqual(
            mm(header!.style.top) + mm(header!.style.height) + 3,
        );
        // The exact defect this remediation fixes.
        expect(body!.style.top).not.toBe("5mm");
    });

    it("4cm top margin + header: page-edge inset is 40mm and the header is not double-counted", () => {
        const report = clone(v2CompleteBranding);
        setMargins(report, { top: 4.0 });
        const p = presentationOf(report);
        p.header.height_mm = 28;
        p.header.content_gap_mm = 3;

        const { header, body } = bandsOf(renderPages(report)[0] as HTMLElement);
        expect(header!.style.top).toBe("40mm");
        expect(body!.style.top).toBe("71mm"); // 40 + 28 + 3, counted once
    });

    it("different header heights reserve exactly their own height — no Legacy 28mm constant (§25)", () => {
        const build = (heightMm: number) => {
            const report = clone(v2CompleteBranding);
            setMargins(report, { top: 0.5 });
            const p = presentationOf(report);
            p.header.height_mm = heightMm;
            p.header.content_gap_mm = 3;
            return bandsOf(renderPages(report)[0] as HTMLElement).body!;
        };

        const small = build(15);
        const large = build(40);
        expect(small.style.top).toBe("23mm"); // 5 + 15 + 3
        expect(large.style.top).toBe("48mm"); // 5 + 40 + 3
        expect(mm(large.style.top) - mm(small.style.top)).toBe(25); // the height delta exactly
    });
});

describe("VersionedReportRendererV2 — no header / no footer fall back to the margin (§22, §24)", () => {
    it("header disabled + 0.5cm top margin: bodyTop is exactly 5mm", () => {
        const report = clone(v2CompleteBranding);
        setMargins(report, { top: 0.5 });
        presentationOf(report).header.enabled = false;

        const { header, body } = bandsOf(renderPages(report)[0] as HTMLElement);
        expect(header).toBeUndefined();
        expect(body!.style.top).toBe("5mm");
    });

    it("footer disabled + 0.5cm bottom margin: body's bottom inset is exactly 5mm", () => {
        const report = clone(v2CompleteBranding);
        setMargins(report, { bottom: 0.5 });
        presentationOf(report).footer.enabled = false;

        const { footer, body } = bandsOf(renderPages(report)[0] as HTMLElement);
        expect(footer).toBeUndefined();
        expect(body!.style.bottom).toBe("5mm");
    });

    it("header enabled with zero height reserves nothing (§11)", () => {
        const report = clone(v2CompleteBranding);
        setMargins(report, { top: 0.5 });
        const p = presentationOf(report);
        p.header.height_mm = 0;
        p.header.content_gap_mm = 4;

        const { body } = bandsOf(renderPages(report)[0] as HTMLElement);
        expect(body!.style.top).toBe("5mm");
    });
});

describe("VersionedReportRendererV2 — footer must never overlap the body (§23)", () => {
    it("0.5cm bottom margin + 20mm footer: body ends ABOVE the footer band", () => {
        const report = clone(v2CompleteBranding);
        setMargins(report, { bottom: 0.5 });
        const p = presentationOf(report);
        p.footer.height_mm = 20;
        p.footer.content_gap_mm = 3;

        const { footer, body } = bandsOf(renderPages(report)[0] as HTMLElement);
        expect(footer!.style.bottom).toBe("5mm"); // page margin stays literal
        expect(body!.style.bottom).toBe("28mm"); // 5 + 20 + 3
        expect(mm(body!.style.bottom)).toBeGreaterThanOrEqual(
            mm(footer!.style.bottom) + mm(footer!.style.height) + 3,
        );
    });
});

describe("VersionedReportRendererV2 — Legacy and custom V2 share one layout principle (§26)", () => {
    it("an unedited Legacy-imported letterhead renders its historical 28mm/20mm body box", () => {
        const { header, footer, body } = bandsOf(renderPages(clone(paritySignedV2))[0] as HTMLElement);
        expect(header!.style.top).toBe("0mm");
        expect(footer!.style.bottom).toBe("0mm");
        expect(body!.style.top).toBe("28mm");
        expect(body!.style.bottom).toBe("20mm");
    });

    it("a Legacy letterhead edited to a 0.5cm top margin also clears its header", () => {
        // Reproduces the real user flow: the editor clears the imported
        // `offset_mm` pin when the margin is edited (first remediation), so
        // the band falls back to sitting on the new margin.
        const report = clone(paritySignedV2);
        setMargins(report, { top: 0.5 });
        const p = presentationOf(report);
        p.header.offset_mm = null;

        const { header, body } = bandsOf(renderPages(report)[0] as HTMLElement);
        expect(header!.style.top).toBe("5mm"); // literal page margin
        expect(body!.style.top).toBe("33mm"); // 5 + 28 + 0 (Legacy gap is 0)
        expect(body!.style.top).not.toBe("5mm");
    });

    it("Legacy and custom V2 with equivalent resolved geometry produce identical body bounds", () => {
        const legacy = clone(paritySignedV2);
        setMargins(legacy, { top: 0.5, bottom: 0.5 });
        const lp = presentationOf(legacy);
        lp.header.offset_mm = null;
        lp.footer.offset_mm = null;

        const custom = clone(v2CompleteBranding);
        setMargins(custom, { top: 0.5, bottom: 0.5 });
        const cp = presentationOf(custom);
        cp.header.height_mm = lp.header.height_mm;
        cp.header.content_gap_mm = lp.header.content_gap_mm;
        cp.footer.height_mm = lp.footer.height_mm;
        cp.footer.content_gap_mm = lp.footer.content_gap_mm;

        const legacyBody = bandsOf(renderPages(legacy)[0] as HTMLElement).body!;
        const customBody = bandsOf(renderPages(custom)[0] as HTMLElement).body!;
        expect(customBody.style.top).toBe(legacyBody.style.top);
        expect(customBody.style.bottom).toBe(legacyBody.style.bottom);
    });
});

describe("VersionedReportRendererV2 — pagination uses the safe area on EVERY page (§28, §32)", () => {
    it("every rendered page gets the same non-overlapping bounds", () => {
        // NOTE ON PAGE COUNT: jsdom performs no layout — `scrollHeight` and
        // `clientHeight` are both 0 — so `fits()` always returns true and
        // this fixture paginates to a single page here regardless of its
        // content length. Real multi-page pagination is therefore asserted
        // in real Chromium by `tests-visual/report_renderer_versioned_v2.
        // visual.spec.ts` and against the official PDF; what this test can
        // and does prove is that the bounds are applied per page by
        // `makePage()` (not computed once for page 1), by asserting on
        // every page the renderer emits.
        const report = clone(parityMultipageV2);
        setMargins(report, { top: 0.5, bottom: 0.5 });
        const p = presentationOf(report);
        p.header.offset_mm = null;
        p.footer.offset_mm = null;

        const pages = renderPages(report);
        expect(pages.length).toBeGreaterThanOrEqual(1);

        for (const page of pages) {
            const { header, footer, body } = bandsOf(page as HTMLElement);
            // Page margins literal on every page.
            expect(header!.style.top).toBe("5mm");
            expect(footer!.style.bottom).toBe("5mm");
            // Body clears both bands on every page — not just page 1.
            expect(mm(body!.style.top)).toBeGreaterThanOrEqual(
                mm(header!.style.top) + mm(header!.style.height),
            );
            expect(mm(body!.style.bottom)).toBeGreaterThanOrEqual(
                mm(footer!.style.bottom) + mm(footer!.style.height),
            );
            // And the usable box is real.
            expect(mm(body!.style.top) + mm(body!.style.bottom)).toBeLessThan(279.4);
        }
    });

    it("the signature block flows inside the body box, so it inherits the same safe area (§16)", () => {
        // The signature is a normal child of `#reporte-content-v2`, not an
        // independently-positioned band: it is paginated by the same
        // `fits()` loop as any paragraph, so it can never overlap the
        // footer as long as the body box does not.
        const report = clone(paritySignedV2);
        setMargins(report, { bottom: 0.5 });
        presentationOf(report).footer.offset_mm = null;

        const pages = renderPages(report);
        const signaturePage = pages.find((page) => page.textContent?.includes("Firmado"));
        expect(signaturePage).toBeDefined();

        const { footer, body } = bandsOf(signaturePage as HTMLElement);
        // The signature lives in the body element, not the footer band.
        expect(body!.textContent).toContain("Firmado");
        expect(footer!.textContent).not.toContain("Firmado");
        expect(mm(body!.style.bottom)).toBeGreaterThanOrEqual(
            mm(footer!.style.bottom) + mm(footer!.style.height),
        );
    });
});

describe("VersionedReportRendererV2 — unusable configuration is explicit, never overlapping (§20)", () => {
    it("renders a controlled message instead of paginating into a negative-height box", () => {
        const report = clone(v2CompleteBranding);
        setMargins(report, { top: 4.0, bottom: 4.0 });
        const p = presentationOf(report);
        p.header.height_mm = 150;
        p.footer.height_mm = 150;

        const ref = createRef<VersionedReportRendererV2Ref>();
        const { getByTestId } = render(<VersionedReportRendererV2 report={report} ref={ref} />);
        expect(getByTestId("unusable-page-layout")).toBeTruthy();
        expect(ref.current?.getPages() ?? []).toHaveLength(0);
    });
});

describe("VersionedReportRendererV2 — outer margin: content is pinned to the margin edge", () => {
    // jsdom performs no layout, so the ink POSITION is asserted in real
    // Chromium by tests-visual/page_outer_margin.visual.spec.ts. What is
    // assertable here is the mechanism: a margin-positioned band pins its
    // content to the margin edge instead of letting the band's leftover
    // height sit between the margin and the first ink.
    it("a margin-positioned header pins its content to the band's top edge", () => {
        const report = clone(v2CompleteBranding);
        setMargins(report, { top: 0.5 });
        const p = presentationOf(report);
        p.header.offset_mm = null;
        p.header.content_alignment = "BOTTOM"; // would otherwise float the ink down

        const { header } = bandsOf(renderPages(report)[0] as HTMLElement);
        expect(header!.style.alignItems).toBe("flex-start");
    });

    it("a margin-positioned footer pins its content to the band's bottom edge", () => {
        const report = clone(v2CompleteBranding);
        setMargins(report, { bottom: 0.5 });
        presentationOf(report).footer.offset_mm = null;

        const { footer } = bandsOf(renderPages(report)[0] as HTMLElement);
        expect(footer!.style.alignItems).toBe("flex-end");
    });

    it("a Legacy-pinned band keeps its historical internal alignment untouched", () => {
        // `offset_mm` explicitly set = Legacy compatibility mode: the band is
        // pinned to the physical page edge and its historical alignment is
        // preserved, so a fresh unedited import renders as it always did.
        const report = clone(paritySignedV2); // offset_mm = 0, alignment BOTTOM
        const { header, footer } = bandsOf(renderPages(report)[0] as HTMLElement);
        expect(header!.style.alignItems).toBe("flex-end");
        expect(footer!.style.alignItems).toBe("center");
    });
});
