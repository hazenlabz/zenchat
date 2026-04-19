# ollama-chat

Aplikasi chat berbasis Vue 3 + Vite yang berkomunikasi langsung dengan Ollama API.

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Ollama](https://ollama.ai/) sudah terinstall dan berjalan

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy env dan sesuaikan
cp .env.example .env

# 3. Edit .env — set model default kamu
# VITE_OLLAMA_DEFAULT_MODEL=llama3

# 4. Jalankan dev server
npm run dev
```

Buka browser ke `http://localhost:5173`

## Struktur Project

```
src/
├── components/
│   ├── ChatWindow.vue      # Area percakapan, auto-scroll
│   ├── MessageBubble.vue   # Bubble tiap pesan (user/assistant)
│   └── InputBar.vue        # Input teks + tombol kirim/stop
├── services/
│   └── ollama.js           # Semua API call ke Ollama (ganti provider di sini)
├── stores/
│   └── chat.js             # State management dengan Pinia
├── App.vue                 # Layout utama + sidebar
└── main.js
```

## Fitur

- ✅ Streaming response (token by token, seperti ChatGPT)
- ✅ Dropdown pilih model (otomatis dari Ollama)
- ✅ Stop streaming kapan saja
- ✅ Chat baru
- ✅ Status koneksi Ollama
- ✅ Model default dari `.env`
- ✅ Manajemen persona yang dapat dikustomisasi
- ✅ Impor/ekspor persona ke/dari file JSON

## Manajemen Persona

Aplikasi ini menyediakan sistem manajemen persona yang kuat yang memungkinkan Anda:

- **Membuat, mengedit, dan menghapus persona custom**
- **Mengimpor dan mengekspor persona ke/dari file JSON**
- **Menggunakan persona dengan perintah `/persona id`**

Persona adalah karakter AI dengan instruksi khusus yang menentukan bagaimana AI merespons. Anda dapat mengakses manajemen persona dengan mengklik tautan "Kelola Persona" di bagian bawah input bar.

Lihat dokumentasi lengkap di `docs/persona-management.md`.

## Catatan CORS

Kalau muncul error CORS di browser, jalankan Ollama dengan:
```bash
OLLAMA_ORIGINS=http://localhost:5173 ollama serve
```
