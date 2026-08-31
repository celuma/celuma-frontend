//The loadEnv library is used to read environment variables.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(
    readFileSync(path.join(__dirname, "package.json"), "utf-8"),
) as { version: string };

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), "");
    //Address where the proxy should point.
    const proxy_target = env.VITE_PROXY_TARGET || env.VITE_API_BACKEND_HOST || "http://localhost:8000";

    return {
        plugins: [react()],
        define: {
            __CELUMA_APP_INFO__: JSON.stringify({
                // RELEASE identity. `package.json` is the source of truth, so
                // the production release workflow (which runs a plain
                // `npm run build`) no longer falls back to "0.0.0" — that
                // fallback is exactly why the production UI displayed 0.0.0
                // (H-0c, section 10). `VITE_APP_VERSION` still overrides it,
                // which is what staging/PR builds use to stamp a SHA.
                version: env.VITE_APP_VERSION || packageJson.version,
                // PROVENANCE, kept separate so displaying the semantic
                // version never costs SHA-level traceability.
                commit: env.VITE_APP_COMMIT || null,
            }),
        },
        server: {
            // Céluma 1.3 Phase 2, Block E: the backend's headless-Chromium PDF
            // generator (running inside the `api` Docker container) needs to
            // reach this dev server to render `/internal/report-render/...`.
            // Docker Desktop's `host.docker.internal` only resolves back here
            // if the dev server actually binds beyond loopback, and Vite's own
            // host-header check must be told to trust that hostname. Only
            // affects `vite dev`/`vite preview` — never the static `vite build`
            // output actually served in production.
            host: true,
            allowedHosts: ["localhost", "host.docker.internal"],
            proxy: {
                "/api": {
                    target: proxy_target,
                    changeOrigin: true,
                },
            },
        },
    };
});