/**
 * storage.js — abstraksi layer untuk persistence.
 * Kalau suatu saat mau ganti ke IndexedDB, backend API, dll —
 * cukup ubah file ini, store tidak perlu disentuh.
 */

const KEYS = {
  CONVERSATIONS: 'ollama_conversations',
  ACTIVE_ID: 'ollama_active_id',
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
}
