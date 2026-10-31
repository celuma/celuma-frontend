/**
 * Figure density for `VersionedReportRendererV2` (Céluma 1.4, #19 adjusted by #49).
 *
 * The images section is laid out as rows of three figure cards. A section of three or more rows uses a
 * compact image area so that a complete 3 x 3 page (heading, three rows, their captions) fits a fresh
 * page. #19 fixed that area at 180 px, which left a few millimetres of slack at 5 mm margins with a
 * one-line repeated band and none at all once the band reached three lines, a caption wrapped or the
 * official renderer's font metrics differed slightly: the third row moved to another page.
 *
 * The area is now MEASURED instead of assumed: the section's heading and first three rows (their real
 * captions) are laid out on a real continuation page of the report — the same header, repeated band,
 * signature band, footer, width, fonts and `fits` criterion the paginator uses — and the image area is
 * the largest height, at most `COMPACT_FIGURE_IMAGE_HEIGHT_PX`, at which they fit together. It never
 * goes below `MIN_COMPACT_FIGURE_IMAGE_HEIGHT_PX`: when three rows cannot fit even there (an abnormally
 * tall letterhead, a very tall repeated band) the section keeps the 180 px area and its rows flow to
 * further pages as before, which is the physical limit, never clipped and never reported as a fit.
 *
 * Images keep `object-fit: contain` (no crop, no stretch); captions, their typography, the figure order
 * and the image/caption pairing are untouched. The decision is recorded on the section as
 * `data-figure-fit` (`page` = three rows fit one page, `flow` = they cannot) and the chosen height as
 * `data-figure-image-height`, so tests and evidence read it rather than guess.
 */

/** Figures per row of the images section. */
export const FIGURES_PER_ROW = 3;
/** Rows a compact section is sized to place on one fresh page (a 3 x 3 page). */
export const FIGURE_PAGE_ROWS = 3;
/** Image area of one- and two-row sections (unchanged since #19). */
export const FIGURE_IMAGE_HEIGHT_PX = 200;
/** Largest image area of a section of three or more rows (the #19 compact size). */
export const COMPACT_FIGURE_IMAGE_HEIGHT_PX = 180;
/** Smallest image area the fit may choose (about 40 mm) to keep figures readable. */
export const MIN_COMPACT_FIGURE_IMAGE_HEIGHT_PX = 150;

export const FIGURE_SECTION_ATTR = "data-figure-section";
export const FIGURE_ROW_ATTR = "data-figure-row";
export const FIGURE_IMAGE_ATTR = "data-figure-image";

/** Initial image area of a section with `figureCount` figures, before any measurement. */
export function initialFigureImageHeightPx(figureCount: number): number {
    return figureCount > FIGURES_PER_ROW * (FIGURE_PAGE_ROWS - 1)
        ? COMPACT_FIGURE_IMAGE_HEIGHT_PX
        : FIGURE_IMAGE_HEIGHT_PX;
}

export interface FigureFitProbe {
    /** Opens an empty continuation page of the report and returns its body. */
    open: () => HTMLElement;
    /** The paginator's own criterion: `true` while what `body` holds fits the page. */
    fits: (body: HTMLElement) => boolean;
    /** Removes the page `open` created. */
    close: () => void;
}

function setImageHeight(root: HTMLElement, px: number): void {
    root.querySelectorAll<HTMLElement>(`[${FIGURE_IMAGE_ATTR}]`).forEach((img) => {
        img.style.height = `${px}px`;
    });
}

/**
 * Sizes the image area of every images section of `source` (the clone about to be paginated) that has
 * three or more rows. `separatorAttr` marks the section's decorative leading rule, which the paginator
 * omits when the section opens a fresh page, so the probe leaves it out too.
 */
export function fitCompactFigureSections(source: HTMLElement, probe: FigureFitProbe, separatorAttr: string): void {
    source.querySelectorAll<HTMLElement>(`[${FIGURE_SECTION_ATTR}]`).forEach((section) => {
        const rows = Array.from(section.querySelectorAll<HTMLElement>(`[${FIGURE_ROW_ATTR}]`));
        if (rows.length < FIGURE_PAGE_ROWS) return;

        const sample = section.cloneNode(true) as HTMLElement;
        const lead = sample.firstElementChild;
        if (lead?.hasAttribute(separatorAttr)) lead.remove();
        Array.from(sample.querySelectorAll<HTMLElement>(`[${FIGURE_ROW_ATTR}]`))
            .slice(FIGURE_PAGE_ROWS)
            .forEach((row) => row.remove());

        const body = probe.open();
        let chosen: number | null = null;
        try {
            body.appendChild(sample);
            const fitsAt = (px: number) => {
                setImageHeight(sample, px);
                return probe.fits(body);
            };
            if (fitsAt(COMPACT_FIGURE_IMAGE_HEIGHT_PX)) {
                chosen = COMPACT_FIGURE_IMAGE_HEIGHT_PX;
            } else if (fitsAt(MIN_COMPACT_FIGURE_IMAGE_HEIGHT_PX)) {
                // Largest whole-pixel height that fits; captions do not depend on it, so this is monotonic.
                let lo = MIN_COMPACT_FIGURE_IMAGE_HEIGHT_PX;
                let hi = COMPACT_FIGURE_IMAGE_HEIGHT_PX - 1;
                while (lo < hi) {
                    const mid = Math.ceil((lo + hi) / 2);
                    if (fitsAt(mid)) lo = mid; else hi = mid - 1;
                }
                chosen = lo;
            }
        } finally {
            probe.close();
        }

        const height = chosen ?? COMPACT_FIGURE_IMAGE_HEIGHT_PX;
        setImageHeight(section, height);
        section.setAttribute("data-figure-fit", chosen === null ? "flow" : "page");
        section.setAttribute("data-figure-image-height", String(height));
    });
}
