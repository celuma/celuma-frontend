/**
 * Céluma 1.4 (#29) review R1 — a plain-field correction is only reported as
 * applied when the browser made it as an undoable edit. jsdom has no editing
 * commands, so each case installs the `document.execCommand` behaviour under
 * test; the real browser path is covered by
 * tests-visual/report_spelling.functional.spec.ts. Synthetic text only.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyPlainReplacement } from "../../components/spelling/plain_spelling";
import type { SpellingMark } from "../../lib/spelling/session";

const TEXT = "Nota de pacietne sin cambios";
const MARK: SpellingMark = { start: 8, end: 16, word: "pacietne", key: "pacietne" };

function field(value = TEXT, selection: [number, number] = [2, 4]) {
    const el = document.createElement("textarea");
    document.body.appendChild(el);
    el.value = value;
    el.setSelectionRange(...selection);
    const inputs = vi.fn();
    el.addEventListener("input", inputs);
    return { el, inputs };
}

/** What a browser's insertText does for a focused textarea: replace the selection, fire input. */
function nativeInsert(el: HTMLTextAreaElement, text: string) {
    el.setRangeText(text, el.selectionStart, el.selectionEnd, "end");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
}

function installExecCommand(impl: (command: string, ui: boolean, value?: string) => boolean) {
    Object.defineProperty(document, "execCommand", { value: vi.fn(impl), configurable: true, writable: true });
    return document.execCommand as unknown as ReturnType<typeof vi.fn>;
}

afterEach(() => {
    delete (document as unknown as { execCommand?: unknown }).execCommand;
    document.body.innerHTML = "";
});

describe("applyPlainReplacement", () => {
    it("applies through the browser's undoable insertText and leaves the caret after the word", () => {
        const { el, inputs } = field();
        installExecCommand((command, _ui, value) => command === "insertText" && nativeInsert(el, value ?? ""));
        expect(applyPlainReplacement(el, MARK, "paciente")).toBe("applied");
        expect(el.value).toBe("Nota de paciente sin cambios");
        expect([el.selectionStart, el.selectionEnd]).toEqual([16, 16]);
        expect(inputs).toHaveBeenCalledTimes(1);
    });

    it("refuses when the command reports failure: value, selection and React state untouched", () => {
        const { el, inputs } = field(TEXT, [3, 6]);
        const exec = installExecCommand(() => false);
        expect(applyPlainReplacement(el, MARK, "paciente")).toBe("unsupported");
        expect(el.value).toBe(TEXT);
        expect([el.selectionStart, el.selectionEnd]).toEqual([3, 6]);
        expect(inputs).not.toHaveBeenCalled();
        expect(exec).toHaveBeenCalledWith("insertText", false, "paciente");
    });

    it("refuses when the command throws or does not exist", () => {
        const { el, inputs } = field();
        installExecCommand(() => {
            throw new Error("not supported");
        });
        expect(applyPlainReplacement(el, MARK, "paciente")).toBe("unsupported");
        expect(el.value).toBe(TEXT);
        expect([el.selectionStart, el.selectionEnd]).toEqual([2, 4]);

        delete (document as unknown as { execCommand?: unknown }).execCommand; // jsdom default: absent
        expect(applyPlainReplacement(el, MARK, "paciente")).toBe("unsupported");
        expect(el.value).toBe(TEXT);
        expect(inputs).not.toHaveBeenCalled();
    });

    it("takes back a native edit that produced different text, then refuses", () => {
        const { el } = field();
        installExecCommand((command) => {
            if (command === "insertText") return nativeInsert(el, "otra cosa");
            if (command === "undo") {
                el.value = TEXT; // the browser's undo of its own step
                return true;
            }
            return false;
        });
        expect(applyPlainReplacement(el, MARK, "paciente")).toBe("unsupported");
        expect(el.value).toBe(TEXT);
        expect([el.selectionStart, el.selectionEnd]).toEqual([2, 4]);
    });

    it("never reports success when a different native edit cannot be taken back", () => {
        const { el } = field();
        installExecCommand((command) => command === "insertText" && nativeInsert(el, "otra cosa"));
        expect(applyPlainReplacement(el, MARK, "paciente")).toBe("mismatch");
    });

    it("refuses stale words and limits before touching the field", () => {
        const { el, inputs } = field("Nota de pacietnes");
        const exec = installExecCommand(() => true);
        expect(applyPlainReplacement(el, MARK, "paciente")).toBe("stale");
        el.value = TEXT;
        expect(applyPlainReplacement(el, MARK, "paciente", { maxLength: 20 })).toBe("refused");
        expect(exec).not.toHaveBeenCalled();
        expect(inputs).not.toHaveBeenCalled();
    });
});
