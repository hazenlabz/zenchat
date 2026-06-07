<template>
  <div class="app">
    <aside class="sidebar">
      <div class="sidebar-header">
        <span class="logo"><AppIcon class="logo-icon" style="width: 24px; height: 24px;" /> Hazen AI Chat</span>
        <button class="btn-new-icon" @click="store.newConversation()" title="Chat Baru">+</button>
      </div>

      <!-- Provider switcher -->
      <div class="section">
        <label class="section-label">
          Provider
          <span
            class="status-dot"
            :class="providerHealthStatus"
            :title="providerHealthTooltip"
          ></span>
        </label>
        <select
          :value="selectedProvider"
          @change="handleProviderChange"
          class="select"
        >
          <option v-for="p in availableProviders" :key="p.id" :value="p.id">
            {{ p.name }}
          </option>
        </select>
        <button class="btn-settings" @click="showSettings = true" title="Settings provider">
          ⚙ Settings
        </button>
        <div v-if="activeProviderHealth.status === 'offline'" class="offline-hint">
          Offline — auto-retry aktif
          <button class="btn-retry-small" @click="retryActiveProvider">Coba lagi</button>
        </div>
      </div>

      <!-- Model selector (per provider) -->
      <div class="section">
        <label class="section-label">Model</label>
        <div v-if="models.length === 0 && activeProviderHealth.status !== 'offline' && !error" class="loading-text">
          Memuat...
        </div>
        <div v-else-if="models.length === 0 && activeProviderHealth.status === 'offline'" class="loading-text">
          Menunggu provider online...
        </div>
        <select v-else v-model="selectedModel" class="select">
          <option v-for="m in models" :key="m.id" :value="m.id">
            {{ m.name }}
          </option>
        </select>
      </div>

      <!-- ComfyUI -->
      <div class="section">
        <label class="section-label">
          ComfyUI
          <span
            class="status-dot"
            :class="health.comfy.status === 'online' ? 'on' : (health.comfy.status === 'offline' ? 'off' : 'checking')"
            :title="comfyHealthTooltip"
          ></span>
        </label>
        <div v-if="health.comfy.status === 'offline'" class="offline-hint">
          Offline — /imagine tidak tersedia
          <button class="btn-retry-small" @click="store.recheckComfy()">Coba lagi</button>
        </div>
        <template v-else-if="health.comfy.status === 'online'">
          <select v-model="selectedCheckpoint" class="select">
            <option v-for="c in checkpoints" :key="c" :value="c">{{ c }}</option>
          </select>
        </template>
        <div v-else class="loading-text">Memeriksa...</div>
      </div>

      <!-- Conversation list -->
      <div class="section conv-section">
        <label class="section-label">Riwayat</label>
        <div v-if="sortedConversations.length === 0" class="empty-conv">Belum ada chat</div>
        <ul class="conv-list">
          <li
            v-for="conv in sortedConversations"
            :key="conv.id"
            class="conv-item"
            :class="{ active: conv.id === activeId }"
            @click="store.selectConversation(conv.id)"
          >
            <span class="conv-title">{{ conv.title }}</span>
            <button class="btn-delete" @click.stop="store.deleteConversation(conv.id)">×</button>
          </li>
        </ul>
      </div>

      <div class="sidebar-footer">
        <div class="status-row">
          <span
            v-for="p in availableProviders"
            :key="'h-' + p.id"
            class="status"
            :class="healthClass(p.id)"
            :title="healthTooltip(p.id)"
          >
            {{ healthSymbol(p.id) }} {{ p.name }}
          </span>
        </div>
      </div>
    </aside>

    <main class="main">
      <div v-if="error" class="error-banner">
        <span class="error-msg">⚠ {{ error }}</span>
        <button class="error-dismiss" @click="dismissError" title="Dismiss">×</button>
        <button class="error-retry" @click="retryActiveProvider" :disabled="activeProviderHealth.status === 'checking'">
          {{ activeProviderHealth.status === 'checking' ? 'Memeriksa...' : 'Coba lagi' }}
        </button>
      </div>
      <div v-if="!activeId" class="no-conv">
        <div class="no-conv-icon">◎</div>
        <p>Klik <strong>+</strong> untuk mulai chat baru</p>
        <p class="no-conv-hint" v-if="health.comfy.status === 'online'">💡 Ketik <code>/imagine</code> untuk generate gambar</p>
      </div>
      <template v-else>
        <ChatWindow />
        <InputBar />
      </template>
    </main>

    <!-- Settings modal -->
    <SettingsModal v-if="showSettings" @close="showSettings = false" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useChatStore } from '@/stores/chat'
import ChatWindow from '@/components/ChatWindow.vue'
import InputBar from '@/components/InputBar.vue'
import AppIcon from '@/components/AppIcon.vue'
import SettingsModal from '@/components/SettingsModal.vue'

const store = useChatStore()
const {
  models, selectedModel, error,
  sortedConversations, activeId,
  checkpoints, selectedCheckpoint,
  selectedProvider, availableProviders, activeProviderDef,
  health
} = storeToRefs(store)

const showSettings = ref(false)

function handleProviderChange(e) {
  store.setProvider(e.target.value)
}

/** Status provider yang sedang dipilih — untuk dot & tooltip di header */
const activeProviderHealth = computed(() => health.value[selectedProvider.value] || { status: 'idle', error: null, latency: 0 })
const providerHealthStatus = computed(() => {
  const s = activeProviderHealth.value.status
  if (s === 'online') return 'on'
  if (s === 'offline') return 'off'
  if (s === 'checking') return 'checking'
  return 'idle'
})
const providerHealthTooltip = computed(() => {
  const h = activeProviderHealth.value
  if (h.status === 'online') return `Online (${h.latency}ms)`
  if (h.status === 'offline') return `Offline: ${h.error || 'tidak diketahui'}`
  if (h.status === 'checking') return 'Memeriksa koneksi...'
  return 'Belum diperiksa'
})
const comfyHealthTooltip = computed(() => {
  const h = health.value.comfy
  if (h.status === 'online') return `Online (${h.latency}ms)`
  if (h.status === 'offline') return `Offline: ${h.error || 'tidak diketahui'}`
  if (h.status === 'checking') return 'Memeriksa koneksi...'
  return 'Belum diperiksa'
})

/** Helpers untuk status footer (semua provider) */
function healthClass(providerId) {
  const s = health.value[providerId]?.status
  if (s === 'online') return 'ok'
  if (s === 'offline') return 'err'
  if (s === 'checking') return 'pending'
  return ''
}
function healthSymbol(providerId) {
  const s = health.value[providerId]?.status
  if (s === 'online') return '✓'
  if (s === 'offline') return '✗'
  if (s === 'checking') return '⋯'
  return '·'
}
function healthTooltip(providerId) {
  const h = health.value[providerId]
  if (!h) return ''
  if (h.status === 'online') return `${providerId}: online (${h.latency}ms)`
  if (h.status === 'offline') return `${providerId}: offline — ${h.error || 'unknown'}`
  if (h.status === 'checking') return `${providerId}: memeriksa...`
  return `${providerId}: idle`
}

async function retryActiveProvider() {
  await store.recheckProvider(selectedProvider.value)
}

function dismissError() {
  error.value = null
}

onMounted(async () => {
  store.init()
  // init() sudah start health checks di background. Tunggu hasil pertama
  // untuk active provider supaya model list cepat muncul (kalau online).
  await store.recheckProvider(selectedProvider.value)
  await store.loadComfyStatus()
})
</script>

<style>
:root {
  --bg: #0f0f0f; --surface: #161616; --surface2: #1e1e1e;
  --border: #2a2a2a; --text: #e8e8e8; --text-muted: #666;
  --accent: #e8e8e8; --danger: #e05252;
  --font: 'DM Sans', 'Segoe UI', sans-serif;
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: var(--font); background: var(--bg); color: var(--text); height: 100vh; overflow: hidden; }
#app { height: 100vh; }
</style>

<style scoped>
.app { display: flex; height: 100vh; }

.sidebar {
  width: 220px; background: var(--surface);
  border-right: 1px solid var(--border);
  display: flex; flex-direction: column;
  padding: 16px; gap: 16px;
  flex-shrink: 0; overflow: hidden;
}

.sidebar-header {
  display: flex; align-items: center; justify-content: space-between;
  padding-bottom: 12px; border-bottom: 1px solid var(--border);
}
.logo { font-size: 1rem; font-weight: 600; letter-spacing: 0.04em; display: flex; align-items: center; gap: 8px; }
.logo-icon { flex-shrink: 0; }

.btn-new-icon {
  width: 24px; height: 24px;
  background: var(--surface2); border: 1px solid var(--border);
  color: var(--text-muted); border-radius: 6px; cursor: pointer;
  font-size: 16px; display: flex; align-items: center; justify-content: center;
  transition: all 0.15s;
}
.btn-new-icon:hover { color: var(--text); border-color: var(--text-muted); }

.section { display: flex; flex-direction: column; gap: 8px; }
.section-label {
  font-size: 0.7rem; text-transform: uppercase;
  letter-spacing: 0.1em; color: var(--text-muted);
  display: flex; align-items: center; gap: 6px;
}

.status-dot {
  width: 6px; height: 6px;
  border-radius: 50%; flex-shrink: 0;
}
.status-dot.on { background: #5cba72; }
.status-dot.off { background: #555; }
.status-dot.checking { background: #d4a951; animation: pulse 1.4s ease-in-out infinite; }
.status-dot.idle { background: #444; }
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}

.offline-hint { font-size: 0.75rem; color: var(--text-muted); font-style: italic; }

.select {
  background: var(--surface2); border: 1px solid var(--border);
  color: var(--text); border-radius: 8px; padding: 8px 10px;
  font-size: 0.85rem; cursor: pointer; outline: none;
  transition: border-color 0.2s;
}
.select:focus { border-color: var(--accent); }

.btn-settings {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-muted);
  border-radius: 6px;
  padding: 5px 10px;
  font-size: 0.72rem;
  cursor: pointer;
  text-align: left;
  transition: all 0.15s;
}
.btn-settings:hover {
  color: var(--text);
  border-color: var(--text-muted);
  background: var(--surface2);
}

.conv-section { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
.empty-conv { font-size: 0.8rem; color: var(--text-muted); font-style: italic; }
.conv-list {
  list-style: none; display: flex; flex-direction: column;
  gap: 2px; overflow-y: auto; flex: 1;
}
.conv-list::-webkit-scrollbar { width: 3px; }
.conv-list::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

.conv-item {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 10px; border-radius: 8px;
  cursor: pointer; transition: background 0.15s;
  border: 1px solid transparent;
}
.conv-item:hover { background: var(--surface2); }
.conv-item.active { background: var(--surface2); border-color: var(--border); }

.conv-title {
  flex: 1; font-size: 0.82rem; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis;
}
.btn-delete {
  background: none; border: none; color: var(--text-muted);
  cursor: pointer; font-size: 14px; padding: 0 2px;
  opacity: 0; transition: all 0.15s; flex-shrink: 0;
}
.conv-item:hover .btn-delete { opacity: 1; }
.btn-delete:hover { color: var(--danger); }

.loading-text { font-size: 0.8rem; color: var(--text-muted); font-style: italic; }

.sidebar-footer { margin-top: auto; }
.status-row { display: flex; gap: 6px; flex-wrap: wrap; }
.status { font-size: 0.75rem; padding: 4px 8px; border-radius: 4px; background: var(--surface2); }
.status.ok { color: #5cba72; }
.status.err { color: var(--danger); }
.status.pending { color: #d4a951; }

.main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

.error-banner {
  background: rgba(224,82,82,0.1); border-bottom: 1px solid rgba(224,82,82,0.3);
  color: var(--danger); padding: 10px 20px; font-size: 0.85rem;
  display: flex; align-items: center; gap: 10px;
}
.error-msg { flex: 1; }
.error-dismiss, .error-retry {
  background: rgba(224,82,82,0.15); border: 1px solid rgba(224,82,82,0.4);
  color: var(--danger); border-radius: 4px; cursor: pointer;
  padding: 3px 10px; font-size: 0.78rem; font-family: inherit;
  transition: all 0.15s;
}
.error-dismiss:hover, .error-retry:hover:not(:disabled) {
  background: rgba(224,82,82,0.3);
}
.error-dismiss { padding: 3px 8px; }
.error-retry:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-retry-small {
  background: transparent; border: 1px solid var(--border);
  color: var(--text-muted); border-radius: 4px; cursor: pointer;
  padding: 2px 8px; font-size: 0.7rem; font-family: inherit;
  margin-left: 6px; transition: all 0.15s;
}
.btn-retry-small:hover {
  color: var(--text); border-color: var(--text-muted);
}

.no-conv {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 12px; color: var(--text-muted);
}
.no-conv-icon { font-size: 2.5rem; opacity: 0.2; }
.no-conv p { font-size: 0.9rem; }
.no-conv strong { color: var(--text); }
.no-conv-hint { font-size: 0.82rem; }
.no-conv-hint code {
  background: var(--surface2); padding: 1px 6px;
  border-radius: 4px; font-family: monospace;
}
</style>
