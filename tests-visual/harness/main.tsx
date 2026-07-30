import { createRoot } from "react-dom/client";
import { createRef, useEffect, useState } from "react";
import ReportPreviewPages, {
    type LegacyReportRendererV1Ref as ReportPreviewPagesRef,
    type SignerLookupEntry,
} from "../../src/components/report/legacy/legacy_report_renderer_v1";
import { allReportFixtures } from "../../src/test/fixtures/reports";

/**
 * Isolated visual-regression harness (Céluma 1.3 Fase 2, Bloque A / Historia A2).
 *
 * Renders one anonymized fixture from src/test/fixtures/reports via
 * ReportPreviewPages (the current, unmodified renderer) so Playwright can take
 * real-browser screenshots of layout/pagination that jsdom cannot protect.
 * Never bundled into the production app — served only by vite.harness.config.ts.
 *
 * Usage: /?fixture=<key of allReportFixtures>
 */

// Matches the signer id used in publishedMultiSampleWithImages' signed_by so the
// signature block resolves a display name, same as report_preview_pages.test.tsx.
const DEFAULT_SIGNER_LOOKUP: SignerLookupEntry[] = [
    { id: "00000000-0000-0000-0000-000000000099", name: "Firmante de Prueba" },
];

function waitForImages(host: HTMLElement): Promise<void> {
    const imgs = Array.from(host.querySelectorAll("img"));
    return Promise.all(
        imgs.map(
            (img) =>
                new Promise<void>((resolve) => {
                    if (img.complete) return resolve();
                    img.addEventListener("load", () => resolve(), { once: true });
                    img.addEventListener("error", () => resolve(), { once: true });
                }),
        ),
    ).then(() => undefined);
}

function Harness() {
    const params = new URLSearchParams(window.location.search);
    const fixtureKey = params.get("fixture") ?? "";
    const fixture = allReportFixtures[fixtureKey];
    const ref = createRef<ReportPreviewPagesRef>();
    const [ready, setReady] = useState(false);

    useEffect(() => {
        if (!fixture) return;
        let cancelled = false;
        const hostId = "pages-host";

        requestAnimationFrame(() => {
            requestAnimationFrame(async () => {
                const host = document.getElementById(hostId);
                if (host) await waitForImages(host);
                if (!cancelled) setReady(true);
            });
        });

        return () => {
            cancelled = true;
        };
    }, [fixture]);

    if (!fixture) {
        return <div data-error="unknown-fixture">Fixture desconocido: {fixtureKey}</div>;
    }

    return (
        <div id="pages-host" data-ready={ready ? "true" : "false"}>
            <ReportPreviewPages ref={ref} report={fixture} signerLookup={DEFAULT_SIGNER_LOOKUP} />
        </div>
    );
}

createRoot(document.getElementById("root")!).render(<Harness />);
