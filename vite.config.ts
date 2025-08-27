//The loadEnv library is used to read environment variables.
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '')
    //Address where the proxy should point.
    const proxy_target = env.VITE_PROXY_TARGET || env.VITE_API_BACKEND_HOST || 'http://localhost:8000'

    return {
        plugins: [
            react()
        ],
        server: {
            proxy: {
                '/api': {
                    target: proxy_target,
                    changeOrigin: true,
                }
            }
        }
    }
})