import { useCallback } from "react";
import type { ReportRendererRef } from "../components/report/legacy/legacy_report_types";
import type { ReportStatus } from "../models/report";

/**
 * Impresión LOCAL de un reporte (cuarta remediación post-Fase 2,
 * Observación 1). Sucesor directo de `use_pdf_export.ts`, renombrado para
 * que el nombre del módulo no vuelva a sugerir que esto produce "el PDF"
 * del reporte.
 *
 * Esto NO es el PDF oficial. Es una copia operativa que el navegador
 * compone en el momento a partir de las páginas YA renderizadas por el
 * renderer resuelto (`getPages()` de ReportRendererResolver → Legacy V1 o
 * Versioned V2), abre en el diálogo de impresión del sistema y descarta.
 * Explícitamente:
 *
 *   - no llama a ningún endpoint de PDF oficial;
 *   - no persiste ningún archivo ni StorageObject;
 *   - no toca `pdf_generation_status`, `pdf_storage_id`, `pdf_sha256`
 *     ni ningún otro metadato del artefacto oficial;
 *   - no calcula ni compara hashes;
 *   - no usa un segundo renderer: reutiliza el DOM del renderer común.
 *
 * Ver local-print-contract.md para la política de producto completa
 * (cuándo se ofrece, con qué permiso, y cómo se distingue del documento
 * oficial en la UI).
 */

/** Marca visible que se estampa en la copia local cuando el documento no es
 *  —o ya no es— la versión oficial publicada. `null` = sin marca. */
export type LocalPrintMark = "DRAFT" | "RETRACTED" | null;

const MARK_TEXT: Record<Exclude<LocalPrintMark, null>, string> = {
    DRAFT: "BORRADOR — DOCUMENTO NO OFICIAL",
    RETRACTED: "RETRACTADO",
};

const MARK_COLOR: Record<Exclude<LocalPrintMark, null>, string> = {
    DRAFT: "#b45309",
    RETRACTED: "#b91c1c",
};

/**
 * Deriva la marca a estampar a partir del estado del reporte.
 *
 * PUBLISHED es el ÚNICO estado sin marca de borrador, porque es el único en
 * el que existe un PDF oficial firmado; aun así la copia local lleva su
 * propio pie aclaratorio (ver `LOCAL_COPY_NOTICE`), porque tampoco entonces
 * sustituye al documento oficial.
 */
export function localPrintMarkForStatus(status: ReportStatus | null | undefined): LocalPrintMark {
    if (status === "RETRACTED") return "RETRACTED";
    if (status === "PUBLISHED") return null;
    return "DRAFT";
}

/** Aclaración al pie de CADA página impresa localmente, en todos los estados. */
export const LOCAL_COPY_NOTICE = "Copia local impresa desde Céluma — no sustituye al PDF oficial.";

export interface LocalPrintOptions {
    /** Usado solo como `<title>` del documento de impresión (nombre sugerido
     *  por el diálogo del sistema al "Guardar como PDF"). */
    filename?: string;
    /** Marca visible. Usa `localPrintMarkForStatus(report.status)`. */
    mark?: LocalPrintMark;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/**
 * Overlay estampado sobre cada página clonada. Se inyecta en el CLON, nunca
 * en el DOM que el renderer controla, de modo que la vista previa en
 * pantalla y —sobre todo— el PDF oficial generado a partir del mismo
 * renderer jamás lo contienen.
 */
function buildOverlayHtml(mark: LocalPrintMark): string {
    const notice = `<div class="celuma-local-copy-notice">${escapeHtml(LOCAL_COPY_NOTICE)}</div>`;
    if (!mark) return notice;
    const text = escapeHtml(MARK_TEXT[mark]);
    const color = MARK_COLOR[mark];
    return `
      <div class="celuma-print-mark-band" style="color:${color};border-color:${color};">${text}</div>
      <div class="celuma-print-watermark" style="color:${color};">${text}</div>
      ${notice}
    `;
}

export function useLocalPrint() {
    const printLocalCopy = useCallback(
        async (
            previewPagesRef: React.RefObject<ReportRendererRef | null>,
            options: LocalPrintOptions = {},
        ) => {
            const pages = previewPagesRef.current?.getPages();
            if (!pages || pages.length === 0) return;

            const { filename, mark = null } = options;

            const safeName = (filename ?? "Reporte")
                .replace(/[^\p{L}\p{N}_\-\s]/gu, "")
                .trim() || "Reporte";

            const overlayHtml = buildOverlayHtml(mark);

            const pagesHtml = Array.from(pages)
                .map((page, i) => {
                    const clone = page.cloneNode(true) as HTMLElement;
                    clone.style.boxShadow = "none";
                    clone.style.margin = "0";
                    // Las páginas del renderer ya son `position: relative`,
                    // pero el clon no debe depender de ello para posicionar
                    // el overlay.
                    clone.style.position = "relative";
                    if (i < pages.length - 1) {
                        clone.style.pageBreakAfter = "always";
                    }
                    clone.insertAdjacentHTML("beforeend", overlayHtml);
                    return clone.outerHTML;
                })
                .join("\n");

            const htmlDoc = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(safeName)}${mark ? ` — ${escapeHtml(MARK_TEXT[mark])}` : " (copia local)"}</title>
<style>
  @page { size: letter; margin: 0; }
  html, body { margin: 0; padding: 0; }
  body {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    color-adjust: exact;
  }
  .celuma-print-mark-band {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 9999;
    text-align: center;
    font-family: Arial, sans-serif;
    font-size: 9pt;
    font-weight: 700;
    letter-spacing: .08em;
    padding: 2mm 0;
    border-bottom: 1px solid currentColor;
    background: rgba(255,255,255,.85);
  }
  .celuma-print-watermark {
    position: absolute;
    top: 50%;
    left: 50%;
    z-index: 9998;
    transform: translate(-50%, -50%) rotate(-32deg);
    font-family: Arial, sans-serif;
    font-size: 42pt;
    font-weight: 700;
    letter-spacing: .06em;
    white-space: nowrap;
    opacity: .12;
    pointer-events: none;
  }
  .celuma-local-copy-notice {
    position: absolute;
    bottom: 1mm;
    left: 0;
    right: 0;
    z-index: 9999;
    text-align: center;
    font-family: Arial, sans-serif;
    font-size: 6pt;
    color: #6b7280;
  }
</style>
</head>
<body>${pagesHtml}</body>
</html>`;

            // Hidden iframe — no popup window or tab is opened
            const iframe = document.createElement("iframe");
            iframe.style.cssText = "position:fixed;width:0;height:0;border:none;opacity:0;pointer-events:none;";
            iframe.setAttribute("data-celuma-local-print", "true");
            document.body.appendChild(iframe);

            const iframeDoc = iframe.contentDocument!;
            iframeDoc.open();
            iframeDoc.write(htmlDoc);
            iframeDoc.close();

            // Wait for all images inside the iframe to load
            const imgs = Array.from(iframeDoc.querySelectorAll("img"));
            await Promise.all(
                imgs.map(
                    (img) =>
                        new Promise<void>((resolve) => {
                            if (img.complete && img.naturalWidth > 0) return resolve();
                            img.onload = () => resolve();
                            img.onerror = () => resolve();
                        }),
                ),
            );

            if ("fonts" in iframeDoc) {
                await (iframeDoc as FontFaceSource & Document).fonts.ready;
            }

            // Small delay to ensure layout is complete
            await new Promise((r) => setTimeout(r, 300));

            iframe.contentWindow!.focus();
            iframe.contentWindow!.print();

            // Remove iframe after printing (afterprint) or after a fallback timeout
            const cleanup = () => { iframe.remove(); };
            iframe.contentWindow!.addEventListener("afterprint", cleanup, { once: true });
            setTimeout(cleanup, 3000);
        },
        [],
    );

    return { printLocalCopy };
}
