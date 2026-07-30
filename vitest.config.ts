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
        // tests-visual/ holds Playwright specs (real-browser golden tests,
        // Céluma 1.3 Fase 2 Historia A2) — run via `npm run test:visual`,
        // never picked up here since jsdom can't execute them.
        exclude: ["**/node_modules/**", "**/dist/**", "tests-visual/**"],
    },
});
