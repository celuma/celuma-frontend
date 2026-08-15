import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { createRef } from "react";
import VersionedReportRendererV2, {
    type VersionedReportRendererV2Ref,
} from "../../../components/report/versioned/versioned_report_renderer_v2";
import { v2CompleteBranding, v2MinimalNeutral } from "../../fixtures/reports/versioned_v2";
import type { ReportEnvelope } from "../../../models/report";

/**
 * Second post-Phase 2 remediation (UX) — Block 11 (anti-pollution
 * Legacy) + coverage of the new fields of the presentation contract
 * (footer logo, dividers, typography) newly wired in the renderer.
 *
 * Complements no_legacy_literals.test.ts (static literals grep
 * prohibited) with behavior tests: a letterhead "imported from
 * ambassador" is just normal data in the snapshot — no value
 * appears unless explicitly in `presentation`, and does not
 * fallback to Legacy exists at all.
 */

function renderReport(report: ReportEnvelope) {
    const ref = createRef<VersionedReportRendererV2Ref>();
    const { container } = render(<VersionedReportRendererV2 report={report} ref={ref} />);
    const pages = ref.current?.getPages() ?? [];
    return { pages, text: pages.map((p) => p.textContent).join("\n"), container };
}

function clone(report: ReportEnvelope): ReportEnvelope {
    return JSON.parse(JSON.stringify(report)) as ReportEnvelope;
}

describe("VersionedReportRendererV2 — footer logo (Legacy parity)", () => {
    it("renders the footer logo when resolved_resources.footer_logo_url is present", () => {
        const report = clone(v2CompleteBranding);
        report.resolved_resources = {
            ...report.resolved_resources,
            footer_logo_url: "https://fake-cdn.example.invalid/logos/footer-logo.png",
        };
        const { pages } = renderReport(report);
        const imgs = Array.from(pages[0]?.querySelectorAll("img") ?? []).map((i) => i.getAttribute("src"));
        expect(imgs).toContain("https://fake-cdn.example.invalid/logos/footer-logo.png");
    });

    /**
     * Third post-Phase 2 remediation (§5 of the brief): explicit guard
     * against a copy/paste bug between the two bands. With two logos
     * different configured, each one has to land on their band —
     * the footer can never end up drawing `header_logo_url`.
     */
    it("draws each logo in its own band — the footer never reuses header_logo_url", () => {
        const report = clone(v2CompleteBranding);
        report.resolved_resources = {
            header_logo_url: "https://fake-cdn.example.invalid/logos/only-HEADER.png",
            footer_logo_url: "https://fake-cdn.example.invalid/logos/only-FOOTER.png",
        };
        const { pages } = renderReport(report);
        const page = pages[0] as HTMLElement;

        // The three bands are direct children of the page: header
        // (`top`, without `bottom`), footer (`bottom`, without `top`) y body (both).
        const bandOf = (img: Element): "header" | "footer" | "body" | "other" => {
            let node: HTMLElement | null = img.parentElement;
            while (node && node.parentElement !== page) {
                node = node.parentElement;
                if (!node) return "other";
            }
            if (!node) return "other";
            const hasTop = !!node.style.top;
            const hasBottom = !!node.style.bottom;
            if (hasTop && hasBottom) return "body";
            if (hasBottom) return "footer";
            if (hasTop) return "header";
            return "other";
        };

        const imgs = Array.from(page.querySelectorAll("img"));
        const headerImgs = imgs.filter((i) => bandOf(i) === "header").map((i) => i.getAttribute("src"));
        const footerImgs = imgs.filter((i) => bandOf(i) === "footer").map((i) => i.getAttribute("src"));

        expect(headerImgs).toEqual(["https://fake-cdn.example.invalid/logos/only-HEADER.png"]);
        expect(footerImgs).toEqual(["https://fake-cdn.example.invalid/logos/only-FOOTER.png"]);
    });

    it("renders no footer logo image when footer_logo_url is absent, even with a header logo", () => {
        const { pages } = renderReport(v2CompleteBranding);
        const imgs = Array.from(pages[0]?.querySelectorAll("img") ?? []).map((i) => i.getAttribute("src"));
        // Header logo is present (asserted elsewhere); footer logo must not be fabricated.
        expect(imgs).not.toContain(undefined);
        expect(imgs.filter((s) => s?.includes("footer"))).toHaveLength(0);
    });
});

describe("VersionedReportRendererV2 — dividers (header/footer)", () => {
    it("draws a divider line by default (undefined divider == today's always-on 1px line)", () => {
        const { container } = renderReport(v2CompleteBranding);
        const dividerLines = Array.from(container.querySelectorAll("div")).filter(
            (d) => d.style.borderTop && d.style.borderTop.includes("1px solid"),
        );
        expect(dividerLines.length).toBeGreaterThan(0);
    });

    it("omits the divider line entirely when header.divider.enabled is false", () => {
        const report = clone(v2CompleteBranding);
        const snapshot = report.report.rendering_snapshot as { presentation: { header: Record<string, unknown> } };
        snapshot.presentation.header.divider = {
            enabled: false, style: "SINGLE", primary_width_px: 1, secondary_width_px: 1, gap_mm: 1, color: null,
        };
        const { container } = renderReport(report);
        const dividerLines = Array.from(container.querySelectorAll("div")).filter(
            (d) => d.style.borderTop && d.style.borderTop.includes("7A3B69"),
        );
        expect(dividerLines.length).toBe(0);
    });

    it("draws two lines for a DOUBLE divider", () => {
        const report = clone(v2CompleteBranding);
        const snapshot = report.report.rendering_snapshot as { presentation: { footer: Record<string, unknown> } };
        snapshot.presentation.footer.divider = {
            enabled: true, style: "DOUBLE", primary_width_px: 2, secondary_width_px: 1, gap_mm: 1, color: null,
        };
        const { container } = renderReport(report);
        const footerDividerLines = Array.from(container.querySelectorAll("div")).filter(
            (d) => d.style.borderTop && (d.style.borderTop.includes("2px") || d.style.borderTop.includes("1px")),
        );
        // At least the two footer divider lines plus the header's single line.
        expect(footerDividerLines.length).toBeGreaterThanOrEqual(3);
    });
});

describe("VersionedReportRendererV2 — imported ambassador letterhead: snapshot data only", () => {
    // Values that imitate (but do not literally matter) those that
    // legacy_letterhead_adapter.py would export for the Legacy letterhead — the
    // test is that this renderer treats it as normal data
    // CUALQUIER letterhead, with no special code path for them.
    const importedAmbassadorLikeReport: ReportEnvelope = (() => {
        const report = clone(v2CompleteBranding);
        const snapshot = report.report.rendering_snapshot as {
            presentation: {
                header: Record<string, unknown>;
                footer: Record<string, unknown>;
                style: Record<string, unknown>;
                signer: Record<string, unknown>;
            };
        };
        snapshot.presentation.header = {
            enabled: true,
            logo_storage_id: null,
            institution_name: "Dra. Ejemplo Importada",
            subtitle: "Especialidad Importada de Ejemplo",
            address: "Dirección importada de ejemplo",
            phone: null,
            email: null,
        };
        snapshot.presentation.footer = {
            enabled: true,
            custom_text: "Contacto importado de ejemplo",
            show_page_number: true,
        };
        snapshot.presentation.style = { primary_color: "#123456" };
        snapshot.presentation.signer = {
            display_name: "Dra. Ejemplo Importada",
            specialty: "Especialidad Importada de Ejemplo",
            license_number: "IMP-000000",
            affiliation: "Institución Importada de Ejemplo",
        };
        report.resolved_resources = {};
        return report;
    })();

    it("shows exactly the imported values when this letterhead is explicitly selected", () => {
        const { text } = renderReport(importedAmbassadorLikeReport);
        expect(text).toContain("Dra. Ejemplo Importada");
        expect(text).toContain("Contacto importado de ejemplo");
    });

    it("never shows those values for an unrelated neutral report (no cross-report leakage)", () => {
        const { text } = renderReport(v2MinimalNeutral);
        expect(text).not.toContain("Dra. Ejemplo Importada");
        expect(text).not.toContain("Contacto importado de ejemplo");
    });

    it("switching a report's snapshot from the imported letterhead to neutral removes all trace of it", () => {
        const first = renderReport(importedAmbassadorLikeReport);
        expect(first.text).toContain("Dra. Ejemplo Importada");

        const second = renderReport(v2MinimalNeutral);
        expect(second.text).not.toContain("Dra. Ejemplo Importada");
        expect(second.text).not.toContain("Contacto importado de ejemplo");
    });
});
