import { useCallback } from "react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import type { ReportPreviewPagesRef } from "../components/report/report_preview_pages";

export function usePdfExport() {
    const exportToPDF = useCallback(async (previewPagesRef: React.RefObject<ReportPreviewPagesRef | null>) => {
        const pages = previewPagesRef.current?.getPages();
        if (!pages || pages.length === 0) return;

        // Make sure web fonts are loaded before rasterizing
        if ("fonts" in document) {
            await document.fonts.ready;
        }

        // Helper: wait for all images on a page to load
        const waitForImages = (root: HTMLElement) => {
            const imgs = Array.from(root.querySelectorAll("img"));
            return Promise.all(
                imgs.map(
                    (img) =>
                        new Promise<void>((resolve) => {
                            if (img.complete && img.naturalWidth > 0) return resolve();
                            const onDone = () => {
                                img.removeEventListener("load", onDone);
                                img.removeEventListener("error", onDone);
                                resolve();
                            };
                            img.addEventListener("load", onDone);
                            img.addEventListener("error", onDone);
                        })
                )
            );
        };

        // Wait for pictures just in case
        for (const page of pages) {
            await waitForImages(page);
        }

        // Create the PDF in Letter size
        const doc = new jsPDF({
            unit: "mm",
            format: "letter",
            orientation: "portrait",
            compress: true,
        });

        // mm of the letter page
        const PAGE_W_MM = 215.9;
        const PAGE_H_MM = 279.4;

        for (let i = 0; i < pages.length; i++) {
            const page = pages[i];

            // Rasterize the FULL PAGE as seen in preview
            const canvas = await html2canvas(page, {
                scale: window.devicePixelRatio || 2,
                useCORS: true,
                backgroundColor: "#ffffff",
                allowTaint: true,
                logging: false,
                // These two options help html2canvas calculate layout as on screen
                windowWidth: page.offsetWidth,
                windowHeight: page.offsetHeight,
            });

            const imgData = canvas.toDataURL("image/jpeg", 0.95);

            // On the 2nd+ page add new page
            if (i > 0) doc.addPage("letter", "portrait");

            // Paste the image occupying the ENTIRE page (0 margins)
            doc.addImage(imgData, "JPEG", 0, 0, PAGE_W_MM, PAGE_H_MM);
        }

        doc.save("reporte.pdf");
    }, []);

    return { exportToPDF };
}
