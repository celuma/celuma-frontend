import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import ReportRendererResolver from "./report_renderer_resolver";
import type { ReportRendererRef } from "./legacy/legacy_report_types";
import { fetchInternalRenderData } from "../../services/report_service";
import type { InternalRenderData } from "../../models/report";

/**
 * InternalReportRender (Céluma 1.3 Phase 2, Block E, Story E3).
 *
 * Chrome-free page navigated to by the backend's headless Chromium
 * (ReportPdfGenerationService) to produce the official PDF artifact — never
 * linked to from anywhere in the app UI, never wrapped in RequireAuth/
 * RequirePermission/Layout. Authorization is a short-lived render token
 * carried in the URL *fragment* (`#token=...`), never the query string, so
 * it never reaches nginx/CDN access logs.
 *
 * Renders through the exact same ReportRendererResolver entry point as the
 * editor/detail preview and the print-copy export, then signals readiness
 * via `document.documentElement.dataset.reportReady = "true"` once images
 * and fonts have settled — the backend waits for that selector before
 * calling Chromium's page.pdf(). See pdf-generation-contract.md.
 */

function waitForImages(host: HTMLElement): Promise<void> {
    const imgs = Array.from(host.querySelectorAll("img"));
    return Promise.all(
        imgs.map(
            (img) =>
                new Promise<void>((resolve) => {
                    // `img.complete` alone (not also naturalWidth > 0) is the
                    // right check: it's true once the browser is DONE trying
                    // to load the image, successfully or not. Requiring
                    // naturalWidth > 0 too creates a race — if the image had
                    // already failed (and fired its one-time "error" event)
                    // before this effect ran, a fresh listener attached here
                    // would never fire again and this promise would hang
                    // forever, blocking the ready signal (and the PDF
                    // generation waiting on it) indefinitely.
                    if (img.complete) return resolve();
                    img.addEventListener("load", () => resolve(), { once: true });
                    img.addEventListener("error", () => resolve(), { once: true });
                }),
        ),
    ).then(() => undefined);
}

/** H-0c Blocker B. Returns an error code when the report requires a digital
 *  signature but its autograph is not actually on the page and decoded;
 *  `null` when there is nothing to enforce.
 *
 *  Intrinsic dimensions are the check that matters: `complete` is true for a
 *  failed load too, and a failed <img> stays in the DOM at zero width — which
 *  is precisely what a viewer sees as "the signature is missing from the
 *  official PDF". */
function requiredAutographFailure(data: InternalRenderData): string | null {
    const meta = (data as { report?: { signatureMetadata?: Record<string, unknown> } })
        .report?.signatureMetadata;
    const requiresAutograph = Boolean(
        meta?.show_signature_section && meta?.require_digital_signature,
    );
    // Only a SIGNED report can be expected to carry one; an unsigned preview
    // legitimately renders the pending state.
    if (!requiresAutograph || !data.signed_at) return null;

    if (!meta?.signature_url) return "SIGNATURE_URL_MISSING";
    const img = document.querySelector<HTMLImageElement>('img[data-signature-autograph="required"]');
    if (!img) return "SIGNATURE_NOT_RENDERED";
    if (!img.naturalWidth) return "SIGNATURE_NOT_LOADED";
    return null;
}

/** Render tokens live in the URL fragment (`#token=...`), never the query
 * string — fragments are never sent to the server, so they can't leak into
 * access logs the way a `?token=...` query param would. */
function readRenderToken(): string | null {
    const hash = window.location.hash;
    if (!hash || hash.length < 2) return null;
    return new URLSearchParams(hash.slice(1)).get("token");
}

export default function InternalReportRender() {
    const { reportId, versionNo } = useParams<{ reportId: string; versionNo: string }>();
    const rendererRef = useRef<ReportRendererRef>(null);
    const [data, setData] = useState<InternalRenderData | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const token = readRenderToken();
        if (!reportId || !versionNo || !token) {
            setError("Solicitud de renderizado interno inválida: faltan parámetros o token.");
            return;
        }
        let cancelled = false;
        fetchInternalRenderData(token, reportId, versionNo)
            .then((result) => {
                if (!cancelled) setData(result);
            })
            .catch((err: unknown) => {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : "Error al cargar el reporte");
                }
            });
        return () => {
            cancelled = true;
        };
    }, [reportId, versionNo]);

    useEffect(() => {
        if (!data) return;
        let cancelled = false;
        // Double rAF lets React commit and the browser lay out the freshly
        // mounted pages before we touch them — same pattern the Playwright
        // visual-regression harness already uses (tests-visual/harness/main.tsx).
        requestAnimationFrame(() => {
            requestAnimationFrame(async () => {
                const host = document.getElementById("report-render-host");
                if (host) await waitForImages(host);
                if ("fonts" in document) {
                    await document.fonts.ready;
                }
                const pages = rendererRef.current?.getPages() ?? [];
                // Same page-break-after wrapping use_local_print.ts applies to
                // cloned pages before window.print() — applied here directly to
                // the live DOM (no iframe/clone) so Chromium's own page.pdf()
                // breaks at identical boundaries. Also explicitly zero each
                // page's own top/bottom margin: whatever ambient default
                // margin the app chrome contributes elsewhere (see the
                // container-level cancellation below) collapses with each
                // page div's own touching margin at every page BOUNDARY too
                // — one extra ~16px gap per boundary (n-1 for n pages),
                // observed directly on real multi-page reports. Page
                // boundaries are handled entirely by page-break-after/@page
                // sizing; a page div must never carry its own margin.
                pages.forEach((page, i) => {
                    page.style.pageBreakAfter = i < pages.length - 1 ? "always" : "auto";
                    page.style.marginTop = "0";
                    page.style.marginBottom = "0";
                });
                // The app chrome this route mounts through (ConfigProvider/
                // AntApp/index.css — none of it ours to strip from here)
                // leaves a few px of top offset before #report-render-host
                // that's invisible next to normal page chrome elsewhere, but
                // on this chrome-free route is just enough extra height to
                // spill an exact-N-page report onto a genuine blank N+1th
                // physical page when Chromium paginates for page.pdf().
                // Cancel it empirically (measured, not guessed) rather than
                // fight an unknown/future CSS cascade — a negative margin
                // preserves normal flow, unlike taking the host out of flow
                // entirely, which was tried and silently truncated
                // multi-page reports instead.
                const host2 = document.getElementById("report-render-host");
                if (host2) {
                    const gap = host2.getBoundingClientRect().top;
                    if (gap !== 0) {
                        host2.style.marginTop = `${-gap}px`;
                    }
                }
                if (cancelled) return;

                // H-0c Blocker B. An official PDF is a clinical artifact: if
                // the report REQUIRES a digital signature and the autograph
                // did not actually decode, publishing anyway produces a
                // document that silently misrepresents itself as signed while
                // showing an empty box where the signature belongs.
                //
                // `waitForImages` above intentionally treats a FAILED image as
                // settled (see its comment — requiring naturalWidth there would
                // hang forever on an already-failed load). That is correct for
                // readiness, but it means "ready" alone never distinguished a
                // loaded autograph from a broken one. This does, and refuses to
                // signal ready when a required autograph is missing.
                const failure = requiredAutographFailure(data);
                if (failure) {
                    document.documentElement.dataset.reportRenderError = failure;
                    return;
                }
                document.documentElement.dataset.reportReady = "true";
            });
        });
        return () => {
            cancelled = true;
        };
    }, [data]);

    return (
        <>
            <style>{`
                @page { size: letter; margin: 0; }
                html, body { margin: 0; padding: 0; background: #fff; }
                body { -webkit-print-color-adjust: exact; print-color-adjust: exact; color-adjust: exact; }
                #report-render-host { margin: 0; padding: 0; }
            `}</style>
            {error && <div data-render-error="true">{error}</div>}
            {!error && !data && <div data-render-loading="true">Cargando…</div>}
            {!error && data && (
                <div id="report-render-host">
                    <ReportRendererResolver
                        ref={rendererRef}
                        report={data}
                        signerLookup={data.signer_lookup}
                    />
                </div>
            )}
        </>
    );
}
