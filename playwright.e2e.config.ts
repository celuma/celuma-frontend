import { defineConfig, devices } from "@playwright/test";

// Real end-to-end suite — post-Fase-2 remediation, R17. Unlike
// playwright.config.ts (which drives an isolated, fetch-stubbed harness
// with no backend), this drives the REAL app (`npm run dev`) against a
// REAL FastAPI backend. Prerequisite: the backend + Postgres + S3/LocalStack
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
    ],
});
