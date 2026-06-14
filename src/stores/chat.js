import { defineStore } from 'pinia'
import { ref, reactive, computed, watch, onScopeDispose } from 'vue'
import { generateImage, checkComfyStatus, fetchCheckpoints } from '@/services/comfy'
import {
  saveConversations, loadConversations, saveActiveId, loadActiveId,
  loadSelectedProvider, saveSelectedProvider,
  loadProviderConfig, saveProviderConfig,
  loadSelectedModels, saveSelectedModels
} from '@/services/storage'
import { createProvider, PROVIDERS, DEFAULT_PROVIDER_ID } from '@/services/providerRegistry'
import { checkProviderHealth, createHealthTracker, checkComfyHealth } from '@/utils/providerHealth'
import { usePersona } from '@/composables/usePersona'

import mammoth from 'mammoth'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url'
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

function createConversation(model = '', systemPrompt = '', providerId = '') {
  return {
    id: `conv_${Date.now()}`,
    title: 'Chat Baru',
    model,
    providerId,
    systemPrompt,
    personaId: null,
    personaName: null,
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

function generateTitle(content) {
  const trimmed = content.trim().replace(/\n+/g, ' ')
  return trimmed.length > 40 ? trimmed.slice(0, 40) + '…' : trimmed
}

export const useChatStore = defineStore('chat', () => {
  const { findPersona } = usePersona()

  const conversations = ref([])
  const activeId = ref(null)

  // Provider state
  const selectedProvider = ref(loadSelectedProvider() || DEFAULT_PROVIDER_ID)
  const providerConfig = ref(loadProviderConfig()) // { [providerId]: { apiKey, baseUrl } }
  const selectedModels = ref(loadSelectedModels()) // { [providerId]: modelId }
  const models = ref([]) // list {id, name, ...} untuk provider aktif
  // selectedModel yang lama masih di-expose sebagai computed, = selectedModels[selectedProvider]
  const isStreaming = ref(false)
  const error = ref(null)
  const commandFeedback = ref(null)

  // ComfyUI state
  const comfyOnline = ref(false)
  const checkpoints = ref([])
  const selectedCheckpoint = ref(import.meta.env.VITE_COMFY_CHECKPOINT || '')
  const isGenerating = ref(false)

  // ── Health state (reaktif, di-update oleh tracker di background) ──
  // Setiap provider punya { status, error, latency, lastCheck }.
  // status: 'idle' | 'checking' | 'online' | 'offline'
  const health = reactive({
    ollama: { status: 'idle', error: null, latency: 0, lastCheck: 0 },
    '9router': { status: 'idle', error: null, latency: 0, lastCheck: 0 },
    openrouter: { status: 'idle', error: null, latency: 0, lastCheck: 0 },
    comfy: { status: 'idle', error: null, latency: 0, lastCheck: 0 }
  })

  // Tracker instances (markRaw — bukan data reaktif, ini stateful object dengan timers)
  const trackers = new Map()
  const comfyBaseUrl = import.meta.env.VITE_COMFY_BASE_URL || 'http://127.0.0.1:8188'

  /**
   * Build/get tracker untuk sebuah provider. Tracker cuma dibuat sekali.
   * Tracker baca config via getter, jadi update config akan ke-reflect otomatis
   * di check berikutnya.
   */
  function _getOrCreateTracker(providerId) {
    if (trackers.has(providerId)) return trackers.get(providerId)

    let tracker
    if (providerId === 'comfy') {
      tracker = createHealthTracker(
        health.comfy,
        () => comfyBaseUrl,
        () => '',
        (opts) => checkComfyHealth(opts)
      )
    } else {
      tracker = createHealthTracker(
        health[providerId],
        () => {
          const cfg = providerConfig.value[providerId] || {}
          return cfg.baseUrl || _envBaseUrl(providerId)
        },
        () => {
          const cfg = providerConfig.value[providerId] || {}
          return cfg.apiKey || _envApiKey(providerId)
        },
        (opts) => checkProviderHealth({ ...opts, providerId })
      )
    }
    trackers.set(providerId, tracker)
    return tracker
  }

  function _envBaseUrl(providerId) {
    if (providerId === 'ollama') return import.meta.env.VITE_OLLAMA_BASE_URL || 'http://localhost:11434'
    if (providerId === '9router') return import.meta.env.VITE_9ROUTER_BASE_URL || 'http://localhost:20128/v1'
    if (providerId === 'openrouter') return import.meta.env.VITE_OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1'
    return ''
  }
  function _envApiKey(providerId) {
    if (providerId === 'ollama') return ''
    if (providerId === '9router') return import.meta.env.VITE_9ROUTER_API_KEY || ''
    if (providerId === 'openrouter') return import.meta.env.VITE_OPENROUTER_API_KEY || ''
    return ''
  }

  function startHealthChecks() {
    // Buat tracker untuk semua provider + comfy
    PROVIDERS.forEach((p) => _getOrCreateTracker(p.id).start())
    _getOrCreateTracker('comfy').start()
  }

  function stopHealthChecks() {
    trackers.forEach((t) => t.stop())
  }

  /** Manual retry (dipanggil dari tombol "Coba lagi" di UI) */
  async function recheckProvider(providerId) {
    const t = trackers.get(providerId) || _getOrCreateTracker(providerId)
    await t.checkNow()
    // Kalau provider yang di-recheck adalah yang aktif, refresh model list juga
    if (providerId === selectedProvider.value) {
      await loadModels()
    }
  }

  async function recheckComfy() {
    await recheckProvider('comfy')
    // Sync comfyOnline + checkpoints dengan health state
    comfyOnline.value = health.comfy.status === 'online'
    if (comfyOnline.value && checkpoints.value.length === 0) {
      const list = await fetchCheckpoints()
      checkpoints.value = list
      if (!selectedCheckpoint.value && list.length > 0) {
        selectedCheckpoint.value = list[0]
      }
    }
  }

  // Cleanup saat scope di-dispose (misal: HMR, unmount, dsb)
  onScopeDispose(() => stopHealthChecks())

  // Watch config change → recheck provider yang berubah
  watch(providerConfig, (newCfg, oldCfg) => {
    if (!oldCfg) return
    Object.keys(newCfg).forEach((pid) => {
      const before = oldCfg[pid] || {}
      const after = newCfg[pid] || {}
      if (before.baseUrl !== after.baseUrl || before.apiKey !== after.apiKey) {
        const t = trackers.get(pid)
        if (t) t.checkNow()
      }
    })
  }, { deep: true })

  let abortController = null
  let comfyAbortController = null

  // Computed: model yang sedang dipilih untuk provider aktif
  const selectedModel = computed({
    get: () => selectedModels.value[selectedProvider.value] || '',
    set: (val) => {
      selectedModels.value = { ...selectedModels.value, [selectedProvider.value]: val }
      saveSelectedModels(selectedModels.value)
    }
  })

  // Computed: definisi provider aktif (untuk UI)
  const activeProviderDef = computed(() =>
    PROVIDERS.find((p) => p.id === selectedProvider.value) || PROVIDERS[0]
  )

  // Computed: daftar provider yang tersedia (untuk dropdown).
  // Dibungkus computed agar storeToRefs bisa expose ke component sebagai ref.
  // (storeToRefs tidak memproses plain value — hanya refs/reactive/computed.)
  const availableProviders = computed(() => PROVIDERS)

  const activeConversation = computed(() =>
    conversations.value.find((c) => c.id === activeId.value) || null
  )
  const messages = computed(() => activeConversation.value?.messages || [])
  const hasMessages = computed(() => messages.value.length > 0)
  const sortedConversations = computed(() =>
    [...conversations.value].sort((a, b) => b.updatedAt - a.updatedAt)
  )

  watch(conversations, (val) => saveConversations(val), { deep: true })
  watch(activeId, (val) => { if (val) saveActiveId(val) })
  watch(selectedProvider, (val) => saveSelectedProvider(val))
  watch(providerConfig, (val) => saveProviderConfig(val), { deep: true })

  function init() {
    const saved = loadConversations()
    if (saved.length > 0) {
      // Backward compat: conv lama tanpa providerId di-default ke ollama
      saved.forEach((c) => { if (!c.providerId) c.providerId = 'ollama' })
      conversations.value = saved
      const lastId = loadActiveId()
      const exists = saved.find((c) => c.id === lastId)
      activeId.value = exists ? lastId : saved[0].id
    }
    if (activeConversation.value?.model) {
      // Sinkronkan selectedModel ke model conversation yang aktif
      const cid = activeConversation.value.providerId || 'ollama'
      if (cid === selectedProvider.value) {
        selectedModels.value = {
          ...selectedModels.value,
          [selectedProvider.value]: activeConversation.value.model
        }
      }
    }
    // Health check awal saat startup — pengguna bisa reconnect manual via tombol.
    startHealthChecks()
  }

  /**
   * Ganti provider aktif. Otomatis load models dari provider baru.
   */
  async function setProvider(providerId) {
    if (!PROVIDERS.find((p) => p.id === providerId)) return
    if (selectedProvider.value === providerId) {
      // Re-load kalau sudah sama (misal: setelah update config)
      await loadModels()
      return
    }
    selectedProvider.value = providerId
    // Clear model list dulu, lalu load ulang
    models.value = []
    await loadModels()
  }

  /**
   * Update konfigurasi runtime untuk sebuah provider (apiKey, baseUrl).
   * Setelah update, model list di-reload.
   */
  async function setProviderConfig(providerId, partialConfig) {
    providerConfig.value = {
      ...providerConfig.value,
      [providerId]: { ...(providerConfig.value[providerId] || {}), ...partialConfig }
    }
    if (selectedProvider.value === providerId) {
      await loadModels()
    }
  }

  function getProviderConfig(providerId) {
    return providerConfig.value[providerId] || {}
  }

  async function loadModels() {
    try {
      const cfg = getProviderConfig(selectedProvider.value)
      const provider = createProvider(selectedProvider.value, cfg)
      const list = await provider.fetchModels()
      // Simpan raw list (object) bukan string lagi
      models.value = list
      const def = activeProviderDef.value
      const currentSel = selectedModel.value
      if (!currentSel || !list.find((m) => m.id === currentSel)) {
        if (list.length > 0) {
          // Prioritaskan default model dari env kalau ada di list
          const fallback = def.factory(cfg).defaultModel
          const found = list.find((m) => m.id === fallback)
          selectedModel.value = found ? found.id : list[0].id
        }
      }
      error.value = null
    } catch (e) {
      // Provider sudah kasih pesan yang user-friendly, tinggal prefix dengan nama
      const def = activeProviderDef.value
      const msg = e?.message || String(e)
      error.value = msg.startsWith(def.name) || msg.startsWith('Tidak bisa') || msg.startsWith('API key') || msg.startsWith('Endpoint')
        ? msg
        : `${def.name}: ${msg}`
      models.value = []
    }
  }

  async function loadComfyStatus() {
    // Delegate ke tracker — sync comfyOnline & checkpoints dari health state
    await recheckComfy()
  }

  function newConversation() {
    const conv = createConversation(selectedModel.value, '', selectedProvider.value)
    conversations.value.push(conv)
    activeId.value = conv.id
    error.value = null
    commandFeedback.value = null
  }

  function selectConversation(id) {
    activeId.value = id
    error.value = null
    commandFeedback.value = null
    const conv = activeConversation.value
    if (conv?.model) {
      // Kalau conversation ini pakai provider lain, switch ke provider itu
      const cid = conv.providerId || 'ollama'
      if (cid !== selectedProvider.value) {
        // setProvider() handle reload models
        setProvider(cid)
        // selectedModel di-update setelah models loaded
        if (selectedModels.value[cid] !== conv.model) {
          selectedModels.value = { ...selectedModels.value, [cid]: conv.model }
        }
      } else {
        selectedModel.value = conv.model
      }
    }
  }

  function deleteConversation(id) {
    conversations.value = conversations.value.filter((c) => c.id !== id)
    if (activeId.value === id) {
      activeId.value = conversations.value.length > 0
        ? sortedConversations.value[0].id
        : null
    }
  }

  // ── Command handler ──────────────────────────────────────────────
  async function handleCommand(input) {
    const trimmed = input.trim()

    // /imagine <prompt>
    const imagineMatch = trimmed.match(/^\/imagine\s+(.+)$/is)
    if (imagineMatch) {
      const prompt = imagineMatch[1].trim()
      await handleImagine(prompt)
      return true
    }

    // /persona <nama>
    const personaMatch = trimmed.match(/^\/persona\s+(.+)$/i)
    if (personaMatch) {
      const query = personaMatch[1].trim()
      const persona = findPersona(query)
      if (!persona) {
        commandFeedback.value = { type: 'error', text: `Persona "${query}" tidak ditemukan. Ketik /personas untuk melihat daftar.` }
        return true
      }
      if (!activeId.value) newConversation()
      const conv = activeConversation.value
      conv.systemPrompt = persona.system_prompt
      conv.personaId = persona.id
      conv.personaName = persona.name
      commandFeedback.value = { type: 'success', text: `✓ Persona "${persona.name}" diaktifkan.` }
      return true
    }

    if (trimmed.match(/^\/personas?$/i)) {
      commandFeedback.value = { type: 'list' }
      return true
    }

    if (trimmed === '/clear') {
      if (activeConversation.value) {
        activeConversation.value.systemPrompt = ''
        activeConversation.value.personaId = null
        activeConversation.value.personaName = null
        commandFeedback.value = { type: 'success', text: '✓ Persona dihapus dari chat ini.' }
      }
      return true
    }

    return false
  }

  // ── Generate image via ComfyUI ───────────────────────────────────
  async function handleImagine(prompt) {
    if (!comfyOnline.value) {
      commandFeedback.value = {
        type: 'error',
        text: '✗ ComfyUI tidak online. Pastikan ComfyUI berjalan di localhost:8188.'
      }
      return
    }

    if (!activeId.value) newConversation()
    const conv = activeConversation.value

    // Judul otomatis
    if (conv.messages.length === 0) conv.title = generateTitle(`/imagine ${prompt}`)

    // Pesan user
    conv.messages.push({ id: Date.now(), role: 'user', content: `/imagine ${prompt}` })

    // Placeholder generating
    const placeholderId = Date.now() + 1
    conv.messages.push({
      id: placeholderId,
      role: 'assistant',
      type: 'image',          // tipe khusus — bukan teks
      content: '',
      imageUrl: null,
      prompt,
      loading: true,
      loadingText: 'Memulai generate...'
    })

    isGenerating.value = true
    comfyAbortController = new AbortController()
    let dotCount = 0

    try {
      const urls = await generateImage({
        prompt,
        checkpoint: selectedCheckpoint.value,
        signal: comfyAbortController.signal,
        onProgress: () => {
          dotCount++
          const msg = conv.messages.find((m) => m.id === placeholderId)
          if (msg) msg.loadingText = `Generating${'.'.repeat((dotCount % 3) + 1)}`
        }
      })

      const msg = conv.messages.find((m) => m.id === placeholderId)
      if (msg) {
        msg.imageUrl = urls[0]
        msg.loading = false
      }
      conv.updatedAt = Date.now()
    } catch (e) {
      if (e.name !== 'AbortError') {
        const msg = conv.messages.find((m) => m.id === placeholderId)
        if (msg) {
          msg.loading = false
          msg.error = e.message
        }
      } else {
        conv.messages = conv.messages.filter((m) => m.id !== placeholderId)
      }
    } finally {
      isGenerating.value = false
    }
  }

  // ── Chat biasa ───────────────────────────────────────────────────
  // Return true jika pesan benar-benar terkirim, false jika di-skip (return awal).
  // Caller pakai ini untuk memutuskan apakah harus clear input atau tidak.
  async function sendMessage(content, files = []) {
    if ((!content.trim() && files.length === 0) || isStreaming.value || isGenerating.value) return false
    if (await handleCommand(content)) return true

    error.value = null
    commandFeedback.value = null

    if (!activeId.value) newConversation()

    const conv = activeConversation.value
    if (!conv) return false

    if (conv.messages.length === 0) {
      conv.title = generateTitle(content || 'File attachment')
    }
    
    conv.model = selectedModel.value
    conv.providerId = selectedProvider.value
    conv.updatedAt = Date.now()

    let finalContent = content || ''

    // Process files
    const processedImages = []
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        const base64 = await fileToBase64(file)
        // strip the data uri header, keep only the base64 part
        const b64Data = base64.includes(',') ? base64.split(',')[1] : base64
        processedImages.push(b64Data)
      } else if (file.name.endsWith('.pdf') || file.type === 'application/pdf') {
        // Render halaman PDF sebagai gambar biar grafik, diagram, simbol terbaca
        const pdfImages = await pdfToImages(file)
        if (pdfImages.length > 0) {
          processedImages.push(...pdfImages)
          // Tetap ekstrak teks sebagai pelengkap
          const text = await extractPDF(file)
          if (text) {
            finalContent += `\n\n--- Start of ${file.name} ---\n${text}\n--- End of ${file.name} ---\n`
          } else {
            finalContent += `\n\n[PDF: ${file.name} — ${pdfImages.length} halaman]\n`
          }
        } else {
          // Fallback: teks aja kalau render gambar gagal
          const text = await extractPDF(file)
          if (text) {
            finalContent += `\n\n--- Start of ${file.name} ---\n${text}\n--- End of ${file.name} ---\n`
          }
        }
      } else {
        // Try reading as text for common document types
        try {
          let text = ''
          if (file.name.endsWith('.pdf') || file.type === 'application/pdf') {
            text = await extractPDF(file)
          } else if (file.name.endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            text = await extractDocx(file)
          } else {
            // Fallback: normal text read
            text = await fileToText(file)
          }

          if (text) {
            finalContent += `\n\n--- Start of ${file.name} ---\n${text}\n--- End of ${file.name} ---\n`
          }
        } catch (err) {
          console.warn('Gagal membaca text dari file:', file.name)
        }
      }
    }
    
    finalContent = finalContent.trim()

    // Ollama API rejects empty messages. We must provide at least text or image.
    if (!finalContent && processedImages.length === 0) {
      error.value = 'Isi pesan tidak boleh kosong.'
      commandFeedback.value = { type: 'error', text: 'Gagal: File attachment tidak memiliki konten teks untuk dibaca atau model tidak support. Tulis pesan untuk mendampingi file.' }
      return false
    }

    conv.messages.push({ 
      id: Date.now(), 
      role: 'user', 
      content: finalContent,
      images: processedImages,
      attachments: files.map(f => ({ name: f.name, type: f.type, size: f.size }))
    })

    const assistantId = Date.now() + 1
    conv.messages.push({ id: assistantId, role: 'assistant', content: '', loading: true })

    isStreaming.value = true
    abortController = new AbortController()

    // Kembalikan true SETELAH user message committed — caller boleh clear input
    // walaupun streaming masih berjalan di background. Return final `true` di bawah
    // hanya relevan kalau tidak ada streaming (misal error tertentu).
    // Tapi untuk konsistensi, kita return true sekali di sini.
    const userMessageCommitted = true

    const history = []
    if (conv.systemPrompt) history.push({ role: 'system', content: conv.systemPrompt })
    
    conv.messages
      .filter((m) => !m.loading && m.type !== 'image')
      .forEach(({ role, content, images }) => {
        const msg = { role, content }
        if (images && images.length > 0) {
          msg.images = images
        }
        history.push(msg)
      })

    // Panggil provider aktif — bukan hardcoded Ollama
    const cfg = getProviderConfig(selectedProvider.value)
    const provider = createProvider(selectedProvider.value, cfg)

    try {
      await provider.streamChat({
        model: selectedModel.value,
        messages: history,
        signal: abortController.signal,
        onChunk: (token) => {
          const msg = conv.messages.find((m) => m.id === assistantId)
          if (msg) { msg.content += token; msg.loading = false }
          conv.updatedAt = Date.now()
        },
        onDone: () => { isStreaming.value = false },
        onUsage: (usage) => {
          // Simpan usage di message assistant untuk tracking (opsional)
          const msg = conv.messages.find((m) => m.id === assistantId)
          if (msg) msg.usage = usage
        }
      })
    } catch (e) {
      if (e.name !== 'AbortError') {
        error.value = e.message
        conv.messages = conv.messages.filter((m) => m.id !== assistantId)
      }
      isStreaming.value = false
    }
    return userMessageCommitted
  }

  function stopStreaming() {
    abortController?.abort()
    isStreaming.value = false
  }

  function stopGenerating() {
    comfyAbortController?.abort()
    isGenerating.value = false
  }

  function clearCommandFeedback() { commandFeedback.value = null }

  // Helper: Convert File to base64
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  // Helper: Read File as text
  function fileToText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsText(file)
    })
  }

  // Helper: Read PDF as text
  async function extractPDF(file) {
    try {
      const arrayBuffer = await file.arrayBuffer()
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer })
      const pdf = await loadingTask.promise

      let fullText = ''
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const content = await page.getTextContent()

        // Kalau halaman ini tidak punya teks (scanned PDF), return null
        if (!content.items.length) return null

        // Kelompokkan item berdasarkan baris (Y position) untuk menjaga urutan baca
        const lines = []
        let currentY = null
        let currentLine = []
        for (const item of content.items) {
          const y = Math.round(item.transform[5]) // posisi vertikal
          if (currentY === null) currentY = y
          if (Math.abs(y - currentY) > 2) {
            // Baris baru
            lines.push(currentLine.map(i => i.str).join(' '))
            currentLine = [item]
            currentY = y
          } else {
            currentLine.push(item)
          }
        }
        if (currentLine.length) lines.push(currentLine.map(i => i.str).join(' '))

        fullText += lines.join('\n') + '\n\n'
      }
      return fullText.trim()
    } catch (err) {
      console.error('Failed to parse PDF', err)
      return null
    }
  }

  /**
   * Render tiap halaman PDF sebagai gambar base64 (fallback untuk scanned PDF).
   * Returns array of base64 strings (tanpa header data URI).
   */
  async function pdfToImages(file) {
    try {
      const arrayBuffer = await file.arrayBuffer()
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer })
      const pdf = await loadingTask.promise

      const images = []
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const viewport = page.getViewport({ scale: 2 }) // 2x untuk kualitas baca
        canvas.width = viewport.width
        canvas.height = viewport.height

        await page.render({ canvasContext: ctx, viewport }).promise
        images.push(canvas.toDataURL('image/png').split(',')[1])
      }

      canvas.remove()
      return images
    } catch (err) {
      console.error('Failed to render PDF as images', err)
      return []
    }
  }

  // Helper: Read Docx as text
  async function extractDocx(file) {
    try {
      const arrayBuffer = await file.arrayBuffer()
      const result = await mammoth.convertToHtml({ arrayBuffer })
      return result.value
    } catch (err) {
      console.error('Failed to parse Docx', err)
      return ''
    }
  }

  return {
    conversations, activeId, activeConversation, messages,
    hasMessages, sortedConversations,
    models, selectedModel, isStreaming, error, commandFeedback,
    comfyOnline, checkpoints, selectedCheckpoint, isGenerating,
    // Provider state & actions
    selectedProvider, providerConfig, activeProviderDef, availableProviders,
    setProvider, setProviderConfig, getProviderConfig,
    init, loadModels, loadComfyStatus,
    newConversation, selectConversation, deleteConversation,
    sendMessage, stopStreaming, stopGenerating, clearCommandFeedback,
    // Health state & actions (auto-retry dengan exponential backoff)
    health, recheckProvider, recheckComfy,
  }
})
