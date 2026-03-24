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
                version: env.VITE_APP_VERSION || packageJson.version,
            }),
        },
        server: {
            proxy: {
                "/api": {
                    target: proxy_target,
                    changeOrigin: true,
                },
            },
        },
    };
});