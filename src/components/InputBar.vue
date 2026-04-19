<template>
  <div class="input-area">
    <!-- Command feedback banner -->
    <Transition name="fade">
      <div v-if="commandFeedback" class="cmd-feedback" :class="commandFeedback.type">
        <!-- Daftar persona -->
        <div v-if="commandFeedback.type === 'list'" class="persona-list-inline">
          <div class="cmd-title">Persona tersedia:</div>
          <div v-for="p in allPersonas" :key="p.id" class="persona-row">
            <code>/persona {{ p.id }}</code>
            <span>{{ p.name }} — {{ p.description }}</span>
          </div>
        </div>
        <!-- Pesan biasa -->
        <span v-else>{{ commandFeedback.text }}</span>
        <button class="btn-dismiss" @click="store.clearCommandFeedback()">×</button>
      </div>
    </Transition>

    <!-- Command suggestions saat ketik / -->
    <Transition name="fade">
      <div v-if="suggestions.length" class="suggestions">
        <div
          v-for="s in suggestions"
          :key="s.command"
          class="suggestion-item"
          @click="applySuggestion(s.command)"
        >
          <code>{{ s.command }}</code>
          <span>{{ s.desc }}</span>
        </div>
      </div>
    </Transition>

    <!-- File attachments preview -->
    <Transition name="fade">
      <div v-if="attachedFiles.length" class="file-attachments">
        <div v-for="(file, idx) in attachedFiles" :key="idx" class="file-tag">
          <span class="file-icon">{{ getFileIcon(file) }}</span>
          <span class="file-name">{{ file.name }}</span>
          <button class="btn-remove-file" @click="removeFile(idx)">×</button>
        </div>
      </div>
    </Transition>

    <div class="input-bar">
      <!-- Persona badge kalau aktif -->
      <div v-if="activePersonaName" class="persona-badge" @click="showManager = true">
        ◎ {{ activePersonaName }}
      </div>

      <!-- Upload button -->
      <button 
        class="btn-attach" 
        @click="triggerFileSelect" 
        title="Upload gambar atau dokumen"
        :disabled="isStreaming || isGenerating"
      >
        +
      </button>
      <input 
        ref="fileInput" 
        type="file" 
        multiple 
        accept="image/*,.pdf,.txt,.doc,.docx,.md" 
        style="display: none;" 
        @change="handleFileSelect"
      />

      <textarea
        ref="textareaRef"
        v-model="input"
        placeholder="Ketik pesan, paste gambar, atau upload file..."
        rows="1"
        @keydown.enter.exact.prevent="handleSend"
        @keydown.escape="store.clearCommandFeedback()"
        @input="autoResize"
        @paste="handlePaste"
      />
      <button v-if="isStreaming" class="btn-stop" @click="store.stopStreaming()">■</button>
      <button v-else-if="isGenerating" class="btn-stop" @click="store.stopGenerating()" title="Stop generate">■</button>
      <button v-else class="btn-send" :disabled="!canSend" @click="handleSend">↑</button>
    </div>
    <p class="hint">Enter kirim · Shift+Enter baris baru · Paste gambar langsung · <span class="cmd-hint" @click="showManager = true">Kelola Persona</span></p>

    <!-- Persona Manager Modal -->
    <PersonaManager v-if="showManager" @close="showManager = false" />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useChatStore } from '@/stores/chat'
import { usePersona } from '@/composables/usePersona'
import PersonaManager from './PersonaManager.vue'

const store = useChatStore()
const { isStreaming, isGenerating, commandFeedback, activeConversation } = storeToRefs(store)
const { allPersonas } = usePersona()

const input = ref('')
const textareaRef = ref(null)
const showManager = ref(false)
const fileInput = ref(null)
const attachedFiles = ref([])

const activePersonaName = computed(() => activeConversation.value?.personaName || null)

// Computed: can send message
const canSend = computed(() => {
  return (input.value.trim() || attachedFiles.value.length > 0) && !isStreaming.value && !isGenerating.value
})

// File handling
function triggerFileSelect() {
  fileInput.value?.click()
}

function handleFileSelect(event) {
  const files = Array.from(event.target.files || [])
  addFiles(files)
  // Reset input so same file can be selected again
  event.target.value = ''
}

function handlePaste(event) {
  const items = event.clipboardData?.items
  if (!items) return
  
  const files = []
  for (const item of items) {
    if (item.kind === 'file') {
      const file = item.getAsFile()
      if (file) files.push(file)
    }
  }
  
  if (files.length > 0) {
    event.preventDefault()
    addFiles(files)
  }
}

function getFileIcon(file) {
  if (file.type.startsWith('image/')) return '🖼️'
  if (file.type.includes('pdf')) return '📄'
  if (file.type.includes('word') || file.name.endsWith('.doc') || file.name.endsWith('.docx')) return '📝'
  return '📎'
}

function addFiles(files) {
  const maxFiles = 5
  const remaining = maxFiles - attachedFiles.value.length
  const filesToAdd = files.slice(0, remaining)
  
  if (files.length > remaining) {
    alert(`Maksimal ${maxFiles} file. Hanya ${remaining} file yang ditambahkan.`)
  }
  
  attachedFiles.value.push(...filesToAdd)
}

function removeFile(index) {
  attachedFiles.value.splice(index, 1)
}

// Command suggestions — muncul saat input diawali /
const COMMANDS = [
  { command: '/imagine', desc: 'Generate gambar via ComfyUI — /imagine <prompt>' },
  { command: '/persona', desc: 'Aktifkan persona — /persona <id atau nama>' },
  { command: '/personas', desc: 'Lihat semua persona tersedia' },
  { command: '/clear', desc: 'Hapus persona dari chat ini' },
]

const suggestions = computed(() => {
  const val = input.value
  if (!val.startsWith('/') || val.includes(' ')) return []
  return COMMANDS.filter((c) => c.command.startsWith(val.toLowerCase()))
})

function applySuggestion(command) {
  input.value = command + ' '
  textareaRef.value?.focus()
}

async function handleSend() {
  if (!canSend.value) return
  
  const textToSend = input.value.trim()
  const filesToSend = [...attachedFiles.value]
  
  // Reset input immediately
  input.value = ''
  attachedFiles.value = []
  resetHeight()
  
  // Send with attached files
  await store.sendMessage(textToSend, filesToSend)
}

function autoResize() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 160) + 'px'
}

function resetHeight() {
  setTimeout(() => {
    if (textareaRef.value) textareaRef.value.style.height = 'auto'
  }, 0)
}
</script>

<style scoped>
.input-area {
  padding: 8px 20px 16px;
  border-top: 1px solid var(--border);
  background: var(--bg);
  position: relative;
}

/* Command feedback */
.cmd-feedback {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 14px;
  border-radius: 8px;
  margin-bottom: 8px;
  font-size: 0.83rem;
  max-width: 760px;
  margin-left: auto;
  margin-right: auto;
}
.cmd-feedback.success { background: rgba(92, 186, 114, 0.1); color: #5cba72; }
.cmd-feedback.error { background: rgba(224, 82, 82, 0.1); color: var(--danger); }
.cmd-feedback.list { background: var(--surface2); color: var(--text); flex-direction: column; }

.cmd-title { font-weight: 600; margin-bottom: 6px; }
.persona-list-inline { display: flex; flex-direction: column; gap: 4px; width: 100%; }
.persona-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 0.8rem;
}
.persona-row code {
  font-family: monospace;
  color: #56a8f5;
  flex-shrink: 0;
  font-size: 0.8rem;
}
.persona-row span { color: var(--text-muted); }

.btn-dismiss {
  background: none; border: none;
  color: currentColor; opacity: 0.6;
  cursor: pointer; font-size: 16px;
  padding: 0; line-height: 1;
  flex-shrink: 0;
  align-self: flex-start;
}

/* Suggestions dropdown */
.suggestions {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-bottom: 8px;
  overflow: hidden;
  max-width: 760px;
  margin-left: auto;
  margin-right: auto;
}
.suggestion-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  cursor: pointer;
  transition: background 0.1s;
  font-size: 0.83rem;
}
.suggestion-item:hover { background: var(--surface2); }
.suggestion-item code { font-family: monospace; color: #56a8f5; }
.suggestion-item span { color: var(--text-muted); }

/* File attachments */
.file-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-width: 760px;
  margin: 0 auto 8px;
  padding: 0 4px;
}
.file-tag {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: 16px;
  font-size: 0.8rem;
  color: var(--text);
}
.file-icon { font-size: 1rem; }
.file-name {
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.btn-remove-file {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 14px;
  padding: 0 2px;
  line-height: 1;
  margin-left: 4px;
}
.btn-remove-file:hover { color: var(--danger); }

/* Upload button */
.btn-attach {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  background: var(--surface);
  color: var(--text-muted);
  cursor: pointer;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.15s;
}
.btn-attach:hover:not(:disabled) {
  background: var(--border);
  color: var(--text);
}
.btn-attach:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* Input bar */
.input-bar {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 8px 10px 8px 12px;
  max-width: 760px;
  margin: 0 auto;
  transition: border-color 0.2s;
  flex-wrap: wrap;
}
.input-bar:focus-within { border-color: var(--accent); }

.persona-badge {
  width: 100%;
  font-size: 0.72rem;
  color: #56a8f5;
  padding: 0 2px 4px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  letter-spacing: 0.02em;
}
.persona-badge:hover { opacity: 0.8; }

textarea {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  resize: none;
  color: var(--text);
  font-family: inherit;
  font-size: 0.92rem;
  line-height: 1.6;
  min-height: 24px;
  max-height: 160px;
}
textarea::placeholder { color: var(--text-muted); }

.btn-send, .btn-stop {
  width: 32px; height: 32px;
  border-radius: 8px; border: none;
  cursor: pointer; font-size: 14px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; transition: all 0.15s;
}
.btn-send { background: var(--accent); color: var(--bg); }
.btn-send:hover:not(:disabled) { opacity: 0.85; }
.btn-send:disabled { opacity: 0.3; cursor: not-allowed; }
.btn-stop { background: var(--danger); color: white; font-size: 10px; }

.hint {
  text-align: center;
  font-size: 0.72rem;
  color: var(--text-muted);
  margin-top: 6px;
  opacity: 0.6;
}
.cmd-hint {
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.cmd-hint:hover { opacity: 1; }

/* Transitions */
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s, transform 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(4px); }
</style>