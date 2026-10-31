/**
 * Block-level pagination for `VersionedReportRendererV2` (Céluma 1.4, #19).
 *
 * The previous loop split a block exactly one level deep: a section's direct children were the
 * smallest unit, so a child that was itself taller than a page (the images grid with more than nine
 * figures, a long rich-text body, a long table) was placed on a fresh page whole and silently cut off
 * by the body box's `overflow: hidden`. This engine keeps that loop's behaviour wherever it was
 * correct and descends only where it was not:
 *
 *   1. a top-level block is placed whole when it fits the current page;
 *   2. otherwise it starts a fresh page and is placed whole when it fits there (exactly the previous
 *      rule, so every report that never exceeded a page paginates as before);
 *   3. only a block taller than a whole page is split, beginning on the page that still has room (the
 *      fresh page of rule 2 is withdrawn when the block turns out not to fit it either): its container is recreated (an empty clone, the
 *      "shell") on each page and the same rules apply to its children, recursively, down to the
 *      smallest unit that is never split (a paragraph, a heading, a table row, a list item, or anything
 *      marked `data-page-atomic`, such as a row of figure cards so a figure and its caption always
 *      travel together);
 *   4. while splitting, consecutive children marked `data-keep-with-next` (a section rule and title)
 *      are placed together with the child that follows them, so a title is never stranded at the bottom
 *      of a page, and a decorative separator (`data-page-separator`) that would head a continuation page
 *      is left out — also when it is the first child of a block moved whole onto a fresh page (#49), so
 *      a block takes the same room on a fresh page whether it is placed whole or split;
 *   5. a text unit (a paragraph, list item, heading or any block holding only inline content) taller than
 *      a page is split between words, keeping its inline formatting (bold, links...) and its order; the
 *      continuation keeps the same element;
 *   6. a unit that cannot be divided and does not fit even alone on an empty page (an oversize figure
 *      row, a table row, an image) is still placed (never dropped) and counted in `overflowedUnits`;
 *      the caller MUST treat that as a layout failure (the renderer marks the page host and the official
 *      render route refuses to signal readiness) instead of letting the content be silently clipped.
 *
 * Measuring is delegated (`fits`) so the algorithm has no layout dependency and can be unit tested with
 * a height model in jsdom; the renderer passes the real `scrollHeight <= clientHeight`.
 */

export interface PaginationHooks {
    /** Starts a page (`pageIndex` is zero-based) and returns the element its content goes into. */
    newPage: (pageIndex: number) => HTMLElement;
    /** `true` while everything placed in `body` still fits the page. */
    fits: (body: HTMLElement) => boolean;
    /**
     * Removes the page started last (it is still empty). Optional: without it an oversize block simply
     * starts on a fresh page instead of continuing on the page it could not fit whole.
     */
    discardLastPage?: () => void;
}

export interface PaginationResult {
    pageCount: number;
    /** Units that did not fit even alone on an empty page (placed anyway, never dropped). */
    overflowedUnits: number;
}

/** Containers the engine may split between children. Everything else is a unit. */
const CONTAINER_TAGS = new Set([
    "DIV", "SECTION", "ARTICLE", "UL", "OL", "LI", "TABLE", "THEAD", "TBODY", "TFOOT", "BLOCKQUOTE",
]);
/** A container is only worth descending into when at least one child is block-level. */
const BLOCK_TAGS = new Set([
    "DIV", "SECTION", "ARTICLE", "P", "UL", "OL", "LI", "TABLE", "THEAD", "TBODY", "TFOOT", "TR",
    "H1", "H2", "H3", "H4", "H5", "H6", "HR", "BLOCKQUOTE", "PRE",
]);

export const ATOMIC_ATTR = "data-page-atomic";
export const KEEP_WITH_NEXT_ATTR = "data-keep-with-next";
/** A purely decorative rule: omitted when it would be the first thing on a continuation page. */
export const SEPARATOR_ATTR = "data-page-separator";

const ATOMIC_INLINE_TAGS = new Set(["BR", "IMG", "SVG", "CANVAS", "INPUT", "HR"]);

/** A block whose content is only inline (text and inline markup): can be divided between words. */
function isTextSplittable(el: HTMLElement): boolean {
    if (el.hasAttribute(ATOMIC_ATTR) || isSplittable(el)) return false;
    if (el.tagName === "TABLE" || el.tagName === "TR" || ATOMIC_INLINE_TAGS.has(el.tagName)) return false;
    return (el.textContent ?? "").trim().length > 0;
}

interface TextToken {
    /** Words (with their trailing whitespace) or an indivisible inline element (`atom`). */
    text?: string;
    atom?: HTMLElement;
    /** Source inline elements the token sits inside, outermost first. */
    chain: HTMLElement[];
}

function tokenize(node: Node, chain: HTMLElement[], out: TextToken[]): void {
    node.childNodes.forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
            (child.textContent ?? "").match(/\s*\S+\s*|\s+/g)?.forEach((text) => out.push({ text, chain }));
        } else if (child instanceof HTMLElement) {
            if (ATOMIC_INLINE_TAGS.has(child.tagName) || !(child.textContent ?? "").trim()) {
                out.push({ atom: child, chain });
            } else {
                tokenize(child, [...chain, child], out);
            }
        }
    });
}

/** Rebuilds `shell` (an empty clone of the unit) holding `tokens`, re-creating the inline wrappers. */
function fillShell(shell: HTMLElement, tokens: TextToken[]): void {
    const stack: Array<{ src: HTMLElement; el: HTMLElement }> = [];
    tokens.forEach((token) => {
        let common = 0;
        while (common < stack.length && common < token.chain.length && stack[common].src === token.chain[common]) common += 1;
        stack.length = common;
        for (let i = common; i < token.chain.length; i += 1) {
            const el = token.chain[i].cloneNode(false) as HTMLElement;
            (stack.length ? stack[stack.length - 1].el : shell).appendChild(el);
            stack.push({ src: token.chain[i], el });
        }
        const target = stack.length ? stack[stack.length - 1].el : shell;
        target.appendChild(token.atom ? (token.atom.cloneNode(true) as HTMLElement) : document.createTextNode(token.text ?? ""));
    });
}

function isSplittable(el: HTMLElement): boolean {
    if (el.hasAttribute(ATOMIC_ATTR)) return false;
    if (!CONTAINER_TAGS.has(el.tagName)) return false;
    return Array.from(el.children).some((child) => BLOCK_TAGS.has(child.tagName));
}

/**
 * A copy of `block` without its leading decorative separator, or `null` when it does not open with one
 * (rule 4: such a rule never heads a continuation page).
 */
function withoutLeadingSeparator(block: HTMLElement): HTMLElement | null {
    const first = block.firstElementChild;
    if (!first?.hasAttribute(SEPARATOR_ATTR) || block.hasAttribute(ATOMIC_ATTR)) return null;
    const nodes = Array.from(block.childNodes);
    if (nodes.slice(0, nodes.indexOf(first)).some((n) => (n.textContent ?? "").trim() !== "")) return null;
    const trimmed = block.cloneNode(true) as HTMLElement;
    trimmed.firstElementChild!.remove();
    return trimmed;
}

/** The nodes of `parent` as placeable elements: loose text becomes a span, layout whitespace is dropped. */
function childUnits(parent: HTMLElement, nested: boolean): HTMLElement[] {
    const out: HTMLElement[] = [];
    parent.childNodes.forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
            const text = child.textContent ?? "";
            if (nested && text.trim() === "") return;
            const span = document.createElement("span");
            span.textContent = text;
            out.push(span);
        } else if (child instanceof HTMLElement) {
            out.push(child);
        }
    });
    return out;
}

class Page {
    readonly body: HTMLElement;
    /** Shell clones created on THIS page, by the source container they stand for. */
    readonly shells = new Map<HTMLElement, HTMLElement>();
    constructor(body: HTMLElement) {
        this.body = body;
    }
    get isEmpty(): boolean {
        return this.body.childElementCount === 0;
    }
}

interface Placement {
    nodes: HTMLElement[];
    createdShells: HTMLElement[];
    createdFor: HTMLElement[];
}

const emptyPlacement = (): Placement => ({ nodes: [], createdShells: [], createdFor: [] });

export function paginateSource(root: HTMLElement, hooks: PaginationHooks): PaginationResult {
    let pageIndex = 0;
    let page = new Page(hooks.newPage(pageIndex));
    let overflowedUnits = 0;

    const startPage = () => {
        pageIndex += 1;
        page = new Page(hooks.newPage(pageIndex));
    };

    /** Appends clones of `nodes` under the shells of `chain`, creating any shell this page lacks. */
    const attach = (nodes: HTMLElement[], chain: HTMLElement[], placement: Placement, deep = true) => {
        let parent: HTMLElement = page.body;
        chain.forEach((source, depth) => {
            let shell = page.shells.get(source);
            if (!shell) {
                shell = source.cloneNode(false) as HTMLElement;
                // A list continued on a new page keeps counting from where it left off.
                const next = chain[depth + 1] ?? nodes[0];
                if (source.tagName === "OL" && next.tagName === "LI") {
                    const index = Array.from(source.children).indexOf(next);
                    if (index > 0) {
                        shell.setAttribute("start", String((Number(source.getAttribute("start")) || 1) + index));
                    }
                }
                parent.appendChild(shell);
                page.shells.set(source, shell);
                placement.createdShells.push(shell);
                placement.createdFor.push(source);
            }
            parent = shell;
        });
        nodes.forEach((node) => {
            const clone = deep ? (node.cloneNode(true) as HTMLElement) : node;
            parent.appendChild(clone);
            placement.nodes.push(clone);
        });
    };

    const rollback = (placement: Placement) => {
        placement.nodes.forEach((node) => node.remove());
        placement.createdShells.forEach((shell) => shell.remove());
        placement.createdFor.forEach((source) => page.shells.delete(source));
    };

    const tryPlace = (nodes: HTMLElement[], chain: HTMLElement[]): boolean => {
        const placement = emptyPlacement();
        attach(nodes, chain, placement);
        if (hooks.fits(page.body)) return true;
        rollback(placement);
        return false;
    };

    /**
     * Rules 1-2: whole on this page, else whole on a fresh one. `false` when neither fits; in that case,
     * when a fresh page was started only for this attempt and the block can be split, it is withdrawn so
     * the caller can split the block starting on the page that still has room.
     */
    const placeWhole = (
        nodes: HTMLElement[], chain: HTMLElement[], dropLeadingSeparator: boolean, canSplit: boolean,
    ): boolean => {
        if (tryPlace(nodes, chain)) return true;
        const resumePage = page;
        const startedFresh = !page.isEmpty;
        if (startedFresh) {
            startPage();
            if (dropLeadingSeparator && nodes.length > 1 && nodes[0].hasAttribute(SEPARATOR_ATTR)) {
                nodes = nodes.slice(1);
            } else if (nodes.length === 1) {
                const trimmed = withoutLeadingSeparator(nodes[0]);
                if (trimmed) nodes = [trimmed];
            }
        }
        if (tryPlace(nodes, chain)) return true;
        if (startedFresh && canSplit && hooks.discardLastPage) {
            hooks.discardLastPage();
            pageIndex -= 1;
            page = resumePage;
        }
        return false;
    };

    const placeBlock = (node: HTMLElement, chain: HTMLElement[]) => {
        if (placeWhole([node], chain, false, isSplittable(node) || isTextSplittable(node))) return;
        // Taller than a whole page (rule 3): split it, or, as a last resort, place it and report it.
        if (isSplittable(node)) {
            placeChildren(node, [...chain, node]);
            return;
        }
        if (isTextSplittable(node)) {
            splitText(node, chain);
            return;
        }
        attach([node], chain, emptyPlacement());
        overflowedUnits += 1;
    };

    /** Rule 5: distributes a text unit taller than a page over as many pages as it needs. */
    const splitText = (node: HTMLElement, chain: HTMLElement[]) => {
        const tokens: TextToken[] = [];
        tokenize(node, [], tokens);
        let from = 0;
        let continuation = false;
        const build = (count: number): HTMLElement => {
            const shell = node.cloneNode(false) as HTMLElement;
            if (continuation && node.tagName === "LI") shell.style.listStyleType = "none";
            fillShell(shell, tokens.slice(from, from + count));
            return shell;
        };
        const fitsCount = (count: number): boolean => {
            const placement = emptyPlacement();
            attach([build(count)], chain, placement, false);
            const ok = hooks.fits(page.body);
            rollback(placement);
            return ok;
        };
        while (from < tokens.length) {
            let lo = 0;
            let hi = tokens.length - from;
            while (lo < hi) {
                const mid = Math.ceil((lo + hi) / 2);
                if (fitsCount(mid)) lo = mid; else hi = mid - 1;
            }
            if (lo === 0) {
                if (!page.isEmpty) {
                    startPage();
                    continue;
                }
                // Not even one word/element fits an empty page: indivisible, report it.
                attach([build(1)], chain, emptyPlacement(), false);
                overflowedUnits += 1;
                from += 1;
                continuation = true;
                continue;
            }
            attach([build(lo)], chain, emptyPlacement(), false);
            from += lo;
            continuation = true;
            if (from < tokens.length) startPage();
        }
    };

    const placeChildren = (parent: HTMLElement, chain: HTMLElement[]) => {
        const children = childUnits(parent, true);
        for (let i = 0; i < children.length; i += 1) {
            const group: HTMLElement[] = [children[i]];
            while (group[group.length - 1].hasAttribute(KEEP_WITH_NEXT_ATTR) && i + 1 < children.length) {
                i += 1;
                group.push(children[i]);
            }
            if (group.length === 1) {
                placeBlock(group[0], chain);
            } else if (!placeWhole(group, chain, true, true)) {
                // Rule 4: a rule and title travel with what follows them; if the whole group is taller
                // than a page there is nothing left to keep together.
                group.forEach((member) => placeBlock(member, chain));
            }
        }
    };

    childUnits(root, false).forEach((block) => placeBlock(block, []));
    return { pageCount: pageIndex + 1, overflowedUnits };
}
