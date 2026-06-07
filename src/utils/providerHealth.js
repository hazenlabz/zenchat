import { createProvider, PROVIDERS } from '@/services/providerRegistry'
import { checkComfyStatus, fetchCheckpoints } from '@/services/comfy.js'

/**
 * Health check helper untuk semua provider (Ollama, 9Router, OpenRouter) + ComfyUI.
 *
 * Dipakai store untuk auto-retry dengan exponential backoff dan expose status
 * reaktif ke UI. Setiap provider punya status sendiri: { online, error, latency, lastCheck }.
 */

/** Default timeout per health check (ms) — pendek karena ini ping, bukan request berat. */
const DEFAULT_HEALTH_TIMEOUT = 4000

/** Min/max interval untuk auto-retry (ms). Pakai exponential backoff saat offline. */
const MIN_RETRY_INTERVAL = 5000   // 5s
const MAX_RETRY_INTERVAL = 60000  // 60s

/**
 * Cek kesehatan satu provider (Ollama / 9Router / OpenRouter).
 * Dipakai tracker dengan signature `(opts) => ...` dimana opts = { baseUrl, apiKey, signal }.
 * @returns {Promise<void>} — resolve kalau online, throw kalau offline
 */
export async function checkProviderHealth(opts) {
  // opts di-passing oleh tracker: { baseUrl, apiKey, signal }
  // Tapi fungsi ini juga masih bisa dipanggil langsung dengan (providerId, config, signal)
  // untuk backward compat. Kalau opts.providerId ada, pakai yang baru.
  const providerId = opts.providerId
  const baseUrl = opts.baseUrl || (providerId ? _defaultBaseUrl(providerId) : '')
  const provider = createProvider(providerId, {
    baseUrl,
    apiKey: opts.apiKey || ''
  })
  if (!provider.isConfigured()) {
    throw new Error('Provider belum dikonfigurasi. Buka Settings.')
  }
  if (typeof provider.checkHealth === 'function') {
    await provider.checkHealth(opts.signal)
  } else {
    await provider.fetchModels({ signal: opts.signal })
  }
}

/**
 * Default base URL per provider (diambil dari env). Dipakai saat config.baseUrl kosong.
 */
function _defaultBaseUrl(providerId) {
  const def = PROVIDERS.find((p) => p.id === providerId)
  if (!def) return ''
  if (providerId === 'ollama') {
    return import.meta.env.VITE_OLLAMA_BASE_URL || 'http://localhost:11434'
  }
  if (providerId === '9router') {
    return import.meta.env.VITE_9ROUTER_BASE_URL || 'http://localhost:20128/v1'
  }
  if (providerId === 'openrouter') {
    return import.meta.env.VITE_OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1'
  }
  return ''
}

/**
 * Cek kesehatan ComfyUI. Pakai /queue (endpoint paling ringan) sebagai primary
 * check. 500 dari /system_stats bukan indikasi offline — server bisa saja hidup
 * tapi internal error. Cukup lempar error kalau server benar-benar tidak merespons.
 */
export async function checkComfyHealth(opts) {
  const online = await checkComfyStatus()
  if (!online) {
    throw new Error(
      `ComfyUI tidak merespons. Pastikan server berjalan & dapat diakses dari browser.`
    )
  }
  // Side effect: isi checkpoints supaya UI dropdown ter-update
  const list = await _safeFetchCheckpoints()
  return { online: true, checkpoints: list }
}

async function _safeFetchCheckpoints() {
  try {
    return await fetchCheckpoints()
  } catch {
    return []
  }
}

/**
 * Factory: buat reactive health state per provider.
 *
 * Mutasi `target[key]` langsung (target harus reactive). Tidak perlu subscribe
 * ke ref — caller baca `target.status` dll langsung di template.
 *
 * Usage:
 *   const ollama = reactive({ status:'idle', error:null, latency:0, lastCheck:0 })
 *   const tracker = createHealthTracker(ollama, () => getBaseUrl(), () => getApiKey(), healthFn)
 *   tracker.start()
 *   tracker.stop()
 *   tracker.checkNow()
 */
export function createHealthTracker(target, getBaseUrl, getApiKey, healthFn) {
  let timer = null
  let stopped = false
  let consecutiveFails = 0
  let inFlight = null // Promise dari _runCheck yang sedang berjalan

  async function _runCheck() {
    if (stopped) return
    target.status = 'checking'
    target.error = null
    const start = performance.now()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), DEFAULT_HEALTH_TIMEOUT)
    try {
      await healthFn({
        baseUrl: getBaseUrl(),
        apiKey: getApiKey?.() || '',
        signal: controller.signal
      })
      target.latency = Math.round(performance.now() - start)
      target.status = 'online'
      target.error = null
      consecutiveFails = 0
      _scheduleNext(MIN_RETRY_INTERVAL)
    } catch (e) {
      const msg = e?.message || String(e)
      target.error = e?.name === 'AbortError' ? `Timeout setelah ${DEFAULT_HEALTH_TIMEOUT}ms` : msg
      target.status = 'offline'
      target.latency = 0
      consecutiveFails += 1
      const nextMs = Math.min(
        MAX_RETRY_INTERVAL,
        MIN_RETRY_INTERVAL * Math.pow(2, Math.min(consecutiveFails - 1, 4))
      )
      _scheduleNext(nextMs)
    } finally {
      clearTimeout(timeout)
      target.lastCheck = Date.now()
      inFlight = null
    }
  }

  function _scheduleNext(ms) {
    if (stopped) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      inFlight = _runCheck()
    }, ms)
  }

  function start() {
    stopped = false
    // Cegah double-start kalau _runCheck masih jalan
    if (inFlight) return
    inFlight = _runCheck()
  }

  function stop() {
    stopped = true
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  async function checkNow() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    // Kalau ada check yang sedang jalan, tunggu selesai dulu — tapi tetap
    // trigger check baru setelahnya supaya status paling baru yang menang.
    if (inFlight) {
      try { await inFlight } catch { /* abaikan, kita akan run ulang */ }
    }
    if (stopped) return
    inFlight = _runCheck()
    return inFlight
  }

  return { start, stop, checkNow }
}
