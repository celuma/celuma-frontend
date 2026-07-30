import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { createRef } from "react";
import VersionedReportRendererV2, {
    type VersionedReportRendererV2Ref,
} from "../../../components/report/versioned/versioned_report_renderer_v2";
import type { SignerLookupEntry } from "../../../components/report/legacy/legacy_report_types";
import {
    v2CompleteBranding,
    v2MalformedSnapshot,
    v2MinimalNeutral,
    v2MissingSnapshot,
    v2NoFooter,
    v2NoHeader,
    v2TightMargins,
} from "../../fixtures/reports/versioned_v2";
import type { ReportEnvelope } from "../../../models/report";

// Céluma 1.3 Fase 2, Bloque C, Historia C7.
//
// NOTE on pagination: same jsdom limitation documented in
// legacy_report_renderer_v1.test.tsx — scrollHeight/clientHeight are always
// 0, so every fixture renders onto a single page here regardless of
// content length. Multi-page/visual behavior is covered by the Playwright
// golden tests (Historia C8).

function renderReport(report: ReportEnvelope, signerLookup?: SignerLookupEntry[]) {
    const ref = createRef<VersionedReportRendererV2Ref>();
    const { unmount, container } = render(
        <VersionedReportRendererV2 report={report} signerLookup={signerLookup} ref={ref} />,
    );
    const pages = ref.current?.getPages() ?? [];
    return { pages, text: pages.map((p) => p.textContent).join("\n"), unmount, container };
}

describe("VersionedReportRendererV2 — reads exclusively from rendering_snapshot", () => {
    it("renders the report's own institution name, never a hardcoded one", () => {
        const { text } = renderReport(v2CompleteBranding);
        expect(text).toContain("Laboratorio Sintético V2");
    });

    it("renders base fields and clinical content from report.report", () => {
        const { text } = renderReport(v2CompleteBranding);
        expect(text).toContain("Código de orden:");
        expect(text).toContain("V2-0001");
        expect(text).toContain("Paciente Sintético V2 Uno");
        expect(text).toContain("Macroscópica");
        expect(text).toContain("Microscópica");
    });

    it("renders table sections", () => {
        const { text } = renderReport(v2CompleteBranding);
        expect(text).toContain("Hallazgos");
        expect(text).toContain("Márgenes");
        expect(text).toContain("Libres");
    });

    it("renders every image in the images section", () => {
        const { pages } = renderReport(v2CompleteBranding);
        const imgs = Array.from(pages[0]?.querySelectorAll("img") ?? []).map((i) => i.getAttribute("src"));
        expect(imgs).toContain("https://cdn.example.invalid/synthetic/v2-sample-1.png");
        expect(imgs).toContain("https://cdn.example.invalid/synthetic/v2-sample-2.png");
    });
});

describe("VersionedReportRendererV2 — header", () => {
    it("uses the resolved logo URL from report.resolved_resources when present", () => {
        const { pages } = renderReport(v2CompleteBranding);
        const imgs = Array.from(pages[0]?.querySelectorAll("img") ?? []).map((i) => i.getAttribute("src"));
        expect(imgs).toContain("https://fake-cdn.example.invalid/logos/v2-complete.png");
    });

    it("renders the institutional signer block from presentation.signer", () => {
        const { text } = renderReport(v2CompleteBranding);
        expect(text).toContain("Dr. Firmante Institucional Sintético");
        expect(text).toContain("Patología Sintética");
        expect(text).toContain("SYN-000000");
    });

    it("omits the header band entirely when header.enabled is false", () => {
        const { pages, text } = renderReport(v2NoHeader);
        expect(text).not.toContain("Laboratorio");
        // No header means no institution name and no logo image in page 1's header band.
        const imgs = Array.from(pages[0]?.querySelectorAll("img") ?? []);
        expect(imgs.length).toBe(0);
    });

    it("applies the configured primary_color to header ink", () => {
        const { container } = renderReport(v2CompleteBranding);
        const headerCandidates = Array.from(container.querySelectorAll("div")).filter((d) =>
            d.textContent?.includes("Laboratorio Sintético V2"),
        );
        const colored = Array.from(container.querySelectorAll("div")).find(
            (d) => d.style.color === "rgb(122, 59, 105)", // #7A3B69
        );
        expect(headerCandidates.length).toBeGreaterThan(0);
        expect(colored).toBeTruthy();
    });
});

describe("VersionedReportRendererV2 — footer", () => {
    it("renders custom_text and enables the page-number slot when configured", () => {
        const { text, pages } = renderReport(v2CompleteBranding);
        expect(text).toContain("Documento confidencial — Laboratorio Sintético V2");
        const pageNumberEl = pages[0]?.querySelector('[data-page-number="true"]');
        expect(pageNumberEl).toBeTruthy();
        expect(pageNumberEl?.textContent).toContain("Página 1 de");
    });

    it("omits the footer band entirely when footer.enabled is false", () => {
        const { text } = renderReport(v2NoFooter);
        expect(text).not.toContain("Página 1 de");
    });
});

describe("VersionedReportRendererV2 — neutral defaults for a minimal snapshot", () => {
    it("falls back to the neutral Céluma institution name when institution_name is null", () => {
        const { text } = renderReport(v2MinimalNeutral);
        expect(text).toContain("Céluma");
    });

    it("uses the neutral isotype when no logo is configured", () => {
        const { pages } = renderReport(v2MinimalNeutral);
        const imgs = Array.from(pages[0]?.querySelectorAll("img") ?? []).map((i) => i.getAttribute("src"));
        expect(imgs.some((src) => src?.includes("celuma-isotipo"))).toBe(true);
    });

    it("does not render an institutional signer block when signer is null", () => {
        const { text } = renderReport(v2MinimalNeutral);
        expect(text).not.toContain("Dr. Firmante Institucional Sintético");
    });

    it("renders no fabricated address/phone/email when those fields are null", () => {
        const { text } = renderReport(v2MinimalNeutral);
        expect(text).not.toContain("Calle Sintética");
        expect(text).not.toContain("+52 55 0000 1111");
    });

    it("still renders a page-number footer with the generic neutral confidentiality text", () => {
        const { text } = renderReport(v2MinimalNeutral);
        expect(text).toContain("Documento generado en Céluma.");
        expect(text).toContain("Página 1 de");
    });
});

describe("VersionedReportRendererV2 — margins", () => {
    it("applies configured margins in the 0.8-1.0cm range without throwing", () => {
        const { pages } = renderReport(v2TightMargins);
        expect(pages[0]?.style.width).toBe("8.5in");
        expect(pages[0]?.style.height).toBe("11in");
    });
});

describe("VersionedReportRendererV2 — real signer vs institutional signer", () => {
    it("renders the real signed_by signature block, resolved via signerLookup, independently of presentation.signer", () => {
        const signerLookup: SignerLookupEntry[] = [
            { id: "00000000-0000-0000-0000-000000000199", name: "Firmante Real de Prueba" },
        ];
        const { text } = renderReport(v2CompleteBranding, signerLookup);
        expect(text).toContain("Firmante Real de Prueba");
        expect(text).toContain("Firmado digitalmente el");
        // The institutional signer block (letterhead identity) is separate content.
        expect(text).toContain("Dr. Firmante Institucional Sintético");
    });
});

describe("VersionedReportRendererV2 — invalid/missing snapshot", () => {
    it("renders a controlled fallback (never throws) when rendering_snapshot is entirely missing", () => {
        expect(() => renderReport(v2MissingSnapshot)).not.toThrow();
        const { container, pages } = renderReport(v2MissingSnapshot);
        expect(container.querySelector('[data-testid="invalid-report-snapshot"]')).toBeTruthy();
        expect(pages).toEqual([]);
    });

    it("renders a controlled fallback when rendering_snapshot is structurally invalid", () => {
        expect(() => renderReport(v2MalformedSnapshot)).not.toThrow();
        const { container, pages } = renderReport(v2MalformedSnapshot);
        expect(container.querySelector('[data-testid="invalid-report-snapshot"]')).toBeTruthy();
        expect(pages).toEqual([]);
    });
});

describe("VersionedReportRendererV2 — getPages() contract", () => {
    it("returns a non-empty array of HTMLElements for a valid V2 report", () => {
        const { pages } = renderReport(v2CompleteBranding);
        expect(pages.length).toBeGreaterThan(0);
        pages.forEach((p) => expect(p).toBeInstanceOf(HTMLElement));
    });

    it("clears previously rendered pages when the report prop changes", () => {
        const ref = createRef<VersionedReportRendererV2Ref>();
        const { rerender } = render(<VersionedReportRendererV2 report={v2CompleteBranding} ref={ref} />);
        expect(ref.current?.getPages()[0]?.textContent).toContain("Paciente Sintético V2 Uno");

        rerender(<VersionedReportRendererV2 report={v2MinimalNeutral} ref={ref} />);
        const textAfter = ref.current?.getPages()[0]?.textContent ?? "";
        expect(textAfter).toContain("Paciente Sintético V2 Dos");
        expect(textAfter).not.toContain("Paciente Sintético V2 Uno");
    });
});
