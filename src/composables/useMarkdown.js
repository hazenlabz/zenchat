import { marked } from 'marked'
import hljs from 'highlight.js'
import DOMPurify from 'dompurify'

// Konfigurasi marked sekali aja di sini
marked.setOptions({
  breaks: true,    // newline biasa jadi <br>
  gfm: true,       // GitHub Flavored Markdown (table, strikethrough, dll)
})

// Custom renderer — override bagian tertentu dari output marked
const renderer = new marked.Renderer()

// Override code block: tambahin highlight.js + tombol copy
renderer.code = (code, language) => {
  const validLang = language && hljs.getLanguage(language) ? language : 'plaintext'
  const highlighted = hljs.highlight(code, { language: validLang }).value
  const langLabel = validLang === 'plaintext' ? '' : validLang

  return `
    <div class="code-block">
      <div class="code-header">
        <span class="code-lang">${langLabel}</span>
        <button class="copy-btn" onclick="
          navigator.clipboard.writeText(this.closest('.code-block').querySelector('code').innerText);
          this.textContent = 'copied!';
          setTimeout(() => this.textContent = 'copy', 1500);
        ">copy</button>
      </div>
      <pre><code class="hljs language-${validLang}">${highlighted}</code></pre>
    </div>
  `
}

// Override inline code
renderer.codespan = (code) => {
  return `<code class="inline-code">${code}</code>`
}

marked.use({ renderer })

/**
 * Composable untuk render markdown dengan aman
 * @param {string} raw - raw markdown string
 * @returns {string} sanitized HTML
 */
export function useMarkdown(raw) {
  if (!raw) return ''
  const html = marked.parse(raw)
  // DOMPurify: buang script/event handler berbahaya, tapi izinkan class & onclick copy button
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ['onclick'],   // izinkan onclick untuk tombol copy
    FORBID_TAGS: ['script'], // tetap block script tag
  })
}
