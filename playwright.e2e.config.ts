import { defineConfig, devices } from "@playwright/test";

// Real end-to-end suite — post-Phase-2 remediation, R17. Unlike
// playwright.config.ts (which drives an isolated, fetch-stubbed harness
// with no backend), this drives the real app (`npm run dev`) against a
// real FastAPI backend. Prerequisite: the backend + Postgres + S3/LocalStack
// stack must already be running (`docker compose up` in celuma-backend) —
// this config does not start it. Each spec creates its own isolated
// tenant/user via POST /auth/register/unified, so it never touches real
// tenant data and can run repeatedly without manual cleanup.
//
// Run: npm run test:e2e
export default defineConfig({
    testDir: "./tests-e2e",
    fullyParallel: false, // each spec creates its own tenant, but shares one dev server/backend
    forbidOnly: !!process.env.CI,
    retries: 0,
    timeout: 60_000,
    reporter: [["list"]],
    use: {
        baseURL: process.env.CELUMA_E2E_BASE_URL || "http://localhost:5173",
        apiBaseURL: process.env.CELUMA_E2E_API_BASE_URL || "http://localhost:8000",
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
    },
    webServer: {
        command: "npm run dev",
        url: process.env.CELUMA_E2E_BASE_URL || "http://localhost:5173",
        reuseExistingServer: true,
        timeout: 30_000,
    },
    projects: [
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"] },
        },
        // Fifth post-Phase 2 remediation (§9.3/§12). The download failure was
        // reported in Safari, and this suite only ran on Chromium —
        // where `window.open(presignedUrl)` does fire the download event,
        // so the bug was invisible here. WebKit is the Safari engine:
        // with it, the download of the official PDF is carried out in the browser
        // where it failed. See safari-pdf-download-contract.md.
        //
        // Requires `npx playwright install webkit`.
        //
        // CELUMA_E2E_SKIP_WEBKIT=1 disables it. Required on machines where
        // the WebKit build that Playwright brings does not start: in the
        // local validation of this remediation (macOS 26.0 arm64,
        // Playwright 1.62, webkit-2336) the binary does `Segmentation
        // fault: 11` even with `--version`, before running any test.
        // It is a browser failure, not a suite failure — see
        // remediation-5-e2e-report.md.
        ...(process.env.CELUMA_E2E_SKIP_WEBKIT === "1"
            ? []
            : [{ name: "webkit", use: { ...devices["Desktop Safari"] } }]),
    ],
});
