/**
 * BaseProvider — interface yang harus diimplementasi setiap provider.
 *
 * Setiap provider (Ollama, OpenAI-compatible, dst) harus meng-extend class ini
 * dan mengimplementasi fetchModels() + streamChat().
 *
 * Field wajib yang harus di-set di constructor subclass:
 *   - id          : string unik (misal 'ollama', 'openrouter')
 *   - name        : label untuk UI
 *   - requiresApiKey: boolean — kalau true, user harus input API key
 *   - supportsVision: boolean — apakah model support image input
 */
export class BaseProvider {
  constructor(config = {}) {
    this.id = ''
    this.name = ''
    this.requiresApiKey = false
    this.supportsVision = true
    this.baseUrl = ''
    this.apiKey = ''
  }

  /**
   * Ambil daftar model yang tersedia.
   * @returns {Promise<Array<{id: string, name: string}>>}
   */
  // eslint-disable-next-line no-unused-vars
  async fetchModels() {
    throw new Error(`fetchModels() belum diimplementasi untuk provider "${this.id}"`)
  }

  /**
   * Stream chat completion.
   * @param {object} opts
   * @param {string} opts.model — id model
   * @param {Array} opts.messages — history pesan (format unified, lihat transformMessages)
   * @param {string[]} [opts.images] — base64 image (untuk pesan user terakhir)
   * @param {AbortSignal} opts.signal
   * @param {(token: string) => void} opts.onChunk
   * @param {() => void} opts.onDone
   * @param {(usage: {prompt_tokens:number, completion_tokens:number}) => void} [opts.onUsage]
   */
  // eslint-disable-next-line no-unused-vars
  async streamChat(opts) {
    throw new Error(`streamChat() belum diimplementasi untuk provider "${this.id}"`)
  }

  /**
   * Format unified message ke format spesifik provider.
   * Override di subclass kalau format berbeda.
   * @param {Array<{role: string, content: string, images?: string[]}>} messages
   */
  transformMessages(messages) {
    return messages
  }

  /**
   * Lightweight health check — default implementasi: hit fetchModels().
   * Override di subclass untuk endpoint yang lebih ringan.
   * @param {AbortSignal} [signal] — untuk timeout
   * @returns {Promise<void>} — throw kalau offline
   */
  async checkHealth(signal) {
    await this.fetchModels({ signal })
  }

  /**
   * Cek apakah provider bisa dipakai (API key ada kalau required, base URL valid, dll).
   */
  isConfigured() {
    if (this.requiresApiKey && !this.apiKey) return false
    return Boolean(this.baseUrl)
  }
}
