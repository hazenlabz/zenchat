/**
 * ollama.js — semua komunikasi ke Ollama API ada di sini.
 * Kalau suatu saat ganti provider (OpenAI, dll), cukup ubah file ini.
 */

const BASE_URL = import.meta.env.VITE_OLLAMA_BASE_URL || 'http://localhost:11434'

/**
 * Ambil semua model yang terinstall di Ollama
 * @returns {Promise<string[]>} list nama model
 */
export async function fetchModels() {
  const res = await fetch(`${BASE_URL}/api/tags`)
  if (!res.ok) throw new Error('Gagal mengambil daftar model')
  const data = await res.json()
  return data.models.map((m) => m.name)
}

/**
 * Kirim chat ke Ollama dengan streaming
 * @param {string} model - nama model
 * @param {Array<{role: string, content: string}>} messages - history percakapan
 * @param {function} onChunk - callback dipanggil setiap token masuk (string)
 * @param {function} onDone - callback dipanggil saat selesai
 * @param {AbortSignal} signal - untuk cancel request
 */
export async function streamChat({ model, messages, onChunk, onDone, signal }) {
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      model,
      messages,
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
        if (json.message?.content) {
          onChunk(json.message.content)
        }
        if (json.done) {
          onDone()
        }
      } catch {
        // skip malformed line
      }
    }
  }
}
