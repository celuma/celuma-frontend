import { describe, expect, it } from "vitest";
import {
    FIGURE_CAPTION_MAX_LENGTH, figureRef, figureRefs, moveFigure, normalizeCaption, removeFigure, setFigureCaption,
} from "../../components/report/report_figures";
import type { TemplateImageItem } from "../../models/report";

const img = (id: string, caption = ""): TemplateImageItem => ({ id, url: `https://x.test/${id}.jpg`, caption });
const ids = (items: TemplateImageItem[]) => items.map((i) => i.id);

describe("report figures (1.4 #18/#20)", () => {
    const abc = [img("a", "A"), img("b", "B"), img("c", "C")];

    it("moves a figure with its url and caption, one step at a time", () => {
        const b = figureRef(abc[1]);
        const down = moveFigure(abc, b, 1);
        expect(down.map((i) => [i.id, i.url, i.caption])).toEqual([
            ["a", "https://x.test/a.jpg", "A"], ["c", "https://x.test/c.jpg", "C"], ["b", "https://x.test/b.jpg", "B"],
        ]);
        expect(ids(moveFigure(abc, b, -1))).toEqual(["b", "a", "c"]);
        expect(ids(abc)).toEqual(["a", "b", "c"]); // input is never mutated
    });

    it("treats the first-up and last-down moves as no-ops", () => {
        const refs = figureRefs(abc);
        expect(ids(moveFigure(abc, refs[0], -1))).toEqual(["a", "b", "c"]);
        expect(ids(moveFigure(abc, refs[2], 1))).toEqual(["a", "b", "c"]);
    });

    it("keeps repeated and empty ids apart, through composed operations, without touching the data", () => {
        const dup = [img("a", "one"), img("a", "two"), img("", "x"), img("", "y")];
        const snapshot = JSON.stringify(dup);
        const [one, two, x, y] = figureRefs(dup);
        expect(new Set([one, two, x, y]).size).toBe(4);

        // Move "two" above "one": identities travel with the figures, not with the equal id.
        const moved = moveFigure(dup, two, -1);
        expect(moved.map((i) => i.caption)).toEqual(["two", "one", "x", "y"]);
        expect(figureRefs(moved)).toEqual([two, one, x, y]);

        // A ref captured before the move still edits / moves / removes the same figure afterwards.
        const edited = setFigureCaption(moved, two, "two!");
        expect(edited.map((i) => i.caption)).toEqual(["two!", "one", "x", "y"]);
        expect(figureRefs(edited)).toEqual([two, one, x, y]); // identity survives the caption update
        expect(moveFigure(edited, two, 1).map((i) => i.caption)).toEqual(["one", "two!", "x", "y"]);
        expect(removeFigure(edited, y).map((i) => i.caption)).toEqual(["two!", "one", "x"]);

        // Crossing empty ids and adding another empty-id figure later.
        const crossed = moveFigure(moveFigure(edited, x, -1), x, -1);
        expect(crossed.map((i) => i.caption)).toEqual(["x", "two!", "one", "y"]);
        const added = [...crossed, img("", "z")];
        expect(new Set(figureRefs(added)).size).toBe(5);
        expect(figureRefs(added).slice(0, 4)).toEqual([x, two, one, y]);

        // Source data is never rewritten, deduplicated or tagged.
        expect(JSON.stringify(dup)).toBe(snapshot);
        expect(Object.keys(edited[0])).toEqual(["id", "url", "caption"]);
    });

    it("applies a caption to the figure it was typed on even after the order changed", () => {
        const b = figureRef(abc[1]);
        const moved = moveFigure(abc, b, -1);
        expect(setFigureCaption(moved, b, "nuevo").map((i) => [i.id, i.caption])).toEqual([["b", "nuevo"], ["a", "A"], ["c", "C"]]);
    });

    it("removing a figure keeps the relative order of the rest", () => {
        const b = figureRef(abc[1]);
        expect(ids(removeFigure(abc, b))).toEqual(["a", "c"]);
    });

    it("keeps captions single-line and capped at the existing 25 characters", () => {
        expect(FIGURE_CAPTION_MAX_LENGTH).toBe(25);
        expect(normalizeCaption("a\nb\r\nc")).toBe("a b c");
        expect(normalizeCaption("x".repeat(40))).toHaveLength(25);
    });
});
