import { defineConfig, devices } from "@playwright/test";

// Opt-in typing-latency measurements (`npm run test:perf`); see
// tests-perf/report_typing.perf.spec.ts. Serves the production-mode perf build
// produced by vite.perf.config.ts. Not part of the default visual suite.
const port = Number(process.env.PERF_PORT ?? 4175);
export default defineConfig({
    testDir: "./tests-perf",
    fullyParallel: false,
    workers: 1,
    retries: 0,
    reporter: [["list"]],
    use: { baseURL: `http://127.0.0.1:${port}`, ...devices["Desktop Chrome"] },
    webServer: {
        command: `npx vite build --config vite.perf.config.ts && npx vite preview --config vite.perf.config.ts`,
        url: `http://127.0.0.1:${port}/report_perf.html`,
        reuseExistingServer: false,
        timeout: 240_000,
    },
    // PERF_CHROMIUM lets a sandbox point at a pre-installed Chromium whose build differs from Playwright's pin.
    projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], launchOptions: process.env.PERF_CHROMIUM ? { executablePath: process.env.PERF_CHROMIUM } : {} } }],
});
