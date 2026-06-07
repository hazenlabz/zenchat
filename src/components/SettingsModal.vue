<template>
  <div class="modal-backdrop" @click.self="$emit('close')">
    <div class="modal">
      <div class="modal-header">
        <h2>Provider Settings</h2>
        <button class="btn-close" @click="$emit('close')">×</button>
      </div>

      <div class="modal-body">
        <p class="warning">
          ⚠ API key disimpan di <code>localStorage</code> browser — siapa pun yang punya akses ke
          device ini bisa melihatnya. Untuk penggunaan personal OK, tapi jangan pakai device
          yang dipakai banyak orang.
        </p>

        <div
          v-for="provider in availableProviders"
          :key="provider.id"
          class="provider-section"
        >
          <div class="provider-header">
            <h3>{{ provider.name }}</h3>
            <span
              v-if="providerStatus(provider.id)"
              class="badge ok"
            >✓ Configured</span>
            <span v-else class="badge warn">⚠ Not configured</span>
          </div>

          <!-- Base URL (khusus provider yang support override) -->
          <div v-if="supportsBaseUrlOverride(provider.id)" class="field">
            <label>Base URL</label>
            <input
              type="text"
              :value="getConfig(provider.id).baseUrl || ''"
              @input="updateConfig(provider.id, 'baseUrl', $event.target.value)"
              :placeholder="defaultBaseUrl(provider.id)"
            />
            <small>Default: <code>{{ defaultBaseUrl(provider.id) }}</code></small>
          </div>

          <!-- API Key -->
          <div v-if="requiresApiKey(provider.id)" class="field">
            <label>API Key</label>
            <div class="input-row">
              <input
                :type="showKey[provider.id] ? 'text' : 'password'"
                :value="getConfig(provider.id).apiKey || ''"
                @input="updateConfig(provider.id, 'apiKey', $event.target.value)"
                :placeholder="apiKeyPlaceholder(provider.id)"
              />
              <button
                class="btn-toggle"
                @click="showKey[provider.id] = !showKey[provider.id]"
                :title="showKey[provider.id] ? 'Sembunyikan' : 'Tampilkan'"
              >
                {{ showKey[provider.id] ? '🙈' : '👁' }}
              </button>
            </div>
            <small>
              Dapatkan di
              <a v-if="provider.id === 'openrouter'" href="https://openrouter.ai/keys" target="_blank" rel="noopener">
                openrouter.ai/keys
              </a>
              <span v-else>env var <code>{{ envVarName(provider.id) }}</code></span>
            </small>
          </div>

          <div v-else class="field">
            <small class="muted">
              Provider ini tidak butuh API key.
              Set base URL di env <code>{{ envVarName(provider.id) }}</code> atau di atas.
            </small>
          </div>
        </div>

        <div class="actions">
          <button class="btn-secondary" @click="$emit('close')">Tutup</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useChatStore } from '@/stores/chat'

defineEmits(['close'])

const store = useChatStore()
const { availableProviders, providerConfig } = storeToRefs(store)

const showKey = reactive({})

// Default base URL per provider (untuk placeholder & display)
const DEFAULT_BASE_URLS = {
  ollama: 'http://localhost:11434',
  '9router': 'http://localhost:20128/v1',
  openrouter: 'https://openrouter.ai/api/v1'
}

const ENV_VAR_NAMES = {
  ollama: 'VITE_OLLAMA_BASE_URL',
  '9router': 'VITE_9ROUTER_BASE_URL',
  openrouter: 'VITE_OPENROUTER_BASE_URL'
}

function defaultBaseUrl(providerId) {
  return DEFAULT_BASE_URLS[providerId] || ''
}

function envVarName(providerId) {
  return ENV_VAR_NAMES[providerId] || ''
}

function requiresApiKey(providerId) {
  // Definisikan di sini agar tidak bergantung pada instance class
  if (providerId === 'openrouter') return true
  return false
}

function supportsBaseUrlOverride(providerId) {
  // Semua provider OpenAI-compatible bisa override baseUrl
  return providerId !== 'ollama'
}

function apiKeyPlaceholder(providerId) {
  if (providerId === 'openrouter') return 'sk-or-v1-...'
  return 'API key (optional)'
}

function getConfig(providerId) {
  return providerConfig.value[providerId] || {}
}

function providerStatus(providerId) {
  const cfg = getConfig(providerId)
  if (providerId === 'openrouter') return Boolean(cfg.apiKey)
  if (providerId === '9router') return Boolean(cfg.baseUrl || true) // default sudah cukup
  return true // ollama selalu OK kalau reachable
}

function updateConfig(providerId, key, value) {
  store.setProviderConfig(providerId, { [key]: value })
}
</script>

<style scoped>
.modal-backdrop {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(2px);
}
.modal {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  width: min(560px, 92vw);
  max-height: 85vh;
  display: flex; flex-direction: column;
  box-shadow: 0 20px 60px rgba(0,0,0,0.5);
}
.modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}
.modal-header h2 {
  font-size: 1.05rem; font-weight: 600; margin: 0;
}
.btn-close {
  background: none; border: none; color: var(--text-muted);
  font-size: 22px; cursor: pointer; padding: 0 4px; line-height: 1;
}
.btn-close:hover { color: var(--text); }

.modal-body {
  padding: 20px;
  overflow-y: auto;
  display: flex; flex-direction: column; gap: 16px;
}
.modal-body::-webkit-scrollbar { width: 4px; }
.modal-body::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

.warning {
  background: rgba(224, 165, 82, 0.08);
  border: 1px solid rgba(224, 165, 82, 0.3);
  color: #e0a552;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 0.8rem;
  line-height: 1.5;
}
.warning code {
  background: rgba(0,0,0,0.3);
  padding: 1px 5px;
  border-radius: 3px;
  font-family: monospace;
  font-size: 0.78rem;
}

.provider-section {
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px 16px;
  display: flex; flex-direction: column; gap: 10px;
}
.provider-header {
  display: flex; align-items: center; justify-content: space-between;
}
.provider-header h3 {
  font-size: 0.92rem; font-weight: 600; margin: 0;
}
.badge {
  font-size: 0.7rem; padding: 2px 8px; border-radius: 10px;
}
.badge.ok { background: rgba(92, 186, 114, 0.15); color: #5cba72; }
.badge.warn { background: rgba(224, 165, 82, 0.15); color: #e0a552; }

.field {
  display: flex; flex-direction: column; gap: 4px;
}
.field label {
  font-size: 0.75rem; color: var(--text-muted);
  text-transform: uppercase; letter-spacing: 0.05em;
}
.field input {
  background: var(--bg);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 6px;
  padding: 7px 10px;
  font-size: 0.85rem;
  font-family: 'JetBrains Mono', monospace;
  outline: none;
  transition: border-color 0.2s;
  width: 100%;
}
.field input:focus { border-color: var(--accent); }
.field small {
  font-size: 0.72rem; color: var(--text-muted);
}
.field small code {
  font-family: monospace;
  background: var(--bg);
  padding: 1px 5px;
  border-radius: 3px;
}
.field small a { color: #56a8f5; text-decoration: none; }
.field small a:hover { text-decoration: underline; }
.field small.muted { font-style: italic; }

.input-row {
  display: flex; gap: 6px; align-items: center;
}
.input-row input { flex: 1; }

.btn-toggle {
  background: var(--bg);
  border: 1px solid var(--border);
  color: var(--text-muted);
  border-radius: 6px;
  padding: 6px 10px;
  cursor: pointer;
  font-size: 0.9rem;
  flex-shrink: 0;
}
.btn-toggle:hover { color: var(--text); }

.actions {
  display: flex; justify-content: flex-end;
  margin-top: 4px;
}
.btn-secondary {
  background: var(--surface2);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 6px;
  padding: 7px 16px;
  font-size: 0.85rem;
  cursor: pointer;
}
.btn-secondary:hover { background: var(--border); }
</style>
