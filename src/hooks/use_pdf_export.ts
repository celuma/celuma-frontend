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

        // Create a hidden iframe — no popup window or tab is opened
        const iframe = document.createElement("iframe");
        iframe.style.cssText = "position:fixed;width:0;height:0;border:none;opacity:0;pointer-events:none;";
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
    }, []);

    return { exportToPDF };
}
