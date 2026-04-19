# Dokumentasi Teknis

Dokumen ini menjelaskan implementasi teknis dari fitur-fitur dalam aplikasi ollama-chat.

## Manajemen Persona

### Fungsi yang Ditambahkan

#### `savePersonasToFile(personas)`
Fungsi ini mengekspor daftar persona ke file JSON yang dapat diunduh oleh pengguna.

**Parameter:**
- `personas`: Array objek persona yang akan diekspor

**Implementasi:**
```javascript
export function savePersonasToFile(personas) {
  const dataStr = JSON.stringify(personas, null, 2);
  const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
  
  const exportFileDefaultName = 'personas.json';
  
  const linkElement = document.createElement('a');
  linkElement.setAttribute('href', dataUri);
  linkElement.setAttribute('download', exportFileDefaultName);
  linkElement.click();
}
```

#### `loadPersonasFromFile(file)`
Fungsi ini memuat persona dari file JSON yang dipilih pengguna.

**Parameter:**
- `file`: Objek File yang dipilih pengguna

**Return:**
- Promise yang resolve dengan array objek persona jika berhasil, atau reject dengan error jika gagal

**Implementasi:**
```javascript
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
```

### Modifikasi Komponen

#### PersonaManager.vue

Komponen ini telah dimodifikasi untuk menyertakan fitur impor/ekspor:

1. **Tombol Ekspor ke File**: Memungkinkan pengguna mengekspor semua persona ke file JSON
2. **Tombol Impor dari File**: Memungkinkan pengguna mengimpor persona dari file JSON
3. **Input File Tersembunyi**: Digunakan untuk memilih file JSON untuk diimpor

**Fungsi Baru:**
- `exportToFile()`: Memanggil `savePersonasToFile` dengan daftar semua persona
- `triggerFileSelect()`: Memicu dialog pemilihan file
- `handleFileImport(event)`: Menangani proses impor file dan menyimpan persona yang diimpor

### Penggunaan Local Storage

Persona custom tetap menggunakan local storage untuk persistensi antar sesi. Fitur impor/ekspor memungkinkan pengguna untuk:
1. Backup persona mereka
2. Berbagi persona dengan orang lain
3. Migrasi persona antar instalasi aplikasi

### Keamanan dan Validasi

Fitur impor/ekspor mencakup validasi dasar:
1. Memverifikasi bahwa file yang diimpor adalah JSON yang valid
2. Memastikan struktur data persona sesuai harapan
3. Memberikan umpan balik kepada pengguna tentang hasil impor/ekspor