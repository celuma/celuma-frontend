import { useCallback } from "react";
import type { ReportRendererRef } from "../components/report/legacy/legacy_report_types";
import type { ReportStatus } from "../models/report";

/**
 * LOCAL printing of a report (fourth post-Phase 2 remediation,
 * Observation 1). Direct successor to `use_pdf_export.ts`, renamed so
 * the module name no longer suggests this produces "the PDF" of the
 * report.
 *
 * This is NOT the official PDF. It is an operational copy that the browser
 * composes on demand from pages ALREADY rendered by the resolved renderer
 * (`getPages()` from ReportRendererResolver → Legacy V1 or Versioned V2),
 * opens in the system print dialog, and discards. Specifically:
 *
 *   - does not call any official PDF endpoint;
 *   - does not persist any file or StorageObject;
 *   - does not touch `pdf_generation_status`, `pdf_storage_id`, `pdf_sha256`,
 *     or any other official-artifact metadata;
 *   - does not calculate or compare hashes;
 *   - does not use a second renderer: it reuses the shared renderer's DOM.
 *
 * See local-print-contract.md for the complete product policy (when it is
 * offered, with which permission, and how the UI distinguishes it from the
 * official document).
 */

/** Visible mark stamped on the local copy when the document is not—or is no
 *  longer—the published official version. `null` = no mark. */
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
 * Derives the mark to stamp from the report status.
 *
 * PUBLISHED is the ONLY status without a draft mark because it is the only
 * one with a signed official PDF. Even then, the local copy includes its own
 * explanatory footer (see `LOCAL_COPY_NOTICE`) because it does not replace
 * the official document.
 */
export function localPrintMarkForStatus(status: ReportStatus | null | undefined): LocalPrintMark {
    if (status === "RETRACTED") return "RETRACTED";
    if (status === "PUBLISHED") return null;
    return "DRAFT";
}

/** Footer notice on EVERY locally printed page, in all statuses. */
export const LOCAL_COPY_NOTICE = "Copia local impresa desde Céluma — no sustituye al PDF oficial.";

export interface LocalPrintOptions {
    /** Used only as the print document's `<title>` (the name suggested by the
     *  system dialog for "Save as PDF"). */
    filename?: string;
    /** Visible mark. Use `localPrintMarkForStatus(report.status)`. */
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
 * Overlay stamped over each cloned page. It is injected into the CLONE,
 * never into the DOM controlled by the renderer, so the on-screen preview
 * and—above all—the official PDF generated from the same renderer never
 * contain it.
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
                    // Renderer pages are already `position: relative`, but
                    // the clone must not depend on that to position the overlay.
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
