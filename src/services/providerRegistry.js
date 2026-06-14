import { OllamaProvider } from './providers/ollama.js'
import { OpenAICompatibleProvider } from './providers/openai-compatible.js'

/**
 * Definisi semua provider yang tersedia di app.
 * Tambah provider baru di sini.
 */
export const PROVIDERS = [
  {
    id: 'ollama',
    name: 'Ollama',
    factory: (config) => new OllamaProvider(config),
    // Provider ini selalu ada (built-in local)
    builtIn: true,
    defaultModel: import.meta.env.VITE_OLLAMA_DEFAULT_MODEL || ''
  },
  {
    id: '9router',
    name: '9Router (Local)',
    factory: (config) => new OpenAICompatibleProvider({
      id: '9router',
      name: '9Router',
      // Pada mode development gunakan path relatif sehingga Vite proxy dapat
      // menangkap request dan menghindari CORS. Pada production gunakan URL
      // yang diset di env atau default localhost.
      baseUrl: config?.baseUrl
        || (import.meta.env.MODE === 'development'
            ? ''
            : import.meta.env.VITE_9ROUTER_BASE_URL
            || 'http://localhost:20128/v1'),
      apiKey: config?.apiKey || import.meta.env.VITE_9ROUTER_API_KEY || '',
      requiresApiKey: false, // server lokal biasanya tanpa key
      supportsVision: true,
      defaultModel: import.meta.env.VITE_9ROUTER_DEFAULT_MODEL || ''
    }),
    builtIn: true
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    factory: (config) => new OpenAICompatibleProvider({
      id: 'openrouter',
      name: 'OpenRouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: config?.apiKey || import.meta.env.VITE_OPENROUTER_API_KEY || '',
      requiresApiKey: true,
      supportsVision: true,
      defaultModel: import.meta.env.VITE_OPENROUTER_DEFAULT_MODEL || ''
    }),
    builtIn: true
  }
]

/**
 * Buat instance provider berdasarkan id.
 * @param {string} providerId
 * @param {object} [config] — runtime config (apiKey, baseUrl override dari localStorage)
 */
export function createProvider(providerId, config = {}) {
  const def = PROVIDERS.find((p) => p.id === providerId)
  if (!def) throw new Error(`Provider "${providerId}" tidak dikenal`)
  return def.factory(config)
}

/**
 * Default provider id (kalau user belum pernah pilih).
 */
export const DEFAULT_PROVIDER_ID = 'ollama'
