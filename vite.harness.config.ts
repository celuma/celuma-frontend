import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Separate from vite.config.ts on purpose (same rationale as vitest.config.ts):
// this serves the isolated visual-regression harness added in Céluma 1.3 Fase 2
// Bloque A to protect the legacy report renderer with real-browser screenshots,
// without touching the production Vite build config in any way.
export default defineConfig({
    root: path.resolve(__dirname, "tests-visual/harness"),
    plugins: [react()],
    server: {
        host: "127.0.0.1",
        port: 4174,
        strictPort: true,
    },
    preview: {
        host: "127.0.0.1",
        port: 4174,
        strictPort: true,
    },
});
