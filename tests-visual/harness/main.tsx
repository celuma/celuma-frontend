import { createRoot } from "react-dom/client";
import { createRef, useEffect, useState } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ReportRendererResolver, {
    type ReportRendererRef as ReportPreviewPagesRef,
    type SignerLookupEntry,
} from "../../src/components/report/report_renderer_resolver";
import InternalReportRender from "../../src/components/report/internal_report_render";
import type { ReportEnvelope } from "../../src/models/report";
import { allReportFixtures } from "../../src/test/fixtures/reports";
import { allVersionedV2Fixtures } from "../../src/test/fixtures/reports/versioned_v2";
import { allVersionedV2LegacyParityFixtures } from "../../src/test/fixtures/reports/versioned_v2_legacy_parity";
// Fourth post-Phase 2 remediation: PAIRED Legacy ↔ V2 fixtures (same
// clinical content, two renderers) for legacy_v2_parity.visual.spec.ts.
import { allLegacyV2ParityFixtures } from "../../src/test/fixtures/reports/legacy_v2_parity";
import { NotificationHarness } from "./notification_scenarios";
import { NotificationPreferenceHarness } from "./notification_preference_scenarios";
import { UsageHarness } from "./usage_scenarios";

/**
 * Isolated visual-regression harness (Céluma 1.3 Phase 2, Block A / Story
 * A2, extended in Block C / Story C8).
 *
 * Renders one anonymized fixture (legacy or V2) from src/test/fixtures/reports
 * via ReportRendererResolver — the SAME entry point production uses — so
 * Playwright can take real-browser screenshots of layout/pagination that
 * jsdom cannot protect. Routing both legacy and V2 fixtures through the real
 * resolver (instead of importing each renderer directly) means these golden
 * tests exercise the exact production code path, including schema_version
 * resolution. This does not change the 7 Block A legacy snapshots: the
 * resolver renders schema_version absent/1 via the same
 * LegacyReportRendererV1 component, unmodified, with the same props —
 * already proven pixel-identical when the resolver was introduced (see
 * legacy-renderer-contract.md, "Evidence of zero visual changes").
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

/**
 * Test-only geometry overrides, used by page_outer_margin.visual.spec.ts.
 *
 * `?margins=0.5,1.5,4,2` replaces `paper.margins_cm` (top,right,bottom,left)
 * and `?clearOffsets=1` nulls `header.offset_mm`/`footer.offset_mm` — exactly
 * what `report_letterhead_editor.tsx::updateMargin` does when a user edits a
 * margin on an imported Legacy letterhead. Together they let a real browser
 * measure the OUTER margin (page edge -> first printed ink) across margin
 * values, which the screenshot suite cannot resolve: its 2% pixel tolerance
 * absorbs a few-millimetre shift of a small header block.
 *
 * Absent both params the fixture is returned untouched, so every existing
 * visual spec is unaffected.
 */
function applyGeometryOverrides(fixture: ReportEnvelope, params: URLSearchParams): ReportEnvelope {
    const margins = params.get("margins");
    const clearOffsets = params.get("clearOffsets") === "1";
    if (!margins && !clearOffsets) return fixture;

    const next = JSON.parse(JSON.stringify(fixture)) as ReportEnvelope;
    const presentation = (next.report.rendering_snapshot as {
        presentation: {
            paper: { margins_cm: { top: number; right: number; bottom: number; left: number } };
            header: { offset_mm?: number | null };
            footer: { offset_mm?: number | null };
        };
    }).presentation;

    if (margins) {
        const [top, right, bottom, left] = margins.split(",").map(Number);
        presentation.paper.margins_cm = { top, right, bottom, left };
    }
    if (clearOffsets) {
        presentation.header.offset_mm = null;
        presentation.footer.offset_mm = null;
    }
    return next;
}

function Harness() {
    const params = new URLSearchParams(window.location.search);
    const fixtureKey = params.get("fixture") ?? "";
    const rawFixture = allFixtures[fixtureKey];
    const fixture = rawFixture ? applyGeometryOverrides(rawFixture, params) : rawFixture;
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
 * Céluma 1.3 Phase 2, Block E, Story E17: exercises the actual
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
    // Céluma 1.3 Phase 3, Block C: Notification Center surfaces, via
    // /?notifications=<scenario>. Same fetch-stub approach as the
    // internal-render mode above; the report fixtures and their goldens are
    // untouched by it.
    const notificationScenario = params.get("notifications");
    if (notificationScenario) {
        return <NotificationHarness scenarioKey={notificationScenario} />;
    }
    // Céluma 1.3 Phase 3, Block D: the Profile page's notification-preference
    // section, via /?preferences=<scenario>. A separate mode from the one
    // above so the two features' goldens never share a code path.
    const preferenceScenario = params.get("preferences");
    if (preferenceScenario) {
        return <NotificationPreferenceHarness scenarioKey={preferenceScenario} />;
    }
    // Céluma 1.3 Phase 4, Block F: the tenant usage dashboard, via
    // /?usage=<scenario>. Again its own mode — the states worth a golden here
    // are the ones jsdom cannot show (a bar's width, an absent bar, the
    // two-column layout collapsing), and they share no code path with the
    // report fixtures.
    const usageScenario = params.get("usage");
    if (usageScenario) {
        return <UsageHarness scenarioKey={usageScenario} />;
    }
    return <Harness />;
}

createRoot(document.getElementById("root")!).render(<Root />);
