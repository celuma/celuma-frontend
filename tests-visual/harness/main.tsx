import { createRoot } from "react-dom/client";
import { createRef, useEffect, useState } from "react";
import ReportRendererResolver, {
    type ReportRendererRef as ReportPreviewPagesRef,
    type SignerLookupEntry,
} from "../../src/components/report/report_renderer_resolver";
import { allReportFixtures } from "../../src/test/fixtures/reports";
import { allVersionedV2Fixtures } from "../../src/test/fixtures/reports/versioned_v2";

/**
 * Isolated visual-regression harness (Céluma 1.3 Fase 2, Bloque A / Historia
 * A2, extended in Bloque C / Historia C8).
 *
 * Renders one anonymized fixture (legacy or V2) from src/test/fixtures/reports
 * via ReportRendererResolver — the SAME entry point production uses — so
 * Playwright can take real-browser screenshots of layout/pagination that
 * jsdom cannot protect. Routing both legacy and V2 fixtures through the real
 * resolver (instead of importing each renderer directly) means these golden
 * tests exercise the exact production code path, including schema_version
 * resolution. This does not change the 7 Bloque A legacy snapshots: the
 * resolver renders schema_version absent/1 via the same
 * LegacyReportRendererV1 component, unmodified, with the same props —
 * already proven pixel-identical when the resolver was introduced (see
 * legacy-renderer-contract.md, "Evidencia de cero cambios visuales").
 * Never bundled into the production app — served only by vite.harness.config.ts.
 *
 * Usage: /?fixture=<key of allReportFixtures or allVersionedV2Fixtures>
 */

const allFixtures = { ...allReportFixtures, ...allVersionedV2Fixtures };

// Matches the signer ids used in publishedMultiSampleWithImages.signed_by (legacy)
// and v2CompleteBranding.signed_by (V2) so the signature block resolves a
// display name, same as their respective unit test suites.
const DEFAULT_SIGNER_LOOKUP: SignerLookupEntry[] = [
    { id: "00000000-0000-0000-0000-000000000099", name: "Firmante de Prueba" },
    { id: "00000000-0000-0000-0000-000000000199", name: "Firmante Real V2 de Prueba" },
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
    const fixture = allFixtures[fixtureKey];
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
            <ReportRendererResolver ref={ref} report={fixture} signerLookup={DEFAULT_SIGNER_LOOKUP} />
        </div>
    );
}

createRoot(document.getElementById("root")!).render(<Harness />);
