# ollama-chat

Aplikasi chat berbasis Vue 3 + Vite yang mendukung banyak AI provider:
**Ollama**, **9Router** (OpenAI-compatible lokal), dan **OpenRouter**.

## Fitur

- 🔌 **Multi-provider**: Ollama, 9Router (lokal), OpenRouter — switch dari sidebar
- 🌊 **Streaming response** (token by token)
- 🛑 **Stop streaming** kapan saja
- 💬 **Chat history** tersimpan di localStorage
- 🎭 **Persona management** (custom system prompts)
- 🖼️ **Image generation** via ComfyUI (`/imagine`)
- 📎 **File attachment** (image, PDF, DOCX, TXT)
- 🔑 **API key management** lewat Settings modal
- 🎨 **Markdown rendering** dengan syntax highlighting

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- Minimal salah satu:
  - [Ollama](https://ollama.ai/) berjalan di `localhost:11434`, **atau**
  - Server OpenAI-compatible (LM Studio, llama.cpp, LocalAI, **9Router**, dll), **atau**
  - API key [OpenRouter](https://openrouter.ai/keys)

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy env dan sesuaikan
cp .env.example .env

# 3. Edit .env — set provider default & endpoint
# VITE_OLLAMA_DEFAULT_MODEL=llama3
# VITE_9ROUTER_BASE_URL=http://localhost:20128/v1

# 4. Jalankan dev server
npm run dev
```

Buka browser ke `http://localhost:8989` (port sesuai `VITE_PORT`).

## Konfigurasi Provider

### Ollama (default)

```env
VITE_OLLAMA_BASE_URL=http://localhost:11434
VITE_OLLAMA_DEFAULT_MODEL=llama3
```

### 9Router / OpenAI-compatible lokal

Cocok untuk LM Studio, llama.cpp server, LocalAI, atau router custom
yang expose endpoint OpenAI-compatible.

```env
VITE_9ROUTER_BASE_URL=http://localhost:20128/v1
VITE_9ROUTER_API_KEY=           # optional untuk server lokal
VITE_9ROUTER_DEFAULT_MODEL=     # model default (kalau tidak di-set, pakai model pertama)
```

> 💡 **9Router** adalah sebutan untuk router/proxy lokal yang expose
> endpoint OpenAI-compatible. Server lain yang support format yang sama
> (LM Studio, llama.cpp, LocalAI) juga bisa — cukup ubah `VITE_9ROUTER_BASE_URL`.

Base URL harus diakhiri `/v1` (sesuai konvensi OpenAI).

### OpenRouter (cloud)

1. Daftar di [openrouter.ai](https://openrouter.ai) dan buat API key
2. Set di **Settings modal** (⚙ di sidebar) **atau** di `.env`:

```env
VITE_OPENROUTER_API_KEY=sk-or-v1-...
```

> ⚠ **API key disimpan di `localStorage` browser.** Jangan pakai di device
> yang dipakai orang lain. Untuk produksi, pertimbangkan backend proxy.

## Struktur Project

```
src/
├── components/
│   ├── ChatWindow.vue      # Area percakapan, auto-scroll
│   ├── MessageBubble.vue   # Bubble tiap pesan (user/assistant)
│   ├── InputBar.vue        # Input teks + tombol kirim/stop
│   ├── SettingsModal.vue   # Konfigurasi provider (API key, base URL)
│   └── PersonaManager.vue  # Kelola persona
├── services/
│   ├── providers/
│   │   ├── base.js             # Interface untuk semua provider
│   │   ├── ollama.js           # Implementasi Ollama
│   │   └── openai-compatible.js # OpenAI-compatible (OpenRouter, 9Router, dll)
│   ├── providerRegistry.js # Daftar provider yang tersedia
│   ├── comfy.js             # ComfyUI API
│   └── storage.js           # localStorage wrapper
├── stores/
│   └── chat.js              # State management dengan Pinia
├── App.vue                  # Layout utama + sidebar
└── main.js
```

## Cara Tambah Provider Baru

1. Buat file baru di `src/services/providers/`, extend `BaseProvider`:
   ```js
   import { BaseProvider } from './base.js'
   export class MyProvider extends BaseProvider {
     constructor(config) { super(); this.id = 'my'; this.name = 'My Provider'; /* ... */ }
     async fetchModels() { /* ... */ }
     async streamChat({ model, messages, signal, onChunk, onDone }) { /* ... */ }
   }
   ```
2. Daftarkan di `src/services/providerRegistry.js`:
   ```js
   { id: 'my', name: 'My Provider', factory: (cfg) => new MyProvider(cfg) }
   ```

## Manajemen Persona

- Aktifkan: `/persona <id>` di chat
- Lihat daftar: `/personas`
- Hapus: `/clear`

Lihat dokumentasi lengkap di `docs/persona-management.md`.

## Catatan CORS

### Ollama
```bash
OLLAMA_ORIGINS=http://localhost:8989 ollama serve
```

### 9Router / OpenAI-compatible
Tergantung server. Untuk LM Studio, enable CORS di Settings > Server.

## Lisensi

Lihat [LICENSE](LICENSE).
