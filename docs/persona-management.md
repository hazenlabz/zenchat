# Manajemen Persona

Fitur manajemen persona memungkinkan Anda untuk mengelola persona yang digunakan dalam aplikasi chat. Persona adalah karakter AI dengan instruksi khusus yang menentukan bagaimana AI merespons.

## Fitur yang Tersedia

### 1. Kelola Persona Dasar
- **Tambah Persona**: Membuat persona baru dengan ID, nama, deskripsi, dan system prompt
- **Edit Persona**: Mengubah informasi persona yang sudah ada
- **Hapus Persona**: Menghapus persona custom yang telah dibuat
- **Gunakan Persona**: Menerapkan persona ke percakapan aktif

### 2. Impor/Ekspor Persona
- **Ekspor ke File**: Menyimpan semua persona ke file JSON untuk backup atau berbagi
- **Impor dari File**: Memuat persona dari file JSON yang telah diekspor sebelumnya

## Cara Menggunakan

### Mengakses Manajemen Persona
1. Buka aplikasi chat
2. Klik tombol "Kelola Persona" di bagian bawah input bar

### Menambah Persona Baru
1. Klik tombol "+ Tambah Persona Baru"
2. Isi form dengan:
   - **ID**: Identifier unik untuk persona (digunakan dengan perintah `/persona id`)
   - **Nama**: Nama yang mudah diingat
   - **Deskripsi**: Penjelasan singkat tentang fungsi persona
   - **System Prompt**: Instruksi lengkap untuk persona
3. Klik "Simpan"

### Mengedit Persona
1. Temukan persona yang ingin diedit dalam daftar
2. Klik tombol "Sunting"
3. Ubah informasi yang diperlukan
4. Klik "Simpan"

### Menghapus Persona
1. Temukan persona custom yang ingin dihapus
2. Klik tombol "Hapus"
3. Konfirmasi penghapusan

Catatan: Persona bawaan tidak dapat dihapus, hanya dapat dioverride dengan membuat persona custom dengan ID yang sama.

### Impor/Ekspor Persona
1. Klik tombol "Ekspor ke File" untuk menyimpan semua persona ke file JSON
2. Klik tombol "Impor dari File" untuk memuat persona dari file JSON

## Struktur File personas.json

File `personas.json` memiliki struktur sebagai berikut:

```json
[
  {
    "id": "identifier_unik",
    "name": "Nama Persona",
    "description": "Deskripsi singkat persona",
    "system_prompt": "Instruksi lengkap untuk persona"
  }
]
```

Setiap objek dalam array mewakili satu persona dengan atribut:
- `id`: Identifier unik yang digunakan dengan perintah `/persona`
- `name`: Nama yang ditampilkan dalam antarmuka
- `description`: Deskripsi singkat untuk identifikasi cepat
- `system_prompt`: Instruksi detail yang menentukan perilaku persona