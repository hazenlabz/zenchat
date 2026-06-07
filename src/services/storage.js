/**
 * storage.js — abstraksi layer untuk persistence.
 * Kalau suatu saat mau ganti ke IndexedDB, backend API, dll —
 * cukup ubah file ini, store tidak perlu disentuh.
 */

const KEYS = {
  CONVERSATIONS: 'ollama_conversations',
  ACTIVE_ID: 'ollama_active_id',
  SELECTED_PROVIDER: 'ollama_selected_provider',
  PROVIDER_CONFIG: 'ollama_provider_config', // per-provider apiKey & baseUrl override
  SELECTED_MODELS: 'ollama_selected_models', // per-provider model id pilihan user
}

/** Simpan semua conversations */
export function saveConversations(conversations) {
  try {
    localStorage.setItem(KEYS.CONVERSATIONS, JSON.stringify(conversations))
  } catch (e) {
    console.warn('Storage penuh atau tidak tersedia:', e)
  }
}

/** Ambil semua conversations */
export function loadConversations() {
  try {
    const raw = localStorage.getItem(KEYS.CONVERSATIONS)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

/** Simpan ID conversation yang sedang aktif */
export function saveActiveId(id) {
  localStorage.setItem(KEYS.ACTIVE_ID, id)
}

/** Ambil ID conversation yang terakhir aktif */
export function loadActiveId() {
  return localStorage.getItem(KEYS.ACTIVE_ID)
}

/** Hapus semua data (untuk reset total) */
export function clearAll() {
  localStorage.removeItem(KEYS.CONVERSATIONS)
  localStorage.removeItem(KEYS.ACTIVE_ID)
  localStorage.removeItem(KEYS.SELECTED_PROVIDER)
  localStorage.removeItem(KEYS.PROVIDER_CONFIG)
  localStorage.removeItem(KEYS.SELECTED_MODELS)
}

// ── Provider config (api key, custom baseUrl) ─────────────────────

export function loadSelectedProvider() {
  return localStorage.getItem(KEYS.SELECTED_PROVIDER) || null
}

export function saveSelectedProvider(id) {
  localStorage.setItem(KEYS.SELECTED_PROVIDER, id)
}

export function loadProviderConfig() {
  try {
    const raw = localStorage.getItem(KEYS.PROVIDER_CONFIG)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function saveProviderConfig(config) {
  try {
    localStorage.setItem(KEYS.PROVIDER_CONFIG, JSON.stringify(config))
  } catch (e) {
    console.warn('Gagal simpan provider config:', e)
  }
}

export function loadSelectedModels() {
  try {
    const raw = localStorage.getItem(KEYS.SELECTED_MODELS)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function saveSelectedModels(map) {
  try {
    localStorage.setItem(KEYS.SELECTED_MODELS, JSON.stringify(map))
  } catch (e) {
    console.warn('Gagal simpan selected models:', e)
  }
}
