import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Separate from vite.config.ts on purpose: this is validation tooling added in
// Céluma 1.3 Fase 1 to protect current report-rendering and search/sort behavior
// with regression tests, without touching the production Vite build config.
export default defineConfig({
    plugins: [react()],
    define: {
        __CELUMA_APP_INFO__: JSON.stringify({ version: "test" }),
    },
    test: {
        environment: "jsdom",
        setupFiles: ["./src/test/setup.ts"],
        css: false,
        globals: false,
        // tests-visual/ and tests-e2e/ hold Playwright specs (real-browser
        // golden tests from Fase 2 Historia A2, and the real-browser E2E
        // suite from the post-Fase-2 remediation) — run via `npm run
        // test:visual` / `npm run test:e2e`, never picked up here since
        // jsdom can't execute them.
        exclude: ["**/node_modules/**", "**/dist/**", "tests-visual/**", "tests-e2e/**"],
    },
});
