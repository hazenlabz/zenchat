import { BaseProvider } from './base.js'

/**
 * Ollama provider — komunikasi native ke Ollama API.
 * Default: http://localhost:11434
 * Vision: supported (semua model multimodal Ollama).
 */
export class OllamaProvider extends BaseProvider {
  constructor(config = {}) {
    super(config)
    this.id = 'ollama'
    this.name = 'Ollama'
    this.requiresApiKey = false
    this.supportsVision = true
    this.baseUrl = config.baseUrl || import.meta.env.VITE_OLLAMA_BASE_URL || 'http://localhost:11434'
  }

  async fetchModels() {
    const res = await fetch(`${this.baseUrl}/api/tags`)
    if (!res.ok) throw new Error(`Ollama error: ${res.status} ${res.statusText}`)
    const data = await res.json()
    return (data.models || []).map((m) => ({
      id: m.name,
      name: m.name,
      size: m.size,
      details: m.details || {}
    }))
  }

  async streamChat({ model, messages, signal, onChunk, onDone }) {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        model,
        messages, // Ollama native format — sudah cocok (role/content/images)
        stream: true
      })
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Ollama error: ${err}`)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const text = decoder.decode(value)
      const lines = text.split('\n').filter(Boolean)

      for (const line of lines) {
        try {
          const json = JSON.parse(line)
          if (json.message?.content) onChunk(json.message.content)
          if (json.done) onDone()
        } catch {
          /* skip malformed line */
        }
      }
    }
  }
}
