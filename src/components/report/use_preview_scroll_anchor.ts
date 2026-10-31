import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

/**
 * Céluma 1.4 (#47) — keeps the editor preview on what the reader is looking at
 * while it is recomposed.
 *
 * Each settled refresh repaginates the whole preview: the renderer empties its
 * page host and rebuilds every page inside one effect. While the host is empty
 * the preview is only a few pixels tall, so the browser clamps the scroll
 * position of the preview's scroll container (and of the page itself in the
 * one-column layout) and nothing restores it: every pause in typing a caption
 * threw the reader back to the first page.
 *
 * Around each refresh this hook, without touching the renderer:
 * 1. before the renderer's effect runs (a layout effect runs before every
 *    passive effect of the commit), records what sits in the visible part of
 *    the preview — the first visible figure, otherwise the page under the top
 *    edge — and its offset, and holds the preview container at its current
 *    height so no scroll container can clamp;
 * 2. after the renderer has rebuilt the pages (a parent's passive effects run
 *    after its children's), scrolls that same figure or page back to the same
 *    offset and releases the height.
 *
 * The content still changes; only the reader's place is kept, also when the
 * refresh moves the figure to another page. Nothing runs between refreshes (no
 * listeners or timers), so the user's own scrolling and explicit navigation are
 * untouched, and a refresh that belongs to another report (`scopeKey`) is not
 * anchored.
 */

export interface PreviewPagesHandle {
    getPages: () => HTMLElement[];
}

interface Anchor {
    scroller: HTMLElement | null;
    figure: string | null;
    page: number;
    offset: number;
    previousMinHeight: string;
}

/** The nearest ancestor that actually scrolls, or `null` for the document. */
function scrollContainerOf(el: HTMLElement): HTMLElement | null {
    for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
        const { overflowY } = getComputedStyle(node);
        if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) return node;
    }
    return null;
}

/** Top of the scroll container's box in viewport coordinates (0 for the document). */
function referenceTop(scroller: HTMLElement | null): number {
    return scroller ? scroller.getBoundingClientRect().top : 0;
}

function captureAnchor(container: HTMLElement, pages: HTMLElement[]): Anchor {
    const scroller = scrollContainerOf(container);
    const previousMinHeight = container.style.minHeight;
    container.style.minHeight = `${container.offsetHeight}px`;
    const anchor: Anchor = { scroller, figure: null, page: -1, offset: 0, previousMinHeight };
    if (pages.length === 0) return anchor;

    const box = scroller?.getBoundingClientRect();
    const visibleTop = Math.max(box?.top ?? 0, 0);
    const visibleBottom = Math.min(box?.bottom ?? window.innerHeight, window.innerHeight);
    const reference = referenceTop(scroller);

    for (const page of pages) {
        for (const figure of Array.from(page.querySelectorAll<HTMLElement>("[data-figure]"))) {
            const rect = figure.getBoundingClientRect();
            if (rect.bottom > visibleTop && rect.top < visibleBottom) {
                anchor.figure = figure.getAttribute("data-figure");
                anchor.offset = rect.top - reference;
                return anchor;
            }
        }
    }
    const index = pages.findIndex((page) => page.getBoundingClientRect().bottom > visibleTop);
    anchor.page = index >= 0 ? index : pages.length - 1;
    anchor.offset = pages[anchor.page].getBoundingClientRect().top - reference;
    return anchor;
}

function restoreAnchor(container: HTMLElement, pages: HTMLElement[], anchor: Anchor): void {
    let target: HTMLElement | null = null;
    if (anchor.figure !== null) {
        for (const page of pages) {
            target = page.querySelector<HTMLElement>(`[data-figure="${CSS.escape(anchor.figure)}"]`);
            if (target) break;
        }
    }
    if (!target && anchor.page >= 0 && pages.length > 0) target = pages[Math.min(anchor.page, pages.length - 1)];
    if (target) {
        const delta = target.getBoundingClientRect().top - referenceTop(anchor.scroller) - anchor.offset;
        if (Math.abs(delta) >= 1) {
            if (anchor.scroller) anchor.scroller.scrollTop += delta;
            else window.scrollBy(0, delta);
        }
    }
    container.style.minHeight = anchor.previousMinHeight;
}

export function usePreviewScrollAnchor(
    containerRef: RefObject<HTMLElement | null>,
    pagesRef: RefObject<PreviewPagesHandle | null>,
    report: unknown,
    signerLookup: unknown,
    scopeKey: unknown,
): void {
    const pending = useRef<Anchor | null>(null);
    const lastScope = useRef(scopeKey);

    useLayoutEffect(() => {
        const sameScope = Object.is(lastScope.current, scopeKey);
        lastScope.current = scopeKey;
        const container = containerRef.current;
        pending.current = sameScope && container
            ? captureAnchor(container, pagesRef.current?.getPages() ?? [])
            : null;
    }, [containerRef, pagesRef, report, signerLookup, scopeKey]);

    useEffect(() => {
        const anchor = pending.current;
        pending.current = null;
        const container = containerRef.current;
        if (anchor && container) restoreAnchor(container, pagesRef.current?.getPages() ?? [], anchor);
    }, [containerRef, pagesRef, report, signerLookup, scopeKey]);
}
