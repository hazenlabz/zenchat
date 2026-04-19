import { ref, computed } from 'vue'
import defaultPersonas from '@/data/personas.json'

const STORAGE_KEY = 'ollama_custom_personas'

// Load custom personas dari localStorage
function loadCustomPersonas() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveCustomPersonas(personas) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(personas))
}

// Simpan persona ke file personas.json (untuk ekspor)
export function savePersonasToFile(personas) {
  const dataStr = JSON.stringify(personas, null, 2);
  const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
  
  const exportFileDefaultName = 'personas.json';
  
  const linkElement = document.createElement('a');
  linkElement.setAttribute('href', dataUri);
  linkElement.setAttribute('download', exportFileDefaultName);
  linkElement.click();
}

// Simpan persona ke file personas.json secara langsung (jika lingkungan mendukung)
export function savePersonasToJSONFile(personas) {
  // Di lingkungan browser, kita hanya bisa mengunduh file
  // Di lingkungan Node.js, kita bisa menulis langsung ke file
  if (typeof window !== 'undefined') {
    savePersonasToFile(personas);
    return Promise.resolve();
  }
  
  // Untuk lingkungan Node.js (jika diperlukan nanti)
  // Ini hanya contoh, karena aplikasi ini berbasis browser
  return Promise.reject(new Error('Operasi ini hanya tersedia di lingkungan Node.js'));
}

// Load persona dari file (untuk impor)
export function loadPersonasFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = function(event) {
      try {
        const personas = JSON.parse(event.target.result);
        resolve(personas);
      } catch (error) {
        reject(error);
      }
    };
    reader.readAsText(file);
  });
}

// State — dibuat di luar supaya shared across components (singleton)
const customPersonas = ref(loadCustomPersonas())

export function usePersona() {
  // Gabungkan default + custom, custom bisa override default by id
  const allPersonas = computed(() => {
    const customIds = new Set(customPersonas.value.map((p) => p.id))
    const filtered = defaultPersonas.filter((p) => !customIds.has(p.id))
    return [...filtered, ...customPersonas.value]
  })

  /** Cari persona by id (exact) atau name (case-insensitive partial match) */
  function findPersona(query) {
    const q = query.trim().toLowerCase()
    return (
      allPersonas.value.find((p) => p.id === q) ||
      allPersonas.value.find((p) => p.name.toLowerCase().includes(q)) ||
      null
    )
  }

  /** Tambah atau update persona custom */
  function savePersona(persona) {
    const idx = customPersonas.value.findIndex((p) => p.id === persona.id)
    if (idx >= 0) {
      customPersonas.value[idx] = persona
    } else {
      customPersonas.value.push(persona)
    }
    saveCustomPersonas(customPersonas.value)
  }

  /** Hapus persona custom (default tidak bisa dihapus, hanya bisa di-override) */
  function deleteCustomPersona(id) {
    customPersonas.value = customPersonas.value.filter((p) => p.id !== id)
    saveCustomPersonas(customPersonas.value)
  }

  /** Cek apakah persona adalah custom (bukan dari default JSON) */
  function isCustomPersona(id) {
    return customPersonas.value.some((p) => p.id === id)
  }

  return {
    allPersonas,
    customPersonas,
    findPersona,
    savePersona,
    deleteCustomPersona,
    isCustomPersona,
    savePersonasToFile,
    loadPersonasFromFile
  }
}
