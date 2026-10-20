import type { TemplateImageItem } from "../../models/report";

/** Existing caption contract (single line, 25 characters). Not a new limit. */
export const FIGURE_CAPTION_MAX_LENGTH = 25;

/**
 * Editor-instance identity of one figure in a report's images array.
 *
 * Source image ids may repeat or be empty in historical content, and the array
 * position changes on every move, so neither can identify a figure. Instead each
 * figure *object* is tagged once, in a WeakMap that lives next to it: moves keep
 * the same object, caption edits carry the tag over to the replacement object,
 * and removal drops it. The tag is never written into the item, so it is not
 * serialized into clinical JSON, and ids/urls/captions are never rewritten or
 * deduplicated. Deriving it is synchronous and idempotent (safe in render).
 */
export type FigureRef = string;

const uids = new WeakMap<TemplateImageItem, FigureRef>();
let nextUid = 1;

export function figureRef(item: TemplateImageItem): FigureRef {
    let uid = uids.get(item);
    if (!uid) {
        uid = `fig-${nextUid++}`;
        uids.set(item, uid);
    }
    return uid;
}

export const figureRefs = (items: readonly TemplateImageItem[]): FigureRef[] => items.map(figureRef);

function indexOfFigure(items: readonly TemplateImageItem[], ref: FigureRef): number {
    return items.findIndex((item) => figureRef(item) === ref);
}

/** Collapses line breaks: captions are single-line. Length is capped separately. */
export function normalizeCaption(raw: string): string {
    return raw.replace(/[\r\n]+/g, " ").slice(0, FIGURE_CAPTION_MAX_LENGTH);
}

export function setFigureCaption(items: readonly TemplateImageItem[], ref: FigureRef, caption: string): TemplateImageItem[] {
    return items.map((item) => {
        if (figureRef(item) !== ref) return item;
        const next = { ...item, caption };
        uids.set(next, ref); // same figure, new object: keep its identity
        return next;
    });
}

export function removeFigure(items: readonly TemplateImageItem[], ref: FigureRef): TemplateImageItem[] {
    return items.filter((item) => figureRef(item) !== ref);
}

/** Moves one figure by `delta` positions (-1 up, +1 down); out-of-range is a no-op. */
export function moveFigure(items: readonly TemplateImageItem[], ref: FigureRef, delta: -1 | 1): TemplateImageItem[] {
    const from = indexOfFigure(items, ref);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= items.length) return [...items];
    const next = [...items];
    [next[from], next[to]] = [next[to], next[from]];
    return next;
}
