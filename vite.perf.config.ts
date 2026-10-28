import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Measurement-only build (`npm run test:perf`). Unminified so a CPU profile
// names the real functions, and `react-dom/client` is aliased to the profiling
// build so React `Profiler` callbacks fire. Never used for the application.
export default defineConfig({
    root: path.resolve(__dirname, "tests-perf/harness"),
    plugins: [react()],
    resolve: { alias: [{ find: /^react-dom\/client$/, replacement: "react-dom/profiling" }] },
    build: {
        outDir: path.resolve(__dirname, ".perf-dist"),
        emptyOutDir: true,
        minify: false,
        rollupOptions: { input: path.resolve(__dirname, "tests-perf/harness/report_perf.html") },
    },
    worker: { format: "es" },
    preview: { host: "127.0.0.1", port: Number(process.env.PERF_PORT ?? 4175), strictPort: true },
});
