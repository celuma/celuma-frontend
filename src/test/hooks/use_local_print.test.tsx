/**
 * Cuarta remediación post-Fase 2 (Observación 1) — impresión local.
 *
 * Lo que estas pruebas fijan es la POLÍTICA, no la estética del diálogo del
 * sistema: qué marca lleva cada estado, que la marca se estampa en un clon
 * y nunca en el DOM del renderer, y —lo más importante— que imprimir no
 * llama a nada del flujo del PDF oficial.
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

/** Página falsa con la misma forma que produce cualquiera de los dos
 *  renderers: un div de 8.5in con contenido dentro. */
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

/** El hook escribe en un iframe oculto y llama a `print()`. jsdom no
 *  implementa `print`, así que se sustituye y se inspecciona el documento
 *  que quedó dentro del iframe. */
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
    it("marca como BORRADOR todo lo que no esté publicado", () => {
        expect(localPrintMarkForStatus("DRAFT")).toBe("DRAFT");
        expect(localPrintMarkForStatus("IN_REVIEW")).toBe("DRAFT");
        expect(localPrintMarkForStatus("APPROVED")).toBe("DRAFT");
    });

    it("marca RETRACTADO un reporte retractado", () => {
        expect(localPrintMarkForStatus("RETRACTED")).toBe("RETRACTED");
    });

    it("no marca un reporte publicado", () => {
        expect(localPrintMarkForStatus("PUBLISHED")).toBeNull();
    });

    it("un estado desconocido o ausente se trata como borrador, no como publicado", () => {
        // Fallar hacia "marcado" es la única opción segura: una copia sin
        // marca puede confundirse con el documento oficial.
        expect(localPrintMarkForStatus(null)).toBe("DRAFT");
        expect(localPrintMarkForStatus(undefined)).toBe("DRAFT");
    });
});

describe("useLocalPrint — marcas en la salida impresa", () => {
    it("estampa BORRADOR — DOCUMENTO NO OFICIAL cuando el reporte no está publicado", async () => {
        const printed = stubPrint();
        const page = makePage("Contenido clínico");
        const { result } = renderHook(() => useLocalPrint());

        await result.current.printLocalCopy(refWithPages([page]), { mark: "DRAFT" });

        expect(printed).toHaveLength(1);
        expect(printed[0].body.textContent).toContain("BORRADOR — DOCUMENTO NO OFICIAL");
    });

    it("estampa RETRACTADO en un reporte retractado", async () => {
        const printed = stubPrint();
        const page = makePage("Contenido clínico");
        const { result } = renderHook(() => useLocalPrint());

        await result.current.printLocalCopy(refWithPages([page]), { mark: "RETRACTED" });

        expect(printed[0].body.textContent).toContain("RETRACTADO");
        expect(printed[0].body.textContent).not.toContain("BORRADOR");
    });

    it("un reporte publicado sale sin marca de borrador, pero con la aclaración de copia local", async () => {
        const printed = stubPrint();
        const page = makePage("Contenido clínico");
        const { result } = renderHook(() => useLocalPrint());

        await result.current.printLocalCopy(refWithPages([page]), { mark: null });

        const text = printed[0].body.textContent ?? "";
        expect(text).not.toContain("BORRADOR");
        expect(text).not.toContain("RETRACTADO");
        expect(text).toContain(LOCAL_COPY_NOTICE);
    });

    it("la aclaración aparece en TODAS las páginas, no solo en la primera", async () => {
        const printed = stubPrint();
        const pages = [makePage("Página 1"), makePage("Página 2"), makePage("Página 3")];
        const { result } = renderHook(() => useLocalPrint());

        await result.current.printLocalCopy(refWithPages(pages), { mark: "DRAFT" });

        const notices = printed[0].querySelectorAll(".celuma-local-copy-notice");
        const bands = printed[0].querySelectorAll(".celuma-print-mark-band");
        expect(notices).toHaveLength(3);
        expect(bands).toHaveLength(3);
    });

    it("conserva el contenido clínico de todas las páginas", async () => {
        const printed = stubPrint();
        const pages = [makePage("Macroscópica"), makePage("Microscópica")];
        const { result } = renderHook(() => useLocalPrint());

        await result.current.printLocalCopy(refWithPages(pages), { mark: "DRAFT" });

        expect(printed[0].body.textContent).toContain("Macroscópica");
        expect(printed[0].body.textContent).toContain("Microscópica");
    });
});

describe("useLocalPrint — aislamiento respecto al documento oficial", () => {
    it("no modifica el DOM del renderer: la marca vive solo en el clon", async () => {
        stubPrint();
        const page = makePage("Contenido clínico");
        const before = page.outerHTML;
        const { result } = renderHook(() => useLocalPrint());

        await result.current.printLocalCopy(refWithPages([page]), { mark: "DRAFT" });

        // Si la marca se inyectara en el DOM real, acabaría también en el
        // PDF oficial, que se genera desde ESTE mismo renderer.
        expect(page.outerHTML).toBe(before);
        expect(page.textContent).not.toContain("BORRADOR");
    });

    it("no hace ninguna petición de red", async () => {
        stubPrint();
        const fetchSpy = vi.spyOn(globalThis, "fetch");
        const page = makePage("Contenido clínico");
        const { result } = renderHook(() => useLocalPrint());

        await result.current.printLocalCopy(refWithPages([page]), { mark: "DRAFT" });

        // Ni descarga del PDF oficial, ni generación, ni firma: la copia se
        // compone entera con el DOM que ya estaba en pantalla.
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("no abre ventanas ni pestañas nuevas", async () => {
        stubPrint();
        const openSpy = vi.spyOn(globalThis, "open").mockReturnValue(null);
        const page = makePage("Contenido clínico");
        const { result } = renderHook(() => useLocalPrint());

        await result.current.printLocalCopy(refWithPages([page]), { mark: null });

        expect(openSpy).not.toHaveBeenCalled();
    });

    it("no hace nada si el renderer aún no ha producido páginas", async () => {
        const printed = stubPrint();
        const { result } = renderHook(() => useLocalPrint());

        await result.current.printLocalCopy(refWithPages([]), { mark: "DRAFT" });

        expect(printed).toHaveLength(0);
    });

    it("escapa el título para que un nombre de reporte no inyecte markup", async () => {
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
