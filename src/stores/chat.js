import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { streamChat, fetchModels } from '@/services/ollama'
import { generateImage, checkComfyStatus, fetchCheckpoints } from '@/services/comfy'
import { saveConversations, loadConversations, saveActiveId, loadActiveId } from '@/services/storage'
import { usePersona } from '@/composables/usePersona'

import mammoth from 'mammoth'
import * as pdfjsLib from 'pdfjs-dist'
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.mjs`

function createConversation(model = '', systemPrompt = '') {
  return {
    id: `conv_${Date.now()}`,
    title: 'Chat Baru',
    model,
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
  const models = ref([])
  const selectedModel = ref(import.meta.env.VITE_OLLAMA_DEFAULT_MODEL || '')
  const isStreaming = ref(false)
  const error = ref(null)
  const commandFeedback = ref(null)

  // ComfyUI state
  const comfyOnline = ref(false)
  const checkpoints = ref([])
  const selectedCheckpoint = ref(import.meta.env.VITE_COMFY_CHECKPOINT || '')
  const isGenerating = ref(false)

  let abortController = null
  let comfyAbortController = null

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

  function init() {
    const saved = loadConversations()
    if (saved.length > 0) {
      conversations.value = saved
      const lastId = loadActiveId()
      const exists = saved.find((c) => c.id === lastId)
      activeId.value = exists ? lastId : saved[0].id
    }
    if (activeConversation.value?.model) {
      selectedModel.value = activeConversation.value.model
    }
  }

  async function loadModels() {
    try {
      models.value = await fetchModels()
      if (!models.value.includes(selectedModel.value) && models.value.length > 0) {
        selectedModel.value = models.value[0]
      }
    } catch {
      error.value = 'Tidak bisa terhubung ke Ollama. Pastikan Ollama sedang berjalan.'
    }
  }

  async function loadComfyStatus() {
    comfyOnline.value = await checkComfyStatus()
    if (comfyOnline.value) {
      const list = await fetchCheckpoints()
      checkpoints.value = list
      if (!selectedCheckpoint.value && list.length > 0) {
        selectedCheckpoint.value = list[0]
      }
    }
  }

  function newConversation() {
    const conv = createConversation(selectedModel.value)
    conversations.value.push(conv)
    activeId.value = conv.id
    error.value = null
    commandFeedback.value = null
  }

  function selectConversation(id) {
    activeId.value = id
    error.value = null
    commandFeedback.value = null
    if (activeConversation.value?.model) {
      selectedModel.value = activeConversation.value.model
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
  async function sendMessage(content, files = []) {
    if ((!content.trim() && files.length === 0) || isStreaming.value || isGenerating.value) return
    if (await handleCommand(content)) return

    error.value = null
    commandFeedback.value = null

    if (!activeId.value) newConversation()

    const conv = activeConversation.value
    if (!conv) return

    if (conv.messages.length === 0) {
      conv.title = generateTitle(content || 'File attachment')
    }
    
    conv.model = selectedModel.value
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
      return
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

    try {
      await streamChat({
        model: selectedModel.value,
        messages: history,
        signal: abortController.signal,
        onChunk: (token) => {
          const msg = conv.messages.find((m) => m.id === assistantId)
          if (msg) { msg.content += token; msg.loading = false }
          conv.updatedAt = Date.now()
        },
        onDone: () => { isStreaming.value = false }
      })
    } catch (e) {
      if (e.name !== 'AbortError') {
        error.value = e.message
        conv.messages = conv.messages.filter((m) => m.id !== assistantId)
      }
      isStreaming.value = false
    }
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
        const strings = content.items.map(item => item.str)
        fullText += strings.join(' ') + '\n'
      }
      return fullText
    } catch (err) {
      console.error('Failed to parse PDF', err)
      return ''
    }
  }

  // Helper: Read Docx as text
  async function extractDocx(file) {
    try {
      const arrayBuffer = await file.arrayBuffer()
      const result = await mammoth.extractRawText({ arrayBuffer })
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
    init, loadModels, loadComfyStatus,
    newConversation, selectConversation, deleteConversation,
    sendMessage, stopStreaming, stopGenerating, clearCommandFeedback,
  }
})
