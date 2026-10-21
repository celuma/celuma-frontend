/**
 * DOM builders for the two per-page bands of `VersionedReportRendererV2` (Céluma 1.4, #14 / #15).
 *
 * Both are built imperatively because the renderer assembles its pages imperatively (and local print
 * clones those pages into a bare iframe), and both are MEASURED before pagination so the space they
 * take is reserved by `resolvePageComposition` rather than guessed.
 *
 * Every dimension below is a REVIEW CANDIDATE, not an owner-approved design (see
 * celuma-engineering/specs/reports/renderer.md, "Report composition"): they live in one place so a
 * reviewer can change them without touching layout logic.
 */
import { formatSignedDate } from "../signature_format";

/** Maximum signature image area (candidate from the #14 handoff: 45 mm x 12 mm). */
export const SIGNATURE_IMAGE_MAX_WIDTH_MM = 45;
export const SIGNATURE_IMAGE_MAX_HEIGHT_MM = 12;
/** Width of the signature block: the line and the identity text wrap inside it, never beyond it. */
export const SIGNATURE_BLOCK_WIDTH_MM = 64;
const SIGNED_LINE_PT = 7.5;

export interface RepeatedFieldRow {
    key: string;
    label: string;
    value: string;
}

export interface RepeatedBandStyle {
    fontFamily: string;
    fontSizePt: number;
    color: string;
}

/**
 * Compact identification band: `Label: value` pairs flowing left to right and wrapping onto further
 * lines, so a long patient name, several requesting physicians or many sample codes make the band
 * taller (and the body shorter) instead of being cropped.
 */
export function buildRepeatedFieldsBand(rows: RepeatedFieldRow[], style: RepeatedBandStyle): HTMLElement {
    const band = document.createElement("div");
    band.dataset.pageBand = "repeated-fields";
    band.style.boxSizing = "border-box";
    band.style.display = "flex";
    band.style.flexWrap = "wrap";
    band.style.columnGap = "5mm";
    band.style.rowGap = "0.5mm";
    band.style.paddingBottom = "1mm";
    band.style.borderBottom = "0.5px solid #9ca3af";
    band.style.fontFamily = style.fontFamily;
    band.style.fontSize = `${style.fontSizePt}pt`;
    band.style.lineHeight = "1.25";
    band.style.color = "#000";
    rows.forEach((row) => {
        const item = document.createElement("div");
        item.dataset.repeatedField = row.key;
        item.style.minWidth = "0";
        item.style.overflowWrap = "anywhere";
        const label = document.createElement("b");
        label.textContent = `${row.label}:`;
        item.appendChild(label);
        item.appendChild(document.createTextNode(" "));
        if (row.value) {
            item.appendChild(document.createTextNode(row.value));
        } else {
            const empty = document.createElement("em");
            empty.style.color = "#888";
            empty.textContent = "Sin especificar";
            item.appendChild(empty);
        }
        band.appendChild(item);
    });
    return band;
}

export interface CompactSignatureInput {
    /** `signatureMetadata.require_digital_signature`: reserve (and, when signed, fill) the image area. */
    requireDigitalSignature: boolean;
    /** Only a SIGNED report may carry the autograph; a draft never shows an image. */
    signatureUrl: string | null;
    signerName: string | null;
    signedAt: string | null;
}

/**
 * Compact signature block, repeated on every page. It never invents a signature: an unsigned report
 * shows the signature line and "Pendiente de firma" only. When a digital signature is required the
 * image area keeps the same reserved height in every state, so pagination does not change at signing.
 */
export function buildCompactSignature(input: CompactSignatureInput): HTMLElement {
    const isSigned = Boolean(input.signedAt);
    const wantsImage = input.requireDigitalSignature;
    const showImage = wantsImage && isSigned && Boolean(input.signatureUrl);

    const band = document.createElement("div");
    band.dataset.pageBand = "signature";
    band.style.boxSizing = "border-box";
    band.style.display = "flex";
    band.style.flexDirection = "column";
    band.style.alignItems = "flex-end";
    band.style.fontFamily = "Arial, sans-serif";
    band.style.color = "#000";

    const block = document.createElement("div");
    block.style.width = `${SIGNATURE_BLOCK_WIDTH_MM}mm`;
    block.style.maxWidth = "100%";
    block.style.display = "flex";
    block.style.flexDirection = "column";
    block.style.alignItems = "center";
    band.appendChild(block);

    let sub: HTMLElement | null = null;

    if (wantsImage) {
        const wrap = document.createElement("div");
        wrap.style.height = `${SIGNATURE_IMAGE_MAX_HEIGHT_MM}mm`;
        wrap.style.width = `${SIGNATURE_IMAGE_MAX_WIDTH_MM}mm`;
        wrap.style.display = "flex";
        wrap.style.alignItems = "flex-end";
        wrap.style.justifyContent = "center";
        if (showImage && input.signatureUrl) {
            const img = document.createElement("img");
            // `crossOrigin` BEFORE `src`: setting it afterwards restarts the load, and the official
            // render route's readiness gate could then read a half-restarted image as not decoded.
            img.crossOrigin = "anonymous";
            img.alt = "Firma digital del revisor";
            img.src = input.signatureUrl;
            // Stable hook for the official render route's readiness check (H-0c Blocker B).
            img.dataset.signatureAutograph = "required";
            img.style.display = "block";
            // Aspect ratio is preserved inside the fixed area for wide, tall and square images alike.
            img.style.maxWidth = "100%";
            img.style.maxHeight = "100%";
            img.style.width = "auto";
            img.style.height = "auto";
            img.style.objectFit = "contain";
            // A broken image falls back to the non-digital signed layout; the area keeps its height.
            // The element stays in the DOM (hidden): the official render route's readiness check
            // must still find it, see it did not decode, and refuse the render (H-0c Blocker B).
            img.addEventListener("error", () => {
                img.style.display = "none";
                if (sub) sub.textContent = signedLine(false, input.signedAt);
            }, { once: true });
            wrap.appendChild(img);
        }
        block.appendChild(wrap);
    }

    const line = document.createElement("div");
    line.style.width = "100%";
    line.style.borderTop = "1px solid #000";
    line.style.height = "0";
    line.style.margin = "0 0 1mm 0";
    block.appendChild(line);

    const caption = document.createElement("div");
    caption.style.width = "100%";
    caption.style.textAlign = "center";
    caption.style.fontSize = "9pt";
    caption.style.lineHeight = "1.2";
    caption.style.overflowWrap = "anywhere";
    const name = (input.signerName ?? "").trim() || (isSigned ? "Firmante" : "");
    if (name) {
        caption.style.fontWeight = "600";
        caption.textContent = name;
    } else {
        caption.style.color = "#666";
        caption.textContent = "Pendiente de firma";
    }
    block.appendChild(caption);

    if (isSigned) {
        sub = document.createElement("div");
        sub.style.width = "100%";
        sub.style.textAlign = "center";
        sub.style.fontSize = `${SIGNED_LINE_PT}pt`;
        sub.style.lineHeight = "1.2";
        sub.style.color = "#444";
        sub.textContent = signedLine(showImage, input.signedAt);
        block.appendChild(sub);
    } else {
        // Reserve the signed-date line's height so pagination does not change at signing.
        const spacer = document.createElement("div");
        spacer.style.height = `${SIGNED_LINE_PT * 1.2}pt`;
        block.appendChild(spacer);
    }
    return band;
}

function signedLine(digital: boolean, signedAt: string | null): string {
    const date = formatSignedDate(signedAt);
    return `Firmado${digital ? " digitalmente" : ""}${date ? ` el ${date}` : ""}`;
}

/** Height of `el` in mm once laid out at `widthPx`, measured in `host` and removed again. */
export function measureElementMm(host: HTMLElement, el: HTMLElement, widthPx: number, pxToMm: number): number {
    const probe = document.createElement("div");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText = `position:absolute;left:-10000px;top:0;visibility:hidden;pointer-events:none;width:${widthPx}px;`;
    probe.appendChild(el);
    host.appendChild(probe);
    const heightPx = el.getBoundingClientRect().height;
    probe.remove();
    return Math.ceil(heightPx * pxToMm * 10) / 10;
}

/**
 * Nominal heights used only when an element cannot be measured (no layout engine, e.g. jsdom), so a
 * configured band still exists and still reserves space. A real browser always measures.
 */
export const NOMINAL_REPEATED_BAND_MM = 6;
export function nominalSignatureBandMm(requireDigitalSignature: boolean): number {
    return requireDigitalSignature ? SIGNATURE_IMAGE_MAX_HEIGHT_MM + 12 : 12;
}
