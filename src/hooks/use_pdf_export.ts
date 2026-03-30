import { useCallback } from "react";
import type { ReportPreviewPagesRef } from "../components/report/report_preview_pages";

export function usePdfExport() {
    const exportToPDF = useCallback(async (
        previewPagesRef: React.RefObject<ReportPreviewPagesRef | null>,
        filename?: string,
    ) => {
        const pages = previewPagesRef.current?.getPages();
        if (!pages || pages.length === 0) return;

        const safeName = (filename ?? "Reporte")
            .replace(/[^\p{L}\p{N}_\-\s]/gu, "")
            .trim() || "Reporte";

        const pagesHtml = Array.from(pages)
            .map((page, i) => {
                const clone = page.cloneNode(true) as HTMLElement;
                clone.style.boxShadow = "none";
                clone.style.margin = "0";
                if (i < pages.length - 1) {
                    clone.style.pageBreakAfter = "always";
                }
                return clone.outerHTML;
            })
            .join("\n");

        const htmlDoc = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${safeName}</title>
<style>
  @page { size: letter; margin: 0; }
  html, body { margin: 0; padding: 0; }
  body {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    color-adjust: exact;
  }
</style>
</head>
<body>${pagesHtml}</body>
</html>`;

        const printWin = window.open("", "_blank");
        if (!printWin) {
            alert("No se pudo abrir la ventana de impresión. Permite las ventanas emergentes e intenta de nuevo.");
            return;
        }

        printWin.document.open();
        printWin.document.write(htmlDoc);
        printWin.document.close();

        // Wait for all images to finish loading in the print window
        const imgs = Array.from(printWin.document.querySelectorAll("img"));
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

        if ("fonts" in printWin.document) {
            await (printWin.document as FontFaceSource & Document).fonts.ready;
        }

        // Small delay to ensure the browser finishes layout
        await new Promise((r) => setTimeout(r, 400));

        printWin.focus();
        printWin.print();

        printWin.addEventListener("afterprint", () => {
            printWin.close();
        });
    }, []);

    return { exportToPDF };
}
