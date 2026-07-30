import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { createRef } from "react";
import LegacyReportRendererV1, {
    type LegacyReportRendererV1Ref,
} from "../../../components/report/legacy/legacy_report_renderer_v1";
import {
    draftSingleSampleNoImages,
    emptyOptionalSections,
    legacyOldestStructure,
    longContentMultipage,
    publishedMultiSampleWithImages,
    specialCharactersAccents,
} from "../../fixtures/reports";
import type { SignerLookupEntry } from "../../../components/report/legacy/legacy_report_renderer_v1";

// Regression coverage for Céluma 1.3 Fase 1 (Workstream 5), moved in Fase 2
// Bloque A / Historia A4 alongside the renderer's extraction into
// legacy/legacy_report_renderer_v1.tsx. LegacyReportRendererV1 is the SAME
// renderer previously named ReportPreviewPages — used for both on-screen
// preview and the "PDF" export (use_pdf_export.ts just clones its DOM — see
// report-rendering-inventory.md §3) — so these tests double as protection
// for the PDF output too.
//
// NOTE on pagination: jsdom has no real layout engine, so scrollHeight/
// clientHeight are always 0 and the box-fitting algorithm in
// legacy_report_renderer_v1.tsx (`fits()`) always reports "fits" — every
// fixture renders onto a single page under jsdom regardless of content
// length. That is a test-environment limitation, not a claim that
// pagination doesn't happen in a real browser. These tests instead protect
// against CONTENT LOSS during pagination (all text must still be present
// somewhere); the visual/multi-page behavior is protected by the
// Playwright-based golden tests added in Historia A2
// (tests-visual/report_renderer_legacy.visual.spec.ts).

function renderReport(report: typeof draftSingleSampleNoImages, signerLookup?: SignerLookupEntry[]) {
    const ref = createRef<LegacyReportRendererV1Ref>();
    const { unmount } = render(<LegacyReportRendererV1 report={report} signerLookup={signerLookup} ref={ref} />);
    const pages = ref.current?.getPages() ?? [];
    return { pages, text: pages.map((p) => p.textContent).join("\n"), unmount };
}

describe("LegacyReportRendererV1 — base fields and sections", () => {
    it("renders visible base fields with their labels and values", () => {
        const { text } = renderReport(draftSingleSampleNoImages);
        expect(text).toContain("Código de orden:");
        expect(text).toContain("SYN-0001");
        expect(text).toContain("Paciente de Prueba Uno");
        expect(text).toContain("Dr. Solicitante Sintético");
    });

    it("renders visible sections with their content", () => {
        const { text } = renderReport(draftSingleSampleNoImages);
        expect(text).toContain("Macroscópica");
        expect(text).toContain("Fragmento único de tejido sintético");
        expect(text).toContain("Microscópica");
        expect(text).toContain("Hallazgo de prueba sin relevancia clínica");
    });

    it("omits the images section header entirely when there are no images", () => {
        const { text } = renderReport(draftSingleSampleNoImages);
        expect(text).not.toContain("Imágenes");
    });
});

describe("LegacyReportRendererV1 — hardcoded ambassador letterhead (protected, not removed)", () => {
    // See ambassador-hardcoding-inventory.md items A1-A7 / legacy-renderer-contract.md.
    // This intentionally asserts CURRENT (hardcoded) behavior so any accidental
    // future change to the letterhead fails a test instead of going unnoticed.
    it("prints the hardcoded institutional header on every report regardless of tenant", () => {
        const { text } = renderReport(draftSingleSampleNoImages);
        expect(text).toContain("Dra. Arisbeth Villanueva Pérez.");
        expect(text).toContain("Anatomía Patológica, Nefropatología y Citología Exfoliativa");
        expect(text).toContain("Centro Médico Nacional de Occidente IMSS. INCMNSZ");
        expect(text).toContain("DGP3833349");
    });

    it("prints the hardcoded address/phone/email footer", () => {
        const { text } = renderReport(draftSingleSampleNoImages);
        expect(text).toContain("Guadalajara, Jalisco");
        expect(text).toContain("33 2015 0100");
        expect(text).toContain("patologiaynefropatologia@gmail.com");
    });

    it("uses the hardcoded #002060 color for header/footer text", () => {
        const { pages } = renderReport(draftSingleSampleNoImages);
        const headerCandidates = Array.from(pages[0]?.querySelectorAll("div") ?? []).filter((d) =>
            d.textContent?.includes("Villanueva"),
        );
        expect(headerCandidates.length).toBeGreaterThan(0);
        expect(headerCandidates[0].style.color).toBe("rgb(0, 32, 96)"); // #002060
    });

    it("embeds the hardcoded report_logo.png asset in the footer", () => {
        const { pages } = renderReport(draftSingleSampleNoImages);
        const imgs = Array.from(pages[0]?.querySelectorAll("img") ?? []);
        expect(imgs.some((img) => img.getAttribute("src")?.includes("report_logo"))).toBe(true);
    });
});

describe("LegacyReportRendererV1 — images / multiple samples", () => {
    it("renders every selected image across samples in the single shared Imágenes section, in order", () => {
        const { pages, text } = renderReport(publishedMultiSampleWithImages);
        const imgs = Array.from(pages[0]?.querySelectorAll("img") ?? []).map((i) => i.getAttribute("src"));
        expect(imgs).toContain("https://cdn.example.invalid/synthetic/sample-a-1.png");
        expect(imgs).toContain("https://cdn.example.invalid/synthetic/sample-b-1.png");
        expect(imgs).toContain("https://cdn.example.invalid/synthetic/sample-c-1.png");
        expect(imgs).toContain("https://cdn.example.invalid/synthetic/sample-c-2.png");
        expect(text).toContain("Figura 1.");
        expect(text).toContain("Figura 4.");
    });

    it("renders all completed sections, including table and text types", () => {
        const { text } = renderReport(publishedMultiSampleWithImages);
        expect(text).toContain("Diagnóstico");
        expect(text).toContain("Diagnóstico de prueba: hallazgo sintético benigno.");
    });
});

describe("LegacyReportRendererV1 — signature block", () => {
    it("does not render a signature block when show_signature_section is false", () => {
        const { text } = renderReport(draftSingleSampleNoImages);
        expect(text).not.toContain("Pendiente de firma");
        expect(text).not.toContain("Firmado");
    });

    it("renders the digital signature image and signed date when required and signed", () => {
        const signerLookup: SignerLookupEntry[] = [{ id: "00000000-0000-0000-0000-000000000099", name: "Firmante de Prueba" }];
        const { pages, text } = renderReport(publishedMultiSampleWithImages, signerLookup);
        const imgs = Array.from(pages[0]?.querySelectorAll("img") ?? []).map((i) => i.getAttribute("src"));
        expect(imgs).toContain("https://cdn.example.invalid/synthetic/signature.png");
        expect(text).toContain("Firmante de Prueba");
        expect(text).toContain("Firmado digitalmente el");
    });
});

describe("LegacyReportRendererV1 — optional/empty sections", () => {
    it("omits a visible section whose content is an empty string", () => {
        const { text } = renderReport(emptyOptionalSections);
        expect(text).not.toContain("Diagnóstico");
    });

    it("omits a section entirely when is_visible is false, even with no content", () => {
        const { text } = renderReport(emptyOptionalSections);
        expect(text).not.toContain("Notas adicionales");
    });

    it("still renders the sections that ARE visible and non-empty", () => {
        const { text } = renderReport(emptyOptionalSections);
        expect(text).toContain("Macroscópica");
        expect(text).toContain("Descripción sintética breve.");
    });
});

describe("LegacyReportRendererV1 — legacy document without base_order/section_order", () => {
    it("still renders every base field and section via the Object.keys() fallback", () => {
        const { text } = renderReport(legacyOldestStructure);
        expect(text).toContain("Paciente de Prueba Seis");
        expect(text).toContain("Macroscópica");
        expect(text).toContain("Microscópica");
    });

    it("does not render a signature block when signatureMetadata is entirely absent", () => {
        const { text } = renderReport(legacyOldestStructure);
        expect(text).not.toContain("Pendiente de firma");
        expect(text).not.toContain("Firmado");
    });
});

describe("LegacyReportRendererV1 — special characters and accents", () => {
    it("preserves accented names and symbols verbatim in the rendered output", () => {
        const { text } = renderReport(specialCharactersAccents);
        expect(text).toContain("María José Muñóz Peña");
        expect(text).toContain("Dr. Iñaki Núñez Vázquez");
        expect(text).toContain("áéíóú, ñ, ü");
    });
});

describe("LegacyReportRendererV1 — long content (page-break candidate)", () => {
    it("does not lose any content when the source is long enough to require pagination in a real browser", () => {
        const { text } = renderReport(longContentMultipage);
        expect(text).toContain("número 1,");
        expect(text).toContain("número 10,");
        expect(text).toContain("número 20,");
    });

    it("produces a deterministic number of pages across repeated renders (same input -> same output)", () => {
        const run1 = renderReport(longContentMultipage);
        const first = run1.pages.length;
        run1.unmount();

        const run2 = renderReport(longContentMultipage);
        const second = run2.pages.length;
        run2.unmount();

        expect(second).toBe(first);
    });
});

describe("LegacyReportRendererV1 — re-render does not leak content between reports", () => {
    it("clears previously rendered pages when the report prop changes", () => {
        const ref = createRef<LegacyReportRendererV1Ref>();
        const { rerender } = render(<LegacyReportRendererV1 report={draftSingleSampleNoImages} ref={ref} />);
        expect(ref.current?.getPages()[0]?.textContent).toContain("Paciente de Prueba Uno");

        rerender(<LegacyReportRendererV1 report={emptyOptionalSections} ref={ref} />);
        const textAfter = ref.current?.getPages()[0]?.textContent ?? "";
        expect(textAfter).toContain("Paciente de Prueba Tres");
        expect(textAfter).not.toContain("Paciente de Prueba Uno");
    });
});
