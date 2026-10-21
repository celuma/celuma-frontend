/**
 * Pure and DOM-structure unit tests for report composition (Céluma 1.4, #12/#14/#15/#19).
 *
 * jsdom has no layout engine, so pixel geometry is asserted in real Chromium by
 * tests-visual/report_composition.visual.spec.ts. What is provable here: the composition arithmetic,
 * the pagination algorithm itself (driven by an injected height model instead of real layout), the
 * repeated-field selection rules, the sample-code ordering and the signature band's states.
 */
import { describe, expect, it } from "vitest";
import {
    MIN_COMPOSED_BODY_HEIGHT_MM,
    REPEATED_BAND_GAP_MM,
    SIGNATURE_BAND_GAP_MM,
    resolvePageComposition,
    resolvePageLayout,
} from "../../../components/report/versioned/page_layout";
import { ATOMIC_ATTR, KEEP_WITH_NEXT_ATTR, SEPARATOR_ATTR, paginateSource } from "../../../components/report/versioned/report_pagination";
import {
    SIGNATURE_BLOCK_WIDTH_MM,
    SIGNATURE_IMAGE_MAX_HEIGHT_MM,
    SIGNATURE_IMAGE_MAX_WIDTH_MM,
    buildCompactSignature,
    buildRepeatedFieldsBand,
} from "../../../components/report/versioned/report_page_bands";
import { resolveRepeatedFieldRows } from "../../../components/report/versioned/repeated_fields";
import { formatSampleCodes } from "../../../lib/sample_codes";
import { buildCompositionReport } from "../../fixtures/reports/composition_scenarios";
import type { ReportEnvelope } from "../../../models/report";

const baseLayout = () =>
    resolvePageLayout({
        pageWidthMm: 215.9,
        pageHeightMm: 279.4,
        margins: { topMm: 15, rightMm: 15, bottomMm: 15, leftMm: 15 },
        header: { enabled: true, heightMm: 24, offsetMm: null, gapMm: 4 },
        footer: { enabled: true, heightMm: 16, offsetMm: null, gapMm: 4 },
    });

describe("resolvePageComposition — one calculation reserves every band", () => {
    it("with no extra band the body is exactly the header/footer safe area", () => {
        const layout = baseLayout();
        const c = resolvePageComposition({ layout, repeatedBandMm: 0, signatureBandMm: 0 });
        expect(c.first.topMm).toBe(layout.body.topMm);
        expect(c.first.bottomMm).toBe(layout.body.bottomMm);
        expect(c.first.availableHeightMm).toBeCloseTo(layout.body.availableHeightMm, 6);
        expect(c.continuation).toEqual(c.first);
        expect(c.repeatedBand).toBeNull();
        expect(c.signatureBand).toBeNull();
        expect(c.usable).toBe(layout.usable);
    });

    it("the repeated band pushes only continuation pages down, by its height plus the gap", () => {
        const layout = baseLayout();
        const c = resolvePageComposition({ layout, repeatedBandMm: 9, signatureBandMm: 0 });
        expect(c.first.topMm).toBe(layout.body.topMm);
        expect(c.continuation.topMm).toBe(layout.body.topMm + 9 + REPEATED_BAND_GAP_MM);
        expect(c.repeatedBand).toEqual({ topMm: layout.body.topMm, heightMm: 9 });
    });

    it("the signature band lifts the body bottom on EVERY page, above the footer clearance", () => {
        const layout = baseLayout();
        const c = resolvePageComposition({ layout, repeatedBandMm: 0, signatureBandMm: 22 });
        const expectedBottom = layout.body.bottomMm + 22 + SIGNATURE_BAND_GAP_MM;
        expect(c.first.bottomMm).toBe(expectedBottom);
        expect(c.continuation.bottomMm).toBe(expectedBottom);
        expect(c.signatureBand).toEqual({ bottomMm: layout.body.bottomMm, heightMm: 22 });
    });

    it("both bands together leave header + repeated + body + signature + footer inside the sheet", () => {
        const layout = baseLayout();
        const c = resolvePageComposition({ layout, repeatedBandMm: 12, signatureBandMm: 24 });
        const pageHeight = 279.4;
        const stackedMm = c.continuation.topMm + c.continuation.availableHeightMm + c.continuation.bottomMm;
        expect(stackedMm).toBeCloseTo(pageHeight, 6);
        expect(c.continuation.topMm).toBeGreaterThanOrEqual(layout.header.bottomMm + 4 + 12);
        expect(c.continuation.bottomMm).toBeGreaterThanOrEqual(layout.footer.topMm + 4 + 24);
        expect(c.continuation.availableHeightMm).toBeLessThan(c.first.availableHeightMm);
    });

    it("refuses a configuration whose bands leave no sensible body, instead of one line per page", () => {
        const layout = baseLayout();
        const c = resolvePageComposition({ layout, repeatedBandMm: 90, signatureBandMm: 90 });
        expect(c.usable).toBe(false);
        const edge = resolvePageComposition({
            layout,
            repeatedBandMm: 0,
            signatureBandMm: layout.body.availableHeightMm - MIN_COMPOSED_BODY_HEIGHT_MM - SIGNATURE_BAND_GAP_MM + 1,
        });
        expect(edge.usable).toBe(false);
    });
});

// ---- Pagination engine, driven by a height model ---------------------------------------------

/** Each element's cost is its `data-h` (default 0); a body fits while the sum stays within capacity. */
function heightOf(el: Element): number {
    return Number((el as HTMLElement).dataset.h ?? 0) + Array.from(el.children).reduce((n, c) => n + heightOf(c), 0);
}
function paginate(html: string, capacity: number) {
    const root = document.createElement("div");
    root.innerHTML = html;
    const pages: HTMLElement[] = [];
    const result = paginateSource(root, {
        newPage: () => {
            const body = document.createElement("div");
            pages.push(body);
            return body;
        },
        fits: (body) => heightOf(body) <= capacity,
        discardLastPage: () => { pages.pop(); },
    });
    return { pages, result };
}
// A row costs 10 however many figures it holds (they sit side by side).
const figure = (n: number) => `<div data-figure="${n}">Figura ${n}</div>`;
const row = (...n: number[]) => `<div ${ATOMIC_ATTR}="true" data-h="10">${n.map(figure).join("")}</div>`;

describe("paginateSource", () => {
    it("never clips: a grid taller than a page flows across pages, each figure once and in order", () => {
        // 20 figures in rows of 3 (the last row has 2), each row 10 tall, page capacity 25 => 2 rows/page.
        const rows: string[] = [];
        for (let n = 1; n <= 20; n += 3) rows.push(row(...[n, n + 1, n + 2].filter((x) => x <= 20)));
        const { pages, result } = paginate(`<div data-h="0"><h3 data-h="5">Imágenes</h3>${rows.join("")}</div>`, 25);
        const seen = pages.flatMap((p) => Array.from(p.querySelectorAll("[data-figure]")).map((f) => Number((f as HTMLElement).dataset.figure)));
        expect(seen).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
        expect(result.overflowedUnits).toBe(0);
        pages.forEach((p) => expect(heightOf(p)).toBeLessThanOrEqual(25));
        expect(pages.length).toBeGreaterThan(2);
    });

    it("keeps a figure row together: a row never splits across pages", () => {
        const { pages } = paginate(row(1, 2, 3) + row(4, 5, 6) + row(7, 8, 9), 14);
        pages.forEach((p) => {
            const rows = Array.from(p.querySelectorAll(`[${ATOMIC_ATTR}]`));
            rows.forEach((r) => expect(r.children.length).toBe(3));
        });
        expect(pages.length).toBe(3);
    });

    it("recreates the containers of a split table and list on the next page", () => {
        const html = `<table><tbody>${Array.from({ length: 6 }, (_, i) => `<tr data-h="10"><td>r${i + 1}</td></tr>`).join("")}</tbody></table>`
            + `<ol>${Array.from({ length: 4 }, (_, i) => `<li data-h="10">i${i + 1}</li>`).join("")}</ol>`;
        const { pages } = paginate(html, 30);
        pages.forEach((p) => {
            p.querySelectorAll("tr").forEach((tr) => expect(tr.closest("table")).not.toBeNull());
        });
        const rows = pages.flatMap((p) => Array.from(p.querySelectorAll("tr")).map((tr) => tr.textContent));
        expect(rows).toEqual(["r1", "r2", "r3", "r4", "r5", "r6"]);
        // The ordered list continues its numbering on the next page.
        const lists = pages.flatMap((p) => Array.from(p.querySelectorAll("ol")));
        expect(lists.length).toBeGreaterThan(1);
        expect(lists[0].getAttribute("start")).toBeNull();
        expect(lists[1].getAttribute("start")).toBe(String(lists[0].children.length + 1));
    });

    it("keeps a section title with the unit that follows it, once a block has to be split", () => {
        const html = `<div><p data-h="20">intro</p>`
            + `<hr ${KEEP_WITH_NEXT_ATTR}="true" ${SEPARATOR_ATTR}="true" data-h="2"/>`
            + `<h3 ${KEEP_WITH_NEXT_ATTR}="true" data-h="5">Título</h3>`
            + `<p data-h="12">primer párrafo</p></div>`;
        const { pages } = paginate(html, 30);
        expect(pages.length).toBe(2);
        expect(pages[0].textContent).toBe("intro");
        // The decorative rule is dropped at the head of the continuation page; title and text stay together.
        expect(pages[1].querySelector("hr")).toBeNull();
        expect(pages[1].textContent).toBe("Títuloprimer párrafo");
    });

    it("paginates exactly like the previous loop while no block exceeds a page: whole blocks move together", () => {
        // 25 + 25 + 25 with capacity 60: the third block does not fit the remaining 10, so the WHOLE block
        // (a section with several children) starts page 2 rather than being split across the break.
        const section = `<div data-h="0"><h3 data-h="5">T</h3><p data-h="10">a</p><p data-h="10">b</p></div>`;
        const { pages } = paginate(section + section + section, 60);
        expect(pages.length).toBe(2);
        expect(pages[0].querySelectorAll("h3").length).toBe(2);
        expect(pages[1].querySelectorAll("h3").length).toBe(1);
        expect(pages[1].textContent).toBe("Tab");
    });

    it("a block taller than a page begins on the page that still has room instead of leaving it blank", () => {
        const long = `<div>${Array.from({ length: 5 }, (_, i) => `<p data-h="20">p${i + 1}</p>`).join("")}</div>`;
        const { pages, result } = paginate(`<p data-h="10">intro</p>${long}`, 50);
        expect(result.overflowedUnits).toBe(0);
        // intro (10) + p1 (20) + p2 (20) fill the first page; the rest continues on the next.
        expect(pages[0].textContent).toBe("introp1p2");
        expect(pages.map((p) => p.textContent).join("|")).toBe("introp1p2|p3p4|p5");
    });

    it("places a unit that cannot fit even alone instead of dropping it, and reports it", () => {
        const { pages, result } = paginate(`<p data-h="5">a</p><p data-h="99">huge</p><p data-h="5">b</p>`, 30);
        expect(result.overflowedUnits).toBe(1);
        expect(pages.map((p) => p.textContent).join("|")).toBe("a|huge|b");
    });

    it("an empty source still produces one page", () => {
        expect(paginate("", 30).pages.length).toBe(1);
    });
});

// ---- Repeated fields (#15) --------------------------------------------------------------------

function envelopeWith(repeat: string[], hidden: string[] = []): ReportEnvelope {
    const report = buildCompositionReport({ repeat, extraBase: { expediente: "00123", sample_codes: "S-1, S-2" } });
    const template = (report.report as unknown as { rendering_snapshot: { template: { base: Record<string, { is_visible: boolean }> } } })
        .rendering_snapshot.template;
    hidden.forEach((k) => { template.base[k].is_visible = false; });
    return report;
}
const snapshotTemplate = (r: ReportEnvelope) =>
    (r.report as unknown as { rendering_snapshot: { template: unknown } }).rendering_snapshot.template;

describe("resolveRepeatedFieldRows", () => {
    it("selects only fields the template marks, in display order, with their labels and values", () => {
        const r = envelopeWith(["requesting_physician", "patient"]);
        const rows = resolveRepeatedFieldRows(r, snapshotTemplate(r));
        expect(rows.map((x) => x.key)).toEqual(["patient", "requesting_physician"]);
        expect(rows[0]).toMatchObject({ label: "Paciente", value: "Paciente Sintético Compuesto" });
    });

    it("never repeats a hidden field, even if it is flagged", () => {
        const r = envelopeWith(["patient", "expediente"], ["expediente"]);
        expect(resolveRepeatedFieldRows(r, snapshotTemplate(r)).map((x) => x.key)).toEqual(["patient"]);
    });

    it("repeats nothing when no field is flagged (every pre-1.4 snapshot)", () => {
        const r = envelopeWith([]);
        expect(resolveRepeatedFieldRows(r, snapshotTemplate(r))).toEqual([]);
        expect(resolveRepeatedFieldRows(r, null)).toEqual([]);
    });

    it("ignores a flag on a custom field: only predefined fields repeat", () => {
        const r = envelopeWith(["patient"]);
        const t = snapshotTemplate(r) as { base: Record<string, unknown> };
        t.base.campo_propio = { is_visible: true, label: "Campo propio", value: "", is_custom: true, type: "text", repeat_on_every_page: true };
        expect(resolveRepeatedFieldRows(r, t).map((x) => x.key)).toEqual(["patient"]);
    });

    it("keeps an empty value as an empty string so the band can say it is unspecified", () => {
        const r = envelopeWith(["sample_codes"]);
        (r.report.base as Record<string, { value: string }>).sample_codes.value = "";
        expect(resolveRepeatedFieldRows(r, snapshotTemplate(r))[0].value).toBe("");
    });
});

describe("buildRepeatedFieldsBand", () => {
    const style = { fontFamily: "Arial", fontSizePt: 8, color: "#000" };
    it("prints Label: value pairs, wrapping instead of cropping, and marks an empty value", () => {
        const band = buildRepeatedFieldsBand([
            { key: "patient", label: "Paciente", value: "Nombre Muy Largo ".repeat(10).trim() },
            { key: "sample_codes", label: "Códigos de muestra", value: "" },
        ], style);
        expect(band.dataset.pageBand).toBe("repeated-fields");
        expect(band.style.flexWrap).toBe("wrap");
        expect(band.textContent).toContain("Paciente: Nombre Muy Largo");
        expect(band.textContent).toContain("Códigos de muestra: Sin especificar");
        expect(band.querySelectorAll("[data-repeated-field]").length).toBe(2);
        // Text goes through textContent, never innerHTML.
        const hostile = buildRepeatedFieldsBand([{ key: "patient", label: "Paciente", value: "<img src=x onerror=alert(1)>" }], style);
        expect(hostile.querySelector("img")).toBeNull();
    });
});

// ---- Compact signature (#14) ------------------------------------------------------------------

describe("buildCompactSignature", () => {
    const signed = { requireDigitalSignature: true, signatureUrl: "data:image/png;base64,AAAA", signerName: "Dra. Firmante", signedAt: "2026-02-01T10:00:00Z" };

    it("signed with a digital signature: image in a 45 x 12 mm area, name and date", () => {
        const el = buildCompactSignature(signed);
        const img = el.querySelector("img")!;
        expect(img.dataset.signatureAutograph).toBe("required");
        const wrap = img.parentElement!;
        expect(wrap.style.width).toBe(`${SIGNATURE_IMAGE_MAX_WIDTH_MM}mm`);
        expect(wrap.style.height).toBe(`${SIGNATURE_IMAGE_MAX_HEIGHT_MM}mm`);
        expect(img.style.objectFit).toBe("contain");
        expect(el.textContent).toContain("Dra. Firmante");
        expect(el.textContent).toContain("Firmado digitalmente el");
        expect((el.firstElementChild as HTMLElement).style.width).toBe(`${SIGNATURE_BLOCK_WIDTH_MM}mm`);
    });

    it("unsigned draft: never an image, never a signed date, says it is pending", () => {
        const el = buildCompactSignature({ ...signed, signatureUrl: null, signedAt: null, signerName: null });
        expect(el.querySelector("img")).toBeNull();
        expect(el.textContent).toContain("Pendiente de firma");
        expect(el.textContent).not.toContain("Firmado");
        // The image area keeps its height so the band does not change size at signing.
        const areas = Array.from(el.querySelectorAll<HTMLElement>("div")).filter(
            (d) => d.style.height === `${SIGNATURE_IMAGE_MAX_HEIGHT_MM}mm`,
        );
        expect(areas.length).toBe(1);
    });

    it("a stored signature URL on an unsigned report is never drawn", () => {
        const el = buildCompactSignature({ ...signed, signedAt: null });
        expect(el.querySelector("img")).toBeNull();
    });

    it("signed without a digital image requirement: line, name and date only", () => {
        const el = buildCompactSignature({ ...signed, requireDigitalSignature: false });
        expect(el.querySelector("img")).toBeNull();
        expect(el.textContent).toMatch(/Firmado el/);
        expect(el.textContent).not.toContain("digitalmente");
    });

    it("a missing signer name on a signed report says so; a long name stays in the block", () => {
        expect(buildCompactSignature({ ...signed, signerName: null }).textContent).toContain("Firmante");
        const long = buildCompactSignature({ ...signed, signerName: "Nombre ".repeat(30).trim() });
        // Wrapping inside the 64 mm block (not cropping) is asserted in real Chromium; jsdom does not
        // model `overflow-wrap: anywhere`. Here: the whole name is present.
        expect(long.textContent).toContain("Nombre ".repeat(29).trim() + " Nombre");
    });

    it("a broken image falls back to the non-digital signed layout without changing the band height", () => {
        const el = buildCompactSignature(signed);
        const img = el.querySelector("img")!;
        const wrap = img.parentElement!;
        img.dispatchEvent(new Event("error"));
        // Hidden, not removed: the official render's readiness gate must still see it failed to decode.
        expect(el.querySelector("img")!.style.display).toBe("none");
        expect(wrap.style.height).toBe(`${SIGNATURE_IMAGE_MAX_HEIGHT_MM}mm`);
        expect(el.textContent).toMatch(/Firmado el/);
        expect(el.textContent).not.toContain("digitalmente");
    });
});

// ---- Sample codes (#12): ordering parity with the server --------------------------------------

describe("formatSampleCodes (same vectors as backend test_report_sample_codes.py)", () => {
    const s = (...codes: string[]) => codes.map((sample_code, i) => ({ id: `id-${i}`, sample_code }));
    it("lists many codes in stable natural order", () => {
        expect(formatSampleCodes(s("M-10", "M-2", "M-1", "B-3"))).toBe("B-3, M-1, M-2, M-10");
    });
    it("one code has no separator; none is empty", () => {
        expect(formatSampleCodes(s("ONLY-1"))).toBe("ONLY-1");
        expect(formatSampleCodes([])).toBe("");
        expect(formatSampleCodes(null)).toBe("");
    });
    it("ignores blank codes and trims", () => {
        expect(formatSampleCodes(s(" A-1 ", "", "  "))).toBe("A-1");
    });
    it("is deterministic regardless of input order", () => {
        const a = formatSampleCodes(s("2610-0002", "2610-0010", "2610-0001"));
        const b = formatSampleCodes(s("2610-0001", "2610-0002", "2610-0010"));
        expect(a).toBe(b);
        expect(a).toBe("2610-0001, 2610-0002, 2610-0010");
    });
});
