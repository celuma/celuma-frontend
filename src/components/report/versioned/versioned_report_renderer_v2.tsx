import { useEffect, useRef, forwardRef, useImperativeHandle, type CSSProperties } from "react";
import type { ReportEnvelope, ReportSectionText, TemplateImageItem, TemplateOrderInput } from "../../../models/report";
import { normalizeReportTemplateJSON, resolveDisplayOrder, resolveSignatureMetadata } from "../../../models/report";
import { markdownTableToHtml } from "../table_utils";
import SignatureBlock, { type SignatureBlockSigner } from "../signature_block";
import type { ReportRendererRef, SignerLookupEntry } from "../legacy/legacy_report_types";
import type { ReportPresentationSnapshotV2, ReportTypographyConfig } from "./versioned_report_types";
import type { PageLayout } from "./page_layout";
import { extractRenderingSnapshot } from "./report_snapshot_validation";
import { resolvePageLayout } from "./page_layout";
import {
    DEFAULT_FOOTER_TEXT,
    DEFAULT_INSTITUTION_NAME,
    DEFAULT_NEUTRAL_LOGO_SRC,
} from "./default_report_presentation_v2";

/**
 * VersionedReportRendererV2 (Céluma 1.3 Phase 2, Block C, Story C4).
 *
 * Renders reports with `schema_version = 2` using EXCLUSIVELY
 * `report.report.rendering_snapshot` as the source of presentation/branding
 * (paper, margins, header, footer, color, institutional signer) — never a
 * live Tenant/Branch/ReportTemplateVersion query. See
 * phase-2-block-b-architecture-decision.md and
 * versioned-renderer-v2-contract.md for the full contract.
 *
 * Pagination is a deliberate, documented DUPLICATION of
 * LegacyReportRendererV1's fits()/makePage() algorithm, adapted to
 * configurable margins and optional header/footer bands — Legacy is frozen
 * and must never be touched or share code with this renderer (see
 * legacy-renderer-contract.md and Céluma1.3-Fase2.md §6.2).
 */

// Page layout constants (Letter, PORTRAIT only in this block — same physical
// page as Legacy; A4/landscape are explicitly out of scope).
const PX_TO_MM = 0.264583;
const PAGE_W_MM = 215.9;
const PAGE_H_MM = 279.4;
const CM_TO_MM = 10;
// Fixed band heights for header/footer content when enabled.
//
// Pre-Phase-5 final margin remediation: `margins_cm` is the EFFECTIVE page
// margin — the exact distance from the page edge to the usable content
// area (`bodyTopMm`/`bodyBottomMm` below). Header/footer band geometry
// (height/offset/gap) is a separate, internal-to-the-margin concern: by
// default a band sits flush against the body boundary (ending exactly
// where the configured margin ends), but it NEVER adds to the margin
// itself. See
// docs/celuma-1.3/pre-phase-5-legacy-margin-remediation/legacy-margin-contract.md.
const HEADER_BAND_MM = 24;
const FOOTER_BAND_MM = 16;
const BAND_GAP_MM = 4;

// Same concept as Legacy's PREDEFINED_BASE_KEYS — duplicated deliberately
// (see module docstring) rather than imported from legacy/, to keep V2
// fully independent of the legacy module.
const PREDEFINED_BASE_KEYS = new Set(["order_code", "patient", "study_type", "patient_age", "requesting_physician"]);

// Second post-Phase 2 remediation (UX) — Legacy parity. All fields consumed
// by these helpers are optional/additive in the snapshot; defaults reproduce
// the previous behavior exactly (single 1px line in the primary color, Arial,
// fixed sizes, left-aligned logo, centered content).
type DividerLike = {
    enabled: boolean;
    style: "SINGLE" | "DOUBLE";
    primary_width_px: number;
    secondary_width_px: number;
    gap_mm: number;
    color?: string | null;
} | undefined;

const DEFAULT_DIVIDER: NonNullable<DividerLike> = {
    enabled: true,
    style: "SINGLE",
    primary_width_px: 1,
    secondary_width_px: 1,
    gap_mm: 1,
    color: null,
};

function buildDividerElement(divider: DividerLike, primaryColor: string, edge: "bottom" | "top"): HTMLElement | null {
    const cfg = divider ?? DEFAULT_DIVIDER;
    if (!cfg.enabled) return null;
    const color = cfg.color || primaryColor;
    const wrapper = document.createElement("div");
    wrapper.style.position = "absolute";
    wrapper.style.left = "0";
    wrapper.style.right = "0";
    wrapper.style[edge] = "0";
    const line1 = document.createElement("div");
    line1.style.borderTop = `${cfg.primary_width_px}px solid ${color}`;
    wrapper.appendChild(line1);
    if (cfg.style === "DOUBLE") {
        const gap = document.createElement("div");
        gap.style.height = `${cfg.gap_mm}mm`;
        wrapper.appendChild(gap);
        const line2 = document.createElement("div");
        line2.style.borderTop = `${cfg.secondary_width_px}px solid ${color}`;
        wrapper.appendChild(line2);
    }
    return wrapper;
}

function fontFamilyCss(family: string | undefined): string {
    switch (family) {
        case "HELVETICA":
            return "Helvetica, Arial, sans-serif";
        case "TIMES":
            return "'Times New Roman', Times, serif";
        case "CALIBRI":
            return "Calibri, Arial, sans-serif";
        case "ARIAL":
        default:
            return "Arial, sans-serif";
    }
}

const DEFAULT_TYPOGRAPHY: ReportTypographyConfig = {
    font_family: "ARIAL",
    base_font_size_pt: 10,
    header_font_size_pt: 10,
    footer_font_size_pt: 7,
};

// ---------------------------------------------------------------------------
// Fourth post-Phase 2 remediation — Legacy-parity capabilities.
//
// ALL defaults in this section reproduce the renderer's pre-remediation
// behavior pixel-perfectly, so an already persisted V2 snapshot (without any
// new fields) continues rendering exactly the same. See
// v2-legacy-parity-capabilities.md.
// ---------------------------------------------------------------------------

/** Header subtitle before this remediation. */
const LEGACY_V2_SUBTITLE_PT = 8;
/** Header address / contact / signer before this remediation. */
const LEGACY_V2_DETAIL_PT = 7;
const DEFAULT_HEADER_PADDING_MM = 3;
const DEFAULT_FOOTER_PADDING_MM = 2;
/** Logo inset relative to its band's height before this remediation. */
const DEFAULT_LOGO_INSET_MM = 6;
const DEFAULT_HEADER_LOGO_MAX_WIDTH_MM = 32;
const DEFAULT_FOOTER_LOGO_MAX_WIDTH_MM = 28;

type LogoMode = "NONE" | "CUSTOM" | "CELUMA_DEFAULT";

/**
 * Resolves a band's image.
 *
 * An absent/null `mode` is NOT a mode: it is a snapshot from before this
 * remediation and resolves using the LITERAL expression the renderer used at
 * the time—the header fell back to Céluma's neutral isotipo when no URL
 * resolved; the footer did not. Reproducing it here rather than "translating"
 * the snapshot to an equivalent mode ensures no historical V2 report changes,
 * including when `logo_storage_id` existed but its URL did not resolve.
 *
 * With an EXPLICIT mode, `CUSTOM` never substitutes another image: if the URL
 * does not resolve, nothing is rendered. Céluma's isotipo appears inside the
 * document only when the letterhead requested it with `CELUMA_DEFAULT`.
 */
function resolveBandLogoSrc(
    mode: LogoMode | null | undefined,
    resolvedUrl: string | null | undefined,
    neutralFallbackWhenAbsent: boolean,
): string | null {
    if (mode == null) {
        return neutralFallbackWhenAbsent
            ? resolvedUrl || DEFAULT_NEUTRAL_LOGO_SRC
            : resolvedUrl || null;
    }
    if (mode === "NONE") return null;
    if (mode === "CELUMA_DEFAULT") return DEFAULT_NEUTRAL_LOGO_SRC;
    return resolvedUrl || null;
}

/** `?? fallback` that also treats `null` as "not configured". */
function mmOr(value: number | null | undefined, fallback: number): number {
    return value == null ? fallback : value;
}

/**
 * Maps a presentation snapshot onto the deterministic geometry model in
 * page_layout.ts. Called from BOTH the pagination effect and the render
 * path (to decide whether the configuration is renderable at all), so the
 * two can never disagree about where the body starts.
 */
function layoutForPresentation(presentation: ReportPresentationSnapshotV2): PageLayout {
    const margins = presentation.paper.margins_cm;
    return resolvePageLayout({
        pageWidthMm: PAGE_W_MM,
        pageHeightMm: PAGE_H_MM,
        margins: {
            topMm: margins.top * CM_TO_MM,
            rightMm: margins.right * CM_TO_MM,
            bottomMm: margins.bottom * CM_TO_MM,
            leftMm: margins.left * CM_TO_MM,
        },
        header: {
            enabled: presentation.header.enabled,
            heightMm: mmOr(presentation.header.height_mm, HEADER_BAND_MM),
            offsetMm: presentation.header.offset_mm ?? null,
            gapMm: mmOr(presentation.header.content_gap_mm, BAND_GAP_MM),
        },
        footer: {
            enabled: presentation.footer.enabled,
            heightMm: mmOr(presentation.footer.height_mm, FOOTER_BAND_MM),
            offsetMm: presentation.footer.offset_mm ?? null,
            gapMm: mmOr(presentation.footer.content_gap_mm, BAND_GAP_MM),
        },
    });
}

function alignItemsForHeaderAlignment(alignment: string | undefined): string {
    if (alignment === "TOP") return "flex-start";
    if (alignment === "BOTTOM") return "flex-end";
    return "center";
}

function justifyContentForAlignment(alignment: string | undefined): string {
    if (alignment === "LEFT") return "flex-start";
    if (alignment === "RIGHT") return "flex-end";
    return "center";
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

interface VersionedReportRendererV2Props {
    report: ReportEnvelope;
    /** Candidates the signature block can use to resolve `report.signed_by`. */
    signerLookup?: SignerLookupEntry[];
    style?: CSSProperties;
}

export type VersionedReportRendererV2Ref = ReportRendererRef;

const VersionedReportRendererV2 = forwardRef<VersionedReportRendererV2Ref, VersionedReportRendererV2Props>(
    ({ report, style, signerLookup }, ref) => {
        const previewHostRef = useRef<HTMLDivElement>(null);
        const hiddenSourceRef = useRef<HTMLDivElement>(null);

        useImperativeHandle(ref, () => ({
            getPages: () => {
                if (!previewHostRef.current) return [];
                return Array.from(previewHostRef.current.children).filter(
                    (el) => el instanceof HTMLElement,
                ) as HTMLElement[];
            },
        }), []);

        // Validated once per render; the effect below closes over this
        // render's result. A missing/invalid snapshot never throws — it
        // just leaves previewHostRef empty (getPages() returns []) and the
        // component renders a controlled fallback below.
        const validation = extractRenderingSnapshot(report.report);

        useEffect(() => {
            const host = previewHostRef.current;
            if (!host) return;
            host.innerHTML = "";
            // Recomputed here (not taken from the outer `validation` const)
            // so this effect's dependency array can stay [report,
            // signerLookup] — same stability as LegacyReportRendererV1 —
            // instead of depending on a freshly-allocated object every render.
            const effectValidation = extractRenderingSnapshot(report.report);
            if (!effectValidation.valid) return;

            const sourceInDOM = hiddenSourceRef.current?.querySelector("#reporte-content-v2") as HTMLElement | null;
            if (!sourceInDOM) return;

            const { presentation } = effectValidation.snapshot;
            const headerEnabled = presentation.header.enabled;
            const footerEnabled = presentation.footer.enabled;

            // Page geometry is resolved by `resolvePageLayout` (page_layout.ts)
            // — one deterministic, unit-tested function that keeps the page
            // margin literal while guaranteeing the body never overlaps an
            // occupied header/footer band. Band heights/gaps keep their
            // pre-existing `mmOr(..., CONSTANT)` defaults so a snapshot
            // without these fields produces the same band size as always.
            const layout = layoutForPresentation(presentation);

            const headerHeightMm = layout.header.heightMm;
            const footerHeightMm = layout.footer.heightMm;
            const headerOffsetMm = layout.header.topMm;
            const footerOffsetMm = layout.footer.bottomMm;
            const bodyTopMm = layout.body.topMm;
            const bodyBottomMm = layout.body.bottomMm;
            // Horizontal insets are always the literal margins — this
            // letterhead model has no side bands (see page_layout.ts).
            const marginLeftMm = layout.body.leftMm;
            const marginRightMm = layout.body.rightMm;

            const headerPaddingMm = mmOr(presentation.header.padding_mm, DEFAULT_HEADER_PADDING_MM);
            const footerPaddingMm = mmOr(presentation.footer.padding_mm, DEFAULT_FOOTER_PADDING_MM);
            const bodyPaddingTopMm = mmOr(presentation.paper.body_padding_top_mm, 0);

            // A configuration whose bands + margins consume the whole page
            // leaves no usable body area. Paginating into a zero/negative
            // height box would make `fits()` reject EVERY node and emit one
            // page per paragraph, so bail out to the controlled fallback the
            // component renders below instead of drawing overlapping content.
            if (!layout.usable) return;

            const contentWpx = Math.round(layout.body.availableWidthMm / PX_TO_MM);
            const contentHpx = Math.round(layout.body.availableHeightMm / PX_TO_MM);

            const primaryColor = presentation.style.primary_color;
            // `true` in the header / `false` in the footer = the real
            // asymmetry the renderer had before this remediation (see
            // resolveBandLogoSrc). The neutral isotipo stops appearing as soon
            // as the letterhead explicitly declares `logo_mode`.
            const headerLogoSrc = resolveBandLogoSrc(
                presentation.header.logo_mode,
                report.resolved_resources?.header_logo_url,
                true,
            );
            const footerLogoSrc = resolveBandLogoSrc(
                presentation.footer.logo_mode,
                report.resolved_resources?.footer_logo_url,
                false,
            );
            // The "Céluma" fallback ensures an enabled header never renders
            // without any identity. With `signer_placement = INLINE`, the
            // institutional block already consists of signer lines (the Legacy
            // form: name, specialty, affiliation, licenses), so prepending
            // "Céluma" would invent an institution the letterhead did not
            // request. All other cases retain the fallback unchanged.
            const institutionName = presentation.header.institution_name
                || (presentation.header.signer_placement === "INLINE" ? null : DEFAULT_INSTITUTION_NAME);
            const subtitle = presentation.header.subtitle;
            const address = presentation.header.address;
            const phone = presentation.header.phone;
            const email = presentation.header.email;
            const signer = presentation.signer;
            const footerText = presentation.footer.custom_text || DEFAULT_FOOTER_TEXT;
            // Second post-Phase 2 remediation (UX) — Legacy parity:
            const typography = presentation.style.typography ?? DEFAULT_TYPOGRAPHY;
            const bodyFontFamily = fontFamilyCss(typography.font_family);
            const headerFontSizePt = typography.header_font_size_pt ?? DEFAULT_TYPOGRAPHY.header_font_size_pt;
            const footerFontSizePt = typography.footer_font_size_pt ?? DEFAULT_TYPOGRAPHY.footer_font_size_pt;
            const baseFontSizePt = typography.base_font_size_pt ?? DEFAULT_TYPOGRAPHY.base_font_size_pt;
            // Outer-margin rule (pre-Phase-5 final outer-margin remediation).
            //
            // The configured page margin must be the distance from the
            // physical page edge to the FIRST PRINTED INK, not merely to the
            // band's invisible box. A band is normally taller than its
            // content (`height_mm` reserves body clearance), so aligning
            // content anywhere other than against the margin edge leaves that
            // leftover space between the margin and the first ink — measured
            // at +6.8mm (Legacy) and +3.0mm (custom V2) before this fix, on
            // every margin value alike.
            //
            // So when the band is positioned BY the margin, its content is
            // pinned to the margin edge: the header's content to the band's
            // top, the footer's to the band's bottom. `height_mm` still
            // reserves the same clearance, so the body safe area is
            // unchanged and non-overlap still holds.
            //
            // An explicit `offset_mm` means Legacy compatibility mode (the
            // band is pinned to the physical page edge to reproduce
            // LegacyReportRendererV1); there the historical internal
            // alignment is preserved untouched.
            const headerAlignItems = layout.header.marginPositioned
                ? "flex-start"
                : alignItemsForHeaderAlignment(presentation.header.content_alignment);
            const footerAlignItems = layout.footer.marginPositioned ? "flex-end" : "center";
            const headerLogoRight = presentation.header.logo_position === "RIGHT";
            const footerLogoRight = presentation.footer.logo_position === "RIGHT";
            const footerContentJustify = justifyContentForAlignment(presentation.footer.content_alignment);
            const footerTextAlign = presentation.footer.content_alignment === "LEFT"
                ? "left"
                : presentation.footer.content_alignment === "RIGHT"
                    ? "right"
                    : "center";

            // Fourth remediation — secondary weights and sizes. `null`
            // preserves the renderer's existing per-line mix (institution 700
            // / remainder 400, subtitle 8pt, details 7pt); an explicit value
            // unifies the property across the whole band, matching the Legacy
            // header and footer form.
            const headerWeightPrimary = typography.header_font_weight ?? 700;
            const headerWeightSecondary = typography.header_font_weight ?? 400;
            const headerSubtitlePt = typography.header_secondary_font_size_pt ?? LEGACY_V2_SUBTITLE_PT;
            const headerDetailPt = typography.header_secondary_font_size_pt ?? LEGACY_V2_DETAIL_PT;
            const footerFontWeight = typography.footer_font_weight ?? null;
            const bodyFontWeight = typography.body_font_weight ?? null;
            const bandLineHeight = typography.line_height ?? null;

            const signerPlacement = presentation.header.signer_placement ?? "RIGHT";
            const footerLayout = presentation.footer.layout ?? "GROUPED";
            const headerLogoHeightMm = mmOr(
                presentation.header.logo_height_mm,
                headerHeightMm - DEFAULT_LOGO_INSET_MM,
            );
            const headerLogoMaxWidthMm = mmOr(
                presentation.header.logo_max_width_mm,
                DEFAULT_HEADER_LOGO_MAX_WIDTH_MM,
            );
            const footerLogoHeightMm = mmOr(
                presentation.footer.logo_height_mm,
                footerHeightMm - DEFAULT_LOGO_INSET_MM,
            );
            const footerLogoMaxWidth = presentation.footer.logo_max_width_pct != null
                ? `${presentation.footer.logo_max_width_pct}%`
                : `${DEFAULT_FOOTER_LOGO_MAX_WIDTH_MM}mm`;
            const footerTextMaxWidth = presentation.footer.text_max_width_pct != null
                ? `${presentation.footer.text_max_width_pct}%`
                : null;

            type BandLine = { text: string; weight: number };
            const signerLines: BandLine[] = signer
                ? ([
                    signer.display_name ? { text: signer.display_name, weight: headerWeightPrimary } : null,
                    signer.specialty ? { text: signer.specialty, weight: headerWeightSecondary } : null,
                    signer.affiliation ? { text: signer.affiliation, weight: headerWeightSecondary } : null,
                    signer.license_number ? { text: signer.license_number, weight: headerWeightSecondary } : null,
                ] as Array<BandLine | null>).filter((l): l is BandLine => l !== null)
                : [];

            const makePage = () => {
                const page = document.createElement("div");
                page.style.width = "8.5in";
                page.style.height = "11in";
                page.style.background = "#ffffff";
                page.style.backgroundColor = "#ffffff";
                page.style.boxShadow = "0 0 6px rgba(0,0,0,.2)";
                page.style.margin = "16px auto";
                page.style.position = "relative";
                page.style.overflow = "hidden";

                if (headerEnabled) {
                    const header = document.createElement("div");
                    header.style.position = "absolute";
                    header.style.top = `${headerOffsetMm}mm`;
                    header.style.left = `${marginLeftMm}mm`;
                    header.style.right = `${marginRightMm}mm`;
                    header.style.height = `${headerHeightMm}mm`;
                    header.style.display = "flex";
                    header.style.alignItems = headerAlignItems;
                    header.style.justifyContent = "space-between";
                    header.style.gap = "8px";
                    header.style.color = primaryColor;
                    header.style.fontFamily = bodyFontFamily;
                    header.style.paddingBottom = `${headerPaddingMm}mm`;
                    if (bandLineHeight != null) header.style.lineHeight = String(bandLineHeight);

                    // Institutional block: name/subtitle/address/contact and,
                    // when `signer_placement = INLINE`, institutional signer
                    // credentials as additional lines using the SAME
                    // typography. This exactly matches the Legacy header:
                    // one block of four identical lines, without a right
                    // column or logo.
                    const inlineSignerHtml = signerPlacement === "INLINE"
                        ? signerLines
                            .map((l) => `<div style="font-weight:${l.weight};font-size:${headerDetailPt}pt;">${escapeHtml(l.text)}</div>`)
                            .join("")
                        : "";

                    const identityText = document.createElement("div");
                    identityText.innerHTML = `
                          ${institutionName ? `<div style="font-weight:${headerWeightPrimary};font-size:${headerFontSizePt}pt;">${escapeHtml(institutionName)}</div>` : ""}
                          ${subtitle ? `<div style="font-weight:${headerWeightSecondary};font-size:${headerSubtitlePt}pt;">${escapeHtml(subtitle)}</div>` : ""}
                          ${address ? `<div style="font-weight:${headerWeightSecondary};font-size:${headerDetailPt}pt;">${escapeHtml(address)}</div>` : ""}
                          ${(phone || email) ? `<div style="font-weight:${headerWeightSecondary};font-size:${headerDetailPt}pt;">${[phone, email].filter(Boolean).map((v) => escapeHtml(v as string)).join(" · ")}</div>` : ""}
                          ${inlineSignerHtml}
                    `;

                    if (headerLogoSrc) {
                        // With a logo, preserve the existing `identity`
                        // wrapper (grouped logo + text).
                        const identity = document.createElement("div");
                        identity.style.display = "flex";
                        identity.style.alignItems = "center";
                        identity.style.gap = "8px";
                        if (headerLogoRight) identity.style.flexDirection = "row-reverse";
                        const img = document.createElement("img");
                        img.src = headerLogoSrc;
                        img.alt = "Logo";
                        img.crossOrigin = "anonymous";
                        img.style.display = "block";
                        img.style.height = `${headerLogoHeightMm}mm`;
                        img.style.width = "auto";
                        img.style.maxWidth = `${headerLogoMaxWidthMm}mm`;
                        img.style.objectFit = "contain";
                        identity.appendChild(img);
                        identity.appendChild(identityText);
                        header.appendChild(identity);
                    } else {
                        // Without a logo, do NOT wrap or reserve any box: the
                        // text block is a direct child of the band, as in
                        // LegacyReportRendererV1. This fixes the "reserved
                        // logo space despite no header logo" issue.
                        header.appendChild(identityText);
                    }

                    if (signerPlacement === "RIGHT" && signerLines.length > 0) {
                        const signerBlock = document.createElement("div");
                        signerBlock.style.textAlign = "right";
                        signerBlock.innerHTML = signerLines
                            .map((l) => `<div style="font-weight:${l.weight};font-size:${headerDetailPt}pt;">${escapeHtml(l.text)}</div>`)
                            .join("");
                        header.appendChild(signerBlock);
                    }

                    const headerDivider = buildDividerElement(presentation.header.divider, primaryColor, "bottom");
                    if (headerDivider) header.appendChild(headerDivider);

                    page.appendChild(header);
                }

                const body = document.createElement("div");
                body.style.position = "absolute";
                body.style.top = `${bodyTopMm}mm`;
                body.style.bottom = `${bodyBottomMm}mm`;
                body.style.left = `${marginLeftMm}mm`;
                body.style.right = `${marginRightMm}mm`;
                body.style.overflow = "hidden";
                body.style.width = `${contentWpx}px`;
                body.style.height = `${contentHpx}px`;
                body.style.boxSizing = "border-box";
                body.style.background = "#ffffff";
                body.style.backgroundColor = "#ffffff";
                body.style.fontFamily = bodyFontFamily;
                body.style.fontSize = `${baseFontSizePt}pt`;
                body.style.color = "#000000";
                // Fourth remediation: `0mm` (the default) exactly matches the
                // previous renderer—it did not declare `padding-top`. Legacy
                // declares 4mm within the same `border-box`, so the pageable
                // area is reduced equally in both.
                body.style.paddingTop = `${bodyPaddingTopMm}mm`;
                if (bodyFontWeight != null) body.style.fontWeight = String(bodyFontWeight);

                // Fourth remediation: insert the body BEFORE the footer
                // (header → body → footer order, matching
                // LegacyReportRendererV1). It was previously inserted after;
                // while all three bands are absolutely positioned and do not
                // overlap—so not a single pixel changes—it changed PDF content
                // flow order: footer text was extracted before body text. That
                // affects copy/paste, PDF search, and screen readers, and made
                // page-by-page comparison with the Legacy PDF impossible.
                page.appendChild(body);

                if (footerEnabled) {
                    const footer = document.createElement("div");
                    footer.style.position = "absolute";
                    footer.style.bottom = `${footerOffsetMm}mm`;
                    footer.style.left = `${marginLeftMm}mm`;
                    footer.style.right = `${marginRightMm}mm`;
                    footer.style.height = `${footerHeightMm}mm`;
                    footer.style.display = "flex";
                    footer.style.alignItems = footerAlignItems;
                    footer.style.justifyContent = "space-between";
                    footer.style.color = primaryColor;
                    footer.style.fontSize = `${footerFontSizePt}pt`;
                    footer.style.fontFamily = bodyFontFamily;
                    footer.style.paddingTop = `${footerPaddingMm}mm`;
                    if (footerFontWeight != null) footer.style.fontWeight = String(footerFontWeight);
                    if (bandLineHeight != null) footer.style.lineHeight = String(bandLineHeight);

                    const buildFooterLogo = () => {
                        if (!footerLogoSrc) return null;
                        const img = document.createElement("img");
                        img.src = footerLogoSrc;
                        img.alt = "Logo";
                        img.crossOrigin = "anonymous";
                        img.style.display = "block";
                        img.style.height = `${footerLogoHeightMm}mm`;
                        img.style.width = "auto";
                        img.style.maxWidth = footerLogoMaxWidth;
                        img.style.objectFit = "contain";
                        return img;
                    };

                    const text = document.createElement("div");
                    // `white-space: pre-line` lets `custom_text` with line
                    // breaks render multiple lines—the Legacy footer prints
                    // address and contact on two lines. The contract forbids
                    // markup, so `\n` is the only way to express this; for
                    // text without line breaks, the result matches the prior
                    // behavior (consecutive spaces collapse as with `normal`).
                    text.textContent = footerText;
                    text.style.whiteSpace = "pre-line";
                    text.style.textAlign = footerTextAlign;
                    if (footerTextMaxWidth) text.style.maxWidth = footerTextMaxWidth;

                    if (footerLayout === "SPLIT") {
                        // Legacy form: logo and text are DIRECT siblings
                        // separated by the band's own
                        // `justify-content: space-between`—no intermediate
                        // box and no `gap`.
                        const logo = buildFooterLogo();
                        if (logo) footer.appendChild(footerLogoRight ? text : logo);
                        footer.appendChild(logo ? (footerLogoRight ? logo : text) : text);
                    } else {
                        // Second post-Phase 2 remediation (UX): logo + text
                        // group, like the header.
                        const identity = document.createElement("div");
                        identity.style.display = "flex";
                        identity.style.alignItems = "center";
                        identity.style.justifyContent = footerContentJustify;
                        identity.style.gap = "8px";
                        identity.style.flex = "1";
                        if (footerLogoRight) identity.style.flexDirection = "row-reverse";

                        const logo = buildFooterLogo();
                        if (logo) identity.appendChild(logo);
                        identity.appendChild(text);
                        footer.appendChild(identity);
                    }

                    if (presentation.footer.show_page_number) {
                        const pageNum = document.createElement("div");
                        pageNum.dataset.pageNumber = "true";
                        pageNum.textContent = "";
                        footer.appendChild(pageNum);
                    }

                    const footerDivider = buildDividerElement(presentation.footer.divider, primaryColor, "top");
                    if (footerDivider) footer.appendChild(footerDivider);

                    page.appendChild(footer);
                }

                host.appendChild(page);
                return { page, body };
            };

            const work = sourceInDOM.cloneNode(true) as HTMLElement;
            const nodes = Array.from(work.childNodes);

            const fits = (container: HTMLElement, el: HTMLElement) => {
                container.appendChild(el);
                const ok = container.scrollHeight <= container.clientHeight;
                if (!ok) container.removeChild(el);
                return ok;
            };

            let { body } = makePage();

            nodes.forEach((node) => {
                if (node.nodeType === Node.TEXT_NODE) {
                    const span = document.createElement("span");
                    span.textContent = node.textContent || "";
                    if (!fits(body, span)) {
                        ({ body } = makePage());
                        body.appendChild(span);
                    }
                    return;
                }

                const elem = node as HTMLElement;
                if (!(elem instanceof HTMLElement)) return;

                const block = elem.cloneNode(true) as HTMLElement;
                if (fits(body, block)) return;

                ({ body } = makePage());
                if (block.scrollHeight <= body.clientHeight) {
                    body.appendChild(block);
                    return;
                }

                const shell = block.cloneNode(false) as HTMLElement;
                body.appendChild(shell);
                Array.from(block.childNodes).forEach((child) => {
                    const c = child.cloneNode(true) as HTMLElement;
                    if (!fits(body, c)) {
                        ({ body } = makePage());
                        body.appendChild(c);
                    } else {
                        shell.appendChild(c);
                    }
                });
            });

            // Second pass: page numbers depend on the final page count, only
            // known once pagination above has finished.
            if (footerEnabled && presentation.footer.show_page_number) {
                const pages = Array.from(host.children);
                pages.forEach((p, i) => {
                    const numEl = p.querySelector('[data-page-number="true"]');
                    if (numEl) numEl.textContent = `Página ${i + 1} de ${pages.length}`;
                });
            }
        }, [report, signerLookup]);

        if (!validation.valid) {
            return (
                <div
                    style={{
                        ...style,
                        padding: 24,
                        border: "1px solid #e5e7eb",
                        borderRadius: 12,
                        background: "#fafbfc",
                        color: "#374151",
                        fontFamily: "Arial, sans-serif",
                    }}
                    data-testid="invalid-report-snapshot"
                >
                    <p style={{ margin: 0, fontWeight: 700 }}>Reporte no disponible</p>
                    <p style={{ margin: "8px 0 0 0" }}>
                        Este reporte usa el formato de plantilla versionada pero su configuración de
                        presentación no es válida o no está disponible.
                    </p>
                    <p style={{ margin: "8px 0 0 0", fontSize: 12, color: "#6b7280" }}>{validation.error}</p>
                </div>
            );
        }

        const snapshot = validation.snapshot;

        // Pre-Phase-5 final layout remediation: a schema-valid configuration
        // can still be geometrically unrenderable (margins plus header/footer
        // bands consuming the whole page height). The effect above refuses to
        // paginate in that case; surface WHY here rather than showing a blank
        // page or silently overlapping content. Same controlled-fallback
        // convention as an invalid snapshot.
        const pageLayout = layoutForPresentation(snapshot.presentation);
        if (!pageLayout.usable) {
            return (
                <div
                    style={{
                        ...style,
                        padding: 24,
                        border: "1px solid #e5e7eb",
                        borderRadius: 12,
                        background: "#fafbfc",
                        color: "#374151",
                        fontFamily: "Arial, sans-serif",
                    }}
                    data-testid="unusable-page-layout"
                >
                    <p style={{ margin: 0, fontWeight: 700 }}>Configuración de página sin área útil</p>
                    <p style={{ margin: "8px 0 0 0" }}>
                        Los márgenes y las bandas de encabezado/pie ocupan toda la página, por lo que no
                        queda espacio para el contenido del reporte. Reduce los márgenes o la altura del
                        encabezado/pie en el membrete.
                    </p>
                </div>
            );
        }

        const tmpl = normalizeReportTemplateJSON(
            (snapshot.template ?? { base: {}, sections: {} }) as unknown as TemplateOrderInput,
        );
        const contentData = report.report ?? { base: {}, sections: {} };

        const { baseOrder, sectionOrder } = resolveDisplayOrder(tmpl, contentData);

        const signatureMeta = resolveSignatureMetadata(
            contentData as { signatureMetadata?: ReportEnvelope["report"]["signatureMetadata"] },
        );
        const signerEntry = report.signed_by
            ? signerLookup?.find((u) => u.id === report.signed_by)
            : undefined;
        const signerDisplay: SignatureBlockSigner | undefined = signerEntry
            ? { full_name: signerEntry.name }
            : undefined;

        const orderedBaseRows = baseOrder
            .map((k) => {
                const v = tmpl.base[k];
                if (!v?.is_visible) return null;
                const isCustom = (v as { is_custom?: boolean }).is_custom === true;
                if (!PREDEFINED_BASE_KEYS.has(k) && !isCustom) return null;
                return {
                    key: k,
                    label: v.label,
                    value: (contentData.base[k]?.value as string) ?? "",
                };
            })
            .filter((row): row is { key: string; label: string; value: string } => row !== null);

        const sections = sectionOrder
            .map((k) => {
                const v = tmpl.sections[k];
                if (!v?.is_visible) return null;
                const savedSection = contentData.sections[k];
                return { key: k, section: v, savedContent: savedSection };
            })
            .filter((row): row is { key: string; section: NonNullable<typeof tmpl.sections[string]>; savedContent: typeof contentData.sections[string] } => row !== null);

        return (
            <div style={style}>
                <div
                    ref={hiddenSourceRef}
                    style={{ position: "fixed", left: "-10000px", top: 0, width: 0, height: 0, overflow: "hidden" }}
                    aria-hidden
                >
                    <div id="reporte-content-v2" style={{ fontFamily: "Arial, sans-serif", fontSize: "10pt", color: "#000" }}>
                        <div style={{ marginBottom: 12 }}>
                            {orderedBaseRows.map(({ key, label, value }) => (
                                <p key={key} style={{ margin: "2px 0", fontSize: "10pt" }}>
                                    <b>{label}:</b>{" "}
                                    {value || <em style={{ color: "#888" }}>Sin especificar</em>}
                                </p>
                            ))}
                        </div>

                        <hr style={{ border: "none", borderTop: "1px solid #ccc", margin: "12px 0" }} />

                        {sections.map(({ key, section, savedContent }) => {
                            const sectionHeader = (
                                <h3 style={{
                                    margin: "0 0 6px 0",
                                    fontSize: "11pt",
                                    fontWeight: 700,
                                    color: snapshot.presentation.style.primary_color,
                                    borderBottom: "1px solid #e5e7eb",
                                    paddingBottom: 3,
                                }}>
                                    {section.label}
                                </h3>
                            );

                            if (section.type === "images") {
                                const images = (
                                    savedContent && Array.isArray(savedContent.content)
                                        ? savedContent.content
                                        : []
                                ) as TemplateImageItem[];
                                if (images.length === 0) return null;
                                return (
                                    <div key={key} style={{ marginBottom: 14 }}>
                                        <hr style={{ border: "none", borderTop: "1px solid #ccc", margin: "12px 0" }} />
                                        {sectionHeader}
                                        <div style={{
                                            display: "grid",
                                            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                                            gap: 10,
                                        }}>
                                            {images.map((img, idx) => (
                                                <div key={img.id || idx} style={{
                                                    border: "1px solid #e5e7eb",
                                                    borderRadius: 6,
                                                    overflow: "hidden",
                                                    background: "#fff",
                                                }}>
                                                    <img
                                                        src={img.url}
                                                        alt={img.caption || `Figura ${idx + 1}`}
                                                        style={{ width: "100%", height: 200, objectFit: "contain", background: "#fafafa", display: "block" }}
                                                        crossOrigin="anonymous"
                                                    />
                                                    <div style={{ padding: "5px 8px", fontSize: "9pt", borderTop: "1px solid #f0f0f0" }}>
                                                        <b>Figura {idx + 1}.</b>{" "}
                                                        {img.caption && img.caption.trim().length > 0
                                                            ? img.caption
                                                            : <em> </em>}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            }

                            const rawContent = savedContent
                                ? (savedContent as ReportSectionText).content || ""
                                : "";

                            if (!rawContent) return null;

                            if (section.type === "table") {
                                return (
                                    <div key={key} style={{ marginBottom: 14 }}>
                                        {sectionHeader}
                                        <div
                                            style={{ fontSize: "10pt" }}
                                            dangerouslySetInnerHTML={{ __html: markdownTableToHtml(rawContent) }}
                                        />
                                    </div>
                                );
                            }

                            return (
                                <div key={key} style={{ marginBottom: 14 }}>
                                    {sectionHeader}
                                    <div
                                        style={{ fontSize: "10pt", lineHeight: 1.5 }}
                                        dangerouslySetInnerHTML={{ __html: rawContent }}
                                    />
                                </div>
                            );
                        })}

                        <SignatureBlock
                            signatureMetadata={signatureMeta}
                            signedBy={signerDisplay}
                            signedAt={report.signed_at}
                        />
                    </div>
                </div>

                <div ref={previewHostRef} />
            </div>
        );
    },
);

VersionedReportRendererV2.displayName = "VersionedReportRendererV2";

export default VersionedReportRendererV2;
