import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const port = parseInt(env.VITE_PORT) || 8989;

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    server: {
      port: port,
      host: '0.0.0.0',
      proxy: {
        '/comfy': {
          target: 'http://127.0.0.1:8188',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/comfy/, '')
        },
        // Proxy 9Router (OpenAI‑compatible) API to avoid CORS when running on localhost
        // The UI calls `${baseUrl}/v1/...` (e.g. http://localhost:20128/v1/chat/completions).
        // By proxying the `/v1` prefix we make the request appear to come from the same origin
        // (http://localhost:8989), eliminating the browser CORS block.
        '/v1': {
          target: 'http://localhost:20128',
          changeOrigin: true,
          // No rewrite – keep the `/v1` prefix so the backend receives the expected path.
        }
      }
    }
  }
})
