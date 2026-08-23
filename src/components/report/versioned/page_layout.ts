/**
 * Deterministic page geometry for `VersionedReportRendererV2`.
 *
 * Pre-Phase-5 final renderer-layout remediation. This module exists to make
 * ONE thing unambiguous and unit-testable: the difference between the three
 * concepts the previous remediation passes conflated.
 *
 *   1. PAGE MARGIN — the literal inset from the physical page edge that the
 *      user configures (`paper.margins_cm`). `0.5cm` is `5mm`, always. It is
 *      never inflated by header/footer geometry, and nothing in this module
 *      ever changes it.
 *
 *   2. HEADER/FOOTER OCCUPIED GEOMETRY — where a band actually sits and how
 *      tall it is, derived from that band's own resolved fields
 *      (`offset_mm`, `height_mm`, `content_gap_mm`). Independent of the
 *      margin except for the *default* value of `offset_mm`.
 *
 *   3. BODY SAFE AREA — where report content may be drawn: at least the page
 *      margin away from the page edge, AND clear of any occupied band.
 *
 * The second remediation pass set `bodyTop = marginTop` unconditionally,
 * which made (1) correct but silently deleted (3) — a `0.5cm` top margin
 * placed body content at `5mm`, on top of a `28mm` header band. This module
 * restores the safe area as a first-class, explicitly-tested concept while
 * keeping the literal-margin contract intact. See
 * docs/celuma-1.3/pre-phase-5-legacy-margin-remediation/legacy-margin-contract.md.
 *
 * UNITS AND SIGN CONVENTION: everything is millimetres, expressed as CSS
 * *insets* — `topMm` counts down from the page's top edge, `bottomMm` counts
 * up from the page's bottom edge — because that is exactly how the renderer
 * positions its absolutely-positioned band/body elements
 * (`el.style.top = "<n>mm"`, `el.style.bottom = "<n>mm"`). Keeping the same
 * convention avoids a conversion layer between this module and the DOM.
 */

/** A header or footer band's resolved geometry, before layout. */
export interface PageBandInput {
    /** `presentation.header.enabled` / `presentation.footer.enabled`. */
    enabled: boolean;
    /** Resolved `height_mm` (band-specific default already applied). */
    heightMm: number;
    /**
     * Resolved `offset_mm`: the band's own inset from ITS page edge — the
     * top edge for a header, the bottom edge for a footer.
     *
     * `null` means "not configured", and defaults to that side's page margin
     * (i.e. the band sits just inside the margin, like any other content).
     * An EXPLICIT value always wins and is independent of the margin: this
     * is what lets a Legacy-imported letterhead pin `offset_mm: 0.0` and
     * reproduce `LegacyReportRendererV1`'s bands starting at the physical
     * page edge.
     */
    offsetMm: number | null;
    /** Resolved `content_gap_mm`: clearance between the band and the body. */
    gapMm: number;
}

export interface PageMarginsMm {
    topMm: number;
    rightMm: number;
    bottomMm: number;
    leftMm: number;
}

export interface PageLayoutInput {
    pageWidthMm: number;
    pageHeightMm: number;
    /** The literal, user-configured page margins. Never modified. */
    margins: PageMarginsMm;
    header: PageBandInput;
    footer: PageBandInput;
}

/** Resolved header band bounds, as insets from the page's TOP edge. */
export interface HeaderBounds {
    /** Band is rendered AND has non-zero height, so it reserves space. */
    occupied: boolean;
    /** Inset from the page's top edge to the band's top edge. */
    topMm: number;
    heightMm: number;
    /** Inset from the page's top edge to the band's bottom edge. */
    bottomMm: number;
    /**
     * `true` when this band's position came from the page margin rather than
     * an explicit `offset_mm` pin — i.e. the user's margin governs it.
     *
     * The renderer uses this to make the band's CONTENT sit flush against
     * the margin edge, so the outer gap the reader actually sees (page edge
     * → first printed ink) equals the configured margin. Without it, a band
     * taller than its content leaves the alignment's empty space between the
     * margin and the first ink — the outer-margin defect. See
     * legacy-margin-contract.md, "Outer margin (visible ink)".
     */
    marginPositioned: boolean;
}

/** Resolved footer band bounds, as insets from the page's BOTTOM edge. */
export interface FooterBounds {
    occupied: boolean;
    /** Inset from the page's bottom edge to the band's bottom edge. */
    bottomMm: number;
    heightMm: number;
    /** Inset from the page's bottom edge to the band's top edge. */
    topMm: number;
    /** See `HeaderBounds.marginPositioned`. */
    marginPositioned: boolean;
}

export interface BodyBounds {
    /** Inset from the page's top edge to the first line of body content. */
    topMm: number;
    /** Inset from the page's bottom edge to the last line of body content. */
    bottomMm: number;
    leftMm: number;
    rightMm: number;
    /** `pageHeightMm - topMm - bottomMm`. Negative when unusable. */
    availableHeightMm: number;
    /** `pageWidthMm - leftMm - rightMm`. */
    availableWidthMm: number;
}

export interface PageLayout {
    /** Echoed back unchanged — the literal page-edge insets the user configured. */
    pageMargins: PageMarginsMm;
    header: HeaderBounds;
    footer: FooterBounds;
    body: BodyBounds;
    /**
     * `false` when the configuration leaves no usable body height (bands
     * plus margins consume the whole page). The renderer must handle this
     * explicitly rather than paginating into a zero/negative-height box —
     * see `versioned_report_renderer_v2.tsx`.
     */
    usable: boolean;
}

/** `?? fallback` that also treats `null` as "not configured". */
function mmOr(value: number | null | undefined, fallback: number): number {
    return value == null ? fallback : value;
}

/**
 * Resolves the three concepts above into one geometry model.
 *
 * Invariants guaranteed for every input (see page_layout.test.ts):
 *   - `pageMargins` is returned byte-identical to the input.
 *   - `body.topMm    >= margins.topMm`
 *   - `body.bottomMm >= margins.bottomMm`
 *   - if `header.occupied`: `body.topMm    >= header.bottomMm + header.gapMm`
 *   - if `footer.occupied`: `body.bottomMm >= footer.topMm    + footer.gapMm`
 *   - if neither band is occupied, the body sits exactly on the margins.
 *
 * Left/right are pass-through: this letterhead model has no side bands, so a
 * horizontal margin is always literally the body's horizontal inset.
 */
export function resolvePageLayout(input: PageLayoutInput): PageLayout {
    const { margins, pageWidthMm, pageHeightMm } = input;

    // --- Header: occupied geometry, independent of the body ----------------
    const headerHeightMm = input.header.enabled ? input.header.heightMm : 0;
    // The band's own position is resolved whenever it is rendered, even at
    // zero height, so an explicit `offset_mm` still places it exactly where
    // the letterhead asked; `occupied` only governs whether it pushes the
    // body down.
    const headerTopMm = input.header.enabled
        ? mmOr(input.header.offsetMm, margins.topMm)
        : 0;
    const headerOccupied = input.header.enabled && headerHeightMm > 0;
    const headerBottomMm = headerTopMm + headerHeightMm;

    // --- Footer: same, mirrored from the bottom edge ------------------------
    const footerHeightMm = input.footer.enabled ? input.footer.heightMm : 0;
    const footerBottomMm = input.footer.enabled
        ? mmOr(input.footer.offsetMm, margins.bottomMm)
        : 0;
    const footerOccupied = input.footer.enabled && footerHeightMm > 0;
    const footerTopMm = footerBottomMm + footerHeightMm;

    // --- Body safe area -----------------------------------------------------
    // The page margin is the MINIMUM inset; an occupied band pushes the body
    // further in. `Math.max` is the whole fix: it keeps the margin literal
    // (the body is never closer to the edge than the user asked) while making
    // overlap impossible (the body is never inside an occupied band).
    const bodyTopMm = headerOccupied
        ? Math.max(margins.topMm, headerBottomMm + input.header.gapMm)
        : margins.topMm;
    const bodyBottomMm = footerOccupied
        ? Math.max(margins.bottomMm, footerTopMm + input.footer.gapMm)
        : margins.bottomMm;

    const availableHeightMm = pageHeightMm - bodyTopMm - bodyBottomMm;
    const availableWidthMm = pageWidthMm - margins.leftMm - margins.rightMm;

    return {
        pageMargins: margins,
        header: {
            occupied: headerOccupied,
            topMm: headerTopMm,
            heightMm: headerHeightMm,
            bottomMm: headerBottomMm,
            marginPositioned: input.header.offsetMm == null,
        },
        footer: {
            occupied: footerOccupied,
            bottomMm: footerBottomMm,
            heightMm: footerHeightMm,
            topMm: footerTopMm,
            marginPositioned: input.footer.offsetMm == null,
        },
        body: {
            topMm: bodyTopMm,
            bottomMm: bodyBottomMm,
            leftMm: margins.leftMm,
            rightMm: margins.rightMm,
            availableHeightMm,
            availableWidthMm,
        },
        usable: availableHeightMm > 0 && availableWidthMm > 0,
    };
}
