import { BaseProvider } from './base.js'

/**
 * Build pesan network error yang konsisten untuk OpenAI-compatible provider.
 * Dipakai di fetchModels & checkHealth supaya tidak duplikasi string.
 */
function _networkErrorMsg(provider) {
  return `Tidak bisa terhubung ke ${provider.name} di ${provider.baseUrl}. Pastikan server berjalan & CORS diaktifkan.`
}

/**
 * OpenAI-compatible provider.
 *
 * Bisa dipakai untuk:
 *   - OpenRouter (https://openrouter.ai/api/v1)
 *   - LM Studio (http://localhost:1234/v1)
 *   - LocalAI, llama.cpp server, vLLM, dsb.
 *   - Custom router/proxy lokal (misal :20128)
 *
 * Format request: OpenAI Chat Completions API.
 * Stream format: SSE "data: {json}" dipisah newline.
 */
export class OpenAICompatibleProvider extends BaseProvider {
  constructor(config = {}) {
    super(config)
    this.id = config.id || 'openai-compatible'
    this.name = config.name || 'OpenAI Compatible'
    // API key opsional — server lokal biasanya tidak butuh
    this.requiresApiKey = Boolean(config.requiresApiKey)
    this.supportsVision = config.supportsVision !== false
    this.baseUrl = (config.baseUrl || '').replace(/\/+$/, '') // strip trailing slash
    this.apiKey = config.apiKey || ''
    this.defaultModel = config.defaultModel || ''
  }

  /**
   * Beberapa server OpenAI-compatible pakai path beda:
   *   - OpenRouter, OpenAI, LM Studio, llama.cpp: /chat/completions, /models
   *   - Beberapa router custom: /v1/chat/completions (kalau baseUrl tidak include /v1)
   * Kita coba path standar dulu, fallback ke /v1 kalau perlu.
   */
  _endpoint(path) {
    // Kalau baseUrl sudah diakhiri /v1, jangan double
    if (this.baseUrl.endsWith('/v1')) {
      return `${this.baseUrl}${path}`
    }
    return `${this.baseUrl}/v1${path}`
  }

  async fetchModels(opts = {}) {
    try {
      const res = await fetch(this._endpoint('/models'), {
        headers: this._authHeaders(),
        signal: opts.signal
      })
      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        throw new Error(`HTTP ${res.status} ${res.statusText}${errText ? ': ' + errText.slice(0, 200) : ''}`)
      }
      const data = await res.json()
      return (data.data || []).map((m) => ({
        id: m.id,
        name: m.name || m.id,
        // Beberapa server (OpenRouter) kasih context length
        context: m.context_length || m.top_provider?.max_context_length || null,
        raw: m
      }))
    } catch (e) {
      if (e.name === 'AbortError') throw e
      if (e.message?.includes('Failed to fetch') || e.message?.includes('NetworkError')) {
        throw new Error(_networkErrorMsg(this))
      }
      // Auth error 401/403 — kasih pesan khusus
      if (/HTTP 401|HTTP 403/.test(e.message)) {
        throw new Error(`API key tidak valid untuk ${this.name}. Cek di Settings.`)
      }
      // Not found 404 — base URL salah
      if (/HTTP 404/.test(e.message)) {
        throw new Error(`Endpoint tidak ditemukan. Cek base URL ${this.name} di Settings.`)
      }
      throw e
    }
  }

  /**
   * Health check — pakai endpoint /models. Kalau 401/403 tetap "online" (server up)
   * karena artinya server hidup tapi auth yang salah.
   */
  async checkHealth(signal) {
    try {
      const res = await fetch(this._endpoint('/models'), {
        headers: this._authHeaders(),
        signal
      })
      // 2xx = online, 401/403 = server hidup tapi auth salah, lain = offline
      if (res.ok || res.status === 401 || res.status === 403) {
        return
      }
      throw new Error(`HTTP ${res.status}`)
    } catch (e) {
      if (e.name === 'AbortError') throw e
      if (e.message?.includes('Failed to fetch') || e.message?.includes('NetworkError')) {
        throw new Error(_networkErrorMsg(this))
      }
      throw e
    }
  }

  _authHeaders() {
    const headers = { 'Content-Type': 'application/json' }
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`
    }
    return headers
  }

  /**
   * Transform unified messages ke format OpenAI Chat Completions.
   * Unified format: { role, content, images?: [base64, ...] }
   * OpenAI format: content bisa string atau array of content parts.
   * Untuk pesan dengan images, kita convert ke multipart content.
   */
  transformMessages(messages) {
    return messages.map((m) => {
      const msg = { role: m.role, content: m.content || '' }
      if (m.images && m.images.length > 0) {
        msg.content = [
          { type: 'text', text: m.content || '' },
          ...m.images.map((b64) => ({
            type: 'image_url',
            image_url: { url: `data:image/png;base64,${b64}` }
          }))
        ]
      }
      return msg
    })
  }

  async streamChat({ model, messages, signal, onChunk, onDone, onUsage }) {
    let res
    try {
      res = await fetch(this._endpoint('/chat/completions'), {
        method: 'POST',
        headers: this._authHeaders(),
        signal,
        body: JSON.stringify({
          model,
          messages: this.transformMessages(messages),
          stream: true,
          // Minta usage di akhir stream (OpenRouter support, server lain mungkin ignore)
          ...(onUsage ? { stream_options: { include_usage: true } } : {})
        })
      })
    } catch (e) {
      if (e.name === 'AbortError') throw e
      if (e.message?.includes('Failed to fetch') || e.message?.includes('NetworkError')) {
        throw new Error(_networkErrorMsg(this))
      }
      throw e
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      const snippet = errText ? `: ${errText.slice(0, 300)}` : ''
      if (res.status === 401 || res.status === 403) {
        throw new Error(`API key tidak valid untuk ${this.name}. Cek di Settings.`)
      }
      if (res.status === 404) {
        throw new Error(`Model "${model}" tidak ditemukan di ${this.name}, atau base URL salah.`)
      }
      if (res.status === 429) {
        throw new Error(`Rate limit ${this.name} tercapai. Tunggu sebentar lalu coba lagi.`)
      }
      if (res.status >= 500) {
        throw new Error(`${this.name} server error (${res.status}). Coba lagi nanti.${snippet}`)
      }
      throw new Error(`${this.name} error (${res.status})${snippet}`)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // simpan sisa yang belum lengkap

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        if (!trimmed.startsWith('data:')) continue

        const payload = trimmed.slice(5).trim()
        if (payload === '[DONE]') {
          onDone()
          continue
        }

        try {
          const json = JSON.parse(payload)
          const delta = json.choices?.[0]?.delta?.content
          if (delta) onChunk(delta)

          // OpenRouter kasih usage di chunk terakhir (kalau stream_options aktif)
          if (json.usage && onUsage) {
            onUsage({
              prompt_tokens: json.usage.prompt_tokens,
              completion_tokens: json.usage.completion_tokens,
              total_tokens: json.usage.total_tokens
            })
          }
        } catch {
          /* skip malformed */
        }
      }
    }
  }
}
