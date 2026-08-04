/**
 * Fourth post-Phase 2 remediation (Observation 1) — local printing.
 *
 * What these tests fix is POLITICS, not the aesthetics of the dialogue of the
 * system: what brand each state carries, which brand is stamped on the clone
 * and never in the DOM of the renderer, and—most importantly—that printing does not
 * calls anything from official PDF's flow.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { createRef } from "react";
import {
    useLocalPrint,
    localPrintMarkForStatus,
    LOCAL_COPY_NOTICE,
} from "../../hooks/use_local_print";
import type { ReportRendererRef } from "../../components/report/legacy/legacy_report_types";

/** false page with the same form that produces either of the two
 * renderers: an 8.5in div with content inside. */
function makePage(text: string): HTMLElement {
    const page = document.createElement("div");
    page.style.width = "8.5in";
    page.style.height = "11in";
    page.style.position = "relative";
    page.style.boxShadow = "0 0 6px rgba(0,0,0,.2)";
    const body = document.createElement("div");
    body.textContent = text;
    page.appendChild(body);
    document.body.appendChild(page);
    return page;
}

function refWithPages(pages: HTMLElement[]) {
    const ref = createRef<ReportRendererRef>();
    (ref as { current: ReportRendererRef }).current = { getPages: () => pages };
    return ref;
}

/** The hook writes to a hidden iframe and calls `print()`. jsdom no
 * implements `print`, so that the document is replaced and inspected
 * that was left inside the iframe. */
function stubPrint() {
    const printed: Document[] = [];
    const original = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "contentWindow");
    vi.spyOn(HTMLIFrameElement.prototype, "contentWindow", "get").mockImplementation(function (
        this: HTMLIFrameElement,
    ) {
        const win = original?.get?.call(this) as Window & typeof globalThis;
        if (!win) return win;
        if (!("__stubbed" in win)) {
            Object.defineProperty(win, "__stubbed", { value: true });
            win.print = () => { printed.push(win.document); };
            win.focus = () => {};
        }
        return win;
    });
    return printed;
}

beforeEach(() => {
    document.body.innerHTML = "";
});

afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
});

describe("localPrintMarkForStatus", () => {
    it("mark as draft everything that is not published", () => {
        expect(localPrintMarkForStatus("DRAFT")).toBe("DRAFT");
        expect(localPrintMarkForStatus("IN_REVIEW")).toBe("DRAFT");
        expect(localPrintMarkForStatus("APPROVED")).toBe("DRAFT");
    });

    it("brand RETRACTADO the report portrayed", () => {
        expect(localPrintMarkForStatus("RETRACTED")).toBe("RETRACTED");
    });

    it("do not mark the report published", () => {
        expect(localPrintMarkForStatus("PUBLISHED")).toBeNull();
    });

    it("a state unknown or absent is treated as draft, not as published", () => {
        // Fail to "checked" is the only safe option: a copy without
        // mark can be confused with the official document.
        expect(localPrintMarkForStatus(null)).toBe("DRAFT");
        expect(localPrintMarkForStatus(undefined)).toBe("DRAFT");
    });
});

describe("useLocalPrint — marks on printed output", () => {
    it("stamp draft — DOCUMENTO NO official when the report is not published", async () => {
        const printed = stubPrint();
        const page = makePage("Contenido clínico");
        const { result } = renderHook(() => useLocalPrint());

        await result.current.printLocalCopy(refWithPages([page]), { mark: "DRAFT" });

        expect(printed).toHaveLength(1);
        expect(printed[0].body.textContent).toContain("BORRADOR — DOCUMENTO NO OFICIAL");
    });

    it("stamp RETRACTADO in a retracted report", async () => {
        const printed = stubPrint();
        const page = makePage("Contenido clínico");
        const { result } = renderHook(() => useLocalPrint());

        await result.current.printLocalCopy(refWithPages([page]), { mark: "RETRACTED" });

        expect(printed[0].body.textContent).toContain("RETRACTADO");
        expect(printed[0].body.textContent).not.toContain("BORRADOR");
    });

    it("a report published outputs without draft mark, but with local copy clarification", async () => {
        const printed = stubPrint();
        const page = makePage("Contenido clínico");
        const { result } = renderHook(() => useLocalPrint());

        await result.current.printLocalCopy(refWithPages([page]), { mark: null });

        const text = printed[0].body.textContent ?? "";
        expect(text).not.toContain("BORRADOR");
        expect(text).not.toContain("RETRACTADO");
        expect(text).toContain(LOCAL_COPY_NOTICE);
    });

    it("The clarification appears on all pages, not only on the first", async () => {
        const printed = stubPrint();
        const pages = [makePage("Página 1"), makePage("Página 2"), makePage("Página 3")];
        const { result } = renderHook(() => useLocalPrint());

        await result.current.printLocalCopy(refWithPages(pages), { mark: "DRAFT" });

        const notices = printed[0].querySelectorAll(".celuma-local-copy-notice");
        const bands = printed[0].querySelectorAll(".celuma-print-mark-band");
        expect(notices).toHaveLength(3);
        expect(bands).toHaveLength(3);
    });

    it("preserve the clinical content of all the pages", async () => {
        const printed = stubPrint();
        const pages = [makePage("Macroscópica"), makePage("Microscópica")];
        const { result } = renderHook(() => useLocalPrint());

        await result.current.printLocalCopy(refWithPages(pages), { mark: "DRAFT" });

        expect(printed[0].body.textContent).toContain("Macroscópica");
        expect(printed[0].body.textContent).toContain("Microscópica");
    });
});

describe("useLocalPrint — isolation regarding official document", () => {
    it("does not modify the DOM of the renderer: the flag lives only in the clone", async () => {
        stubPrint();
        const page = makePage("Contenido clínico");
        const before = page.outerHTML;
        const { result } = renderHook(() => useLocalPrint());

        await result.current.printLocalCopy(refWithPages([page]), { mark: "DRAFT" });

        // If the flag were injected into the real DOM, it would also end up in the
        // official PDF, which generates from ESTE same renderer.
        expect(page.outerHTML).toBe(before);
        expect(page.textContent).not.toContain("BORRADOR");
    });

    it("does not make network request", async () => {
        stubPrint();
        const fetchSpy = vi.spyOn(globalThis, "fetch");
        const page = makePage("Contenido clínico");
        const { result } = renderHook(() => useLocalPrint());

        await result.current.printLocalCopy(refWithPages([page]), { mark: "DRAFT" });

        // No download of the official PDF, no generation, no signature: the copy is
        // compose integer with the DOM that was already on screen.
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("does not open new windows or tabs", async () => {
        stubPrint();
        const openSpy = vi.spyOn(globalThis, "open").mockReturnValue(null);
        const page = makePage("Contenido clínico");
        const { result } = renderHook(() => useLocalPrint());

        await result.current.printLocalCopy(refWithPages([page]), { mark: null });

        expect(openSpy).not.toHaveBeenCalled();
    });

    it("does nothing if the renderer has not yet produced pages", async () => {
        const printed = stubPrint();
        const { result } = renderHook(() => useLocalPrint());

        await result.current.printLocalCopy(refWithPages([]), { mark: "DRAFT" });

        expect(printed).toHaveLength(0);
    });

    it("escape the title so that the report name does not inject markup", async () => {
        const printed = stubPrint();
        const page = makePage("Contenido");
        const { result } = renderHook(() => useLocalPrint());

        await result.current.printLocalCopy(refWithPages([page]), {
            mark: null,
            filename: "<script>alert(1)</script>",
        });

        expect(printed[0].querySelector("script")).toBeNull();
    });
});
