import { createRoot } from "react-dom/client";
import { createRef, useEffect, useState } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ReportRendererResolver, {
    type ReportRendererRef as ReportPreviewPagesRef,
    type SignerLookupEntry,
} from "../../src/components/report/report_renderer_resolver";
import InternalReportRender from "../../src/components/report/internal_report_render";
import { allReportFixtures } from "../../src/test/fixtures/reports";
import { allVersionedV2Fixtures } from "../../src/test/fixtures/reports/versioned_v2";
import { allVersionedV2LegacyParityFixtures } from "../../src/test/fixtures/reports/versioned_v2_legacy_parity";
// Cuarta remediación post-Fase 2: fixtures PAREADOS Legacy ↔ V2 (mismo
// contenido clínico, dos renderers) para legacy_v2_parity.visual.spec.ts.
import { allLegacyV2ParityFixtures } from "../../src/test/fixtures/reports/legacy_v2_parity";

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

const allFixtures = {
    ...allReportFixtures,
    ...allVersionedV2Fixtures,
    ...allVersionedV2LegacyParityFixtures,
    ...allLegacyV2ParityFixtures,
};

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

/**
 * Céluma 1.3 Fase 2, Bloque E, Historia E17: exercises the actual
 * InternalReportRender component (the route the backend's headless
 * Chromium navigates to for official PDF generation) in a real browser,
 * without a backend — `window.fetch` is stubbed to answer the one request
 * InternalReportRender makes (GET .../internal/render-data/...) with a
 * fixture, exactly like the real render-data endpoint would. This is what
 * caught (and now guards against regressing) the phantom-blank-page bug:
 * app chrome (ConfigProvider/AntApp/index.css) leaking a few px of spacing
 * into this otherwise chrome-free route, just enough to spill an
 * exact-N-page report onto a genuine blank N+1th physical page when
 * Chromium paginates for page.pdf().
 *
 * Usage: /?internal_render=1&fixture=<key>
 */
function InternalRenderHarness({ fixtureKey }: { fixtureKey: string }) {
    const fixture = allFixtures[fixtureKey];

    // Synchronous (render-body, not useEffect): InternalReportRender reads
    // the token from location.hash in ITS OWN mount-time effect, which (as
    // the child) fires BEFORE this component's own effects — a useEffect
    // here would race and lose. Stubbing fetch here too, for the same reason.
    if (fixture && window.location.hash !== "#token=harness-fake-token") {
        window.location.hash = "#token=harness-fake-token";
    }
    const originalFetchRef = (window as unknown as { __harnessOriginalFetch?: typeof window.fetch })
        .__harnessOriginalFetch ?? window.fetch.bind(window);
    (window as unknown as { __harnessOriginalFetch?: typeof window.fetch }).__harnessOriginalFetch =
        originalFetchRef;
    if (fixture) {
        window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
            if (String(input).includes("/reports/internal/render-data/")) {
                return new Response(
                    JSON.stringify({ ...fixture, signer_lookup: DEFAULT_SIGNER_LOOKUP }),
                    { status: 200, headers: { "Content-Type": "application/json" } },
                );
            }
            return originalFetchRef(input, init);
        }) as typeof window.fetch;
    }

    if (!fixture) {
        return <div data-error="unknown-fixture">Fixture desconocido: {fixtureKey}</div>;
    }

    return (
        <MemoryRouter initialEntries={[`/internal/report-render/harness-report/1`]}>
            <Routes>
                <Route path="/internal/report-render/:reportId/:versionNo" element={<InternalReportRender />} />
            </Routes>
        </MemoryRouter>
    );
}

function Root() {
    const params = new URLSearchParams(window.location.search);
    const fixtureKey = params.get("fixture") ?? "";
    if (params.get("internal_render") === "1") {
        return <InternalRenderHarness fixtureKey={fixtureKey} />;
    }
    return <Harness />;
}

createRoot(document.getElementById("root")!).render(<Root />);
