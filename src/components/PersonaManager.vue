<template>
  <!-- Modal backdrop -->
  <Teleport to="body">
    <div class="modal-backdrop" @click.self="$emit('close')">
      <div class="modal">
        <div class="modal-header">
          <h2>Kelola Persona</h2>
          <button class="btn-close" @click="$emit('close')">×</button>
        </div>

        <!-- List persona -->
        <div v-if="!editing" class="modal-body">
          <div class="persona-list">
            <div
              v-for="p in allPersonas"
              :key="p.id"
              class="persona-item"
            >
              <div class="persona-info">
                <div class="persona-name">
                  {{ p.name }}
                  <span v-if="!isCustomPersona(p.id)" class="badge">default</span>
                  <span v-else class="badge custom">custom</span>
                </div>
                <div class="persona-desc">{{ p.description }}</div>
                <div class="persona-id">ID: <code>{{ p.id }}</code></div>
              </div>
              <div class="persona-actions">
                <button class="btn-sm" @click="startEdit(p)">Sunting</button>
                <button
                  v-if="isCustomPersona(p.id)"
                  class="btn-sm danger"
                  @click="deleteCustomPersona(p.id)"
                >Hapus</button>
                <button class="btn-sm accent" @click="applyPersona(p)">Pakai</button>
              </div>
            </div>
          </div>

          <div class="file-actions">
            <input 
              ref="fileInput" 
              type="file" 
              accept=".json" 
              style="display: none;" 
              @change="handleFileImport"
            />
            <button class="btn-sm" @click="exportToFile">Ekspor ke File</button>
            <button class="btn-sm" @click="triggerFileSelect">Impor dari File</button>
          </div>

          <button class="btn-add" @click="startNew()">+ Tambah Persona Baru</button>
        </div>

        <!-- Form edit/tambah -->
        <div v-else class="modal-body">
          <div class="form">
            <label>ID <span class="hint-inline">(dipakai untuk /persona id)</span></label>
            <input
              v-model="form.id"
              placeholder="contoh: pembuat_soal_ipa"
              :disabled="editingDefault"
            />

            <label>Nama</label>
            <input v-model="form.name" placeholder="contoh: Pembuat Soal IPA" />

            <label>Deskripsi singkat</label>
            <input v-model="form.description" placeholder="Untuk apa persona ini?" />

            <label>System Prompt</label>
            <textarea
              v-model="form.system_prompt"
              placeholder="Tulis instruksi lengkap untuk persona ini..."
              rows="8"
            />

            <div class="form-actions">
              <button class="btn-sm" @click="editing = false">Batal</button>
              <button class="btn-sm accent" @click="submitForm()">Simpan</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useChatStore } from '@/stores/chat'
import { usePersona } from '@/composables/usePersona'

const emit = defineEmits(['close', 'apply'])
const store = useChatStore()
const { allPersonas, savePersona, deleteCustomPersona, isCustomPersona, savePersonasToFile, loadPersonasFromFile } = usePersona()

const editing = ref(false)
const editingDefault = ref(false)
const form = reactive({ id: '', name: '', description: '', system_prompt: '' })
const fileInput = ref(null)

function startNew() {
  Object.assign(form, { id: '', name: '', description: '', system_prompt: '' })
  editingDefault.value = false
  editing.value = true
}

function startEdit(persona) {
  Object.assign(form, { ...persona })
  // Default persona bisa diedit tapi ID-nya dikunci (jadi custom override)
  editingDefault.value = !isCustomPersona(persona.id)
  editing.value = true
}

function submitForm() {
  if (!form.id || !form.name || !form.system_prompt) return
  savePersona({ ...form })
  editing.value = false
}

function applyPersona(persona) {
  // Terapkan langsung ke conversation aktif
  if (!store.activeId) store.newConversation()
  const conv = store.activeConversation
  if (conv) {
    conv.systemPrompt = persona.system_prompt
    conv.personaId = persona.id
    conv.personaName = persona.name
  }
  emit('apply', persona)
  emit('close')
}

// Ekspor persona ke file
function exportToFile() {
  savePersonasToFile(allPersonas.value)
}

// Trigger pemilihan file untuk impor
function triggerFileSelect() {
  fileInput.value.click()
}

// Impor persona dari file
async function handleFileImport(event) {
  const file = event.target.files[0]
  if (!file) return
  
  try {
    const importedPersonas = await loadPersonasFromFile(file)
    
    // Validasi struktur data
    if (!Array.isArray(importedPersonas)) {
      throw new Error('Format file tidak valid')
    }
    
    // Simpan setiap persona yang diimpor
    importedPersonas.forEach(persona => {
      if (persona.id && persona.name && persona.system_prompt) {
        savePersona(persona)
      }
    })
    
    alert(`Berhasil mengimpor ${importedPersonas.length} persona`)
  } catch (error) {
    console.error('Error importing personas:', error)
    alert('Gagal mengimpor file: ' + error.message)
  }
  
  // Reset input file
  event.target.value = ''
}
</script>

<style scoped>
.modal-backdrop {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.7);
  display: flex; align-items: center; justify-content: center;
  z-index: 100;
  backdrop-filter: blur(2px);
}

.modal {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  width: min(600px, 92vw);
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.modal-header h2 { font-size: 1rem; font-weight: 600; }

.btn-close {
  background: none; border: none;
  color: var(--text-muted); font-size: 20px;
  cursor: pointer; line-height: 1;
  padding: 0 4px;
  transition: color 0.15s;
}
.btn-close:hover { color: var(--text); }

.modal-body {
  padding: 16px 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Persona list */
.persona-list { display: flex; flex-direction: column; gap: 8px; }

.persona-item {
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px 14px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.persona-info { flex: 1; display: flex; flex-direction: column; gap: 3px; }

.persona-name {
  font-size: 0.9rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
}

.badge {
  font-size: 0.65rem;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--border);
  color: var(--text-muted);
  font-weight: 400;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.badge.custom { background: rgba(86, 168, 245, 0.15); color: #56a8f5; }

.persona-desc { font-size: 0.8rem; color: var(--text-muted); }
.persona-id { font-size: 0.75rem; color: var(--text-muted); }
.persona-id code {
  background: rgba(255,255,255,0.06);
  padding: 1px 5px;
  border-radius: 3px;
  font-family: monospace;
}

.persona-actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex-shrink: 0;
}

.btn-sm {
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text-muted);
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 0.78rem;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.btn-sm:hover { color: var(--text); border-color: var(--text-muted); }
.btn-sm.danger:hover { color: var(--danger); border-color: var(--danger); }
.btn-sm.accent {
  background: rgba(232,232,232,0.08);
  color: var(--text);
  border-color: var(--text-muted);
}
.btn-sm.accent:hover { background: var(--accent); color: var(--bg); }

.btn-add {
  background: transparent;
  border: 1px dashed var(--border);
  color: var(--text-muted);
  padding: 10px;
  border-radius: 10px;
  cursor: pointer;
  font-size: 0.85rem;
  transition: all 0.15s;
  text-align: center;
}
.btn-add:hover { color: var(--text); border-color: var(--text-muted); }

.file-actions {
  display: flex;
  gap: 10px;
  margin: 15px 0;
  padding-top: 10px;
  border-top: 1px solid var(--border);
}

/* Form */
.form { display: flex; flex-direction: column; gap: 10px; }
.form label { font-size: 0.8rem; color: var(--text-muted); }
.hint-inline { font-size: 0.72rem; opacity: 0.7; }

.form input, .form textarea {
  background: var(--surface2);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 0.88rem;
  font-family: inherit;
  outline: none;
  transition: border-color 0.2s;
  resize: vertical;
}
.form input:focus, .form textarea:focus { border-color: var(--accent); }
.form input:disabled { opacity: 0.5; cursor: not-allowed; }

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 4px;
}
</style>
