<template>
  <div class="message" :class="message.role">
    <div class="avatar">{{ message.role === 'user' ? 'U' : 'AI' }}</div>
    <div class="bubble" :class="{ 'image-bubble': message.type === 'image' }">

      <!-- Loading dots (chat biasa) -->
      <span v-if="message.loading && message.type !== 'image'" class="loading-dots">
        <span></span><span></span><span></span>
      </span>

      <!-- Image message -->
      <div v-else-if="message.type === 'image'" class="image-container">
        <!-- Generating state -->
        <div v-if="message.loading" class="generating">
          <div class="gen-spinner"></div>
          <span>{{ message.loadingText || 'Generating...' }}</span>
        </div>
        <!-- Error state -->
        <div v-else-if="message.error" class="gen-error">
          ✗ {{ message.error }}
        </div>
        <!-- Gambar jadi -->
        <div v-else class="image-result">
          <img :src="message.imageUrl" :alt="message.prompt" @load="onImageLoad" />
          <div class="image-meta">
            <span class="image-prompt">{{ message.prompt }}</span>
            <a :href="message.imageUrl" target="_blank" class="btn-open">↗ Buka</a>
          </div>
        </div>
      </div>

      <!-- User: plain text + attachments -->
      <div v-else-if="message.role === 'user'" class="user-content-wrapper">
        <div v-if="message.attachments?.length" class="attachments-row">
          <div v-for="(att, idx) in message.attachments" :key="idx" class="attachment-chip" :title="att.name">
            <span class="att-icon">{{ getAttachmentIcon(att.type) }}</span>
            <span class="att-name">{{ att.name }}</span>
          </div>
        </div>
        <span v-if="message.content" class="content">{{ message.content }}</span>
      </div>

      <!-- Assistant: markdown -->
      <div v-else class="markdown-body" v-html="renderedContent" />

    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useMarkdown } from '@/composables/useMarkdown'

const props = defineProps({
  message: { type: Object, required: true }
})

const emit = defineEmits(['image-loaded'])

const renderedContent = computed(() => {
  if (props.message.role !== 'assistant' || props.message.type === 'image') return ''
  return useMarkdown(props.message.content)
})

function onImageLoad() {
  emit('image-loaded')
}
</script>

<style scoped>
.message {
  display: flex;
  gap: 12px;
  padding: 4px 0;
  align-items: flex-start;
}
.message.user { flex-direction: row-reverse; }

.avatar {
  width: 32px; height: 32px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700;
  flex-shrink: 0; letter-spacing: 0.05em;
}
.user .avatar { background: var(--accent); color: var(--bg); }
.assistant .avatar { background: var(--surface2); color: var(--text-muted); }

.bubble {
  max-width: 72%;
  padding: 12px 16px;
  border-radius: 16px;
  line-height: 1.65;
  font-size: 0.92rem;
  word-break: break-word;
}
.bubble.image-bubble { padding: 8px; background: var(--surface2) !important; }

.user .bubble {
  background: var(--accent); color: var(--bg);
  border-bottom-right-radius: 4px;
  white-space: pre-wrap;
}
.assistant .bubble {
  background: var(--surface2); color: var(--text);
  border-bottom-left-radius: 4px;
}

/* Loading dots */
.loading-dots { display: flex; gap: 4px; align-items: center; height: 18px; }
.loading-dots span {
  width: 6px; height: 6px;
  background: var(--text-muted);
  border-radius: 50%;
  animation: bounce 1.2s infinite;
}
.loading-dots span:nth-child(2) { animation-delay: 0.2s; }
.loading-dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
  40% { transform: translateY(-5px); opacity: 1; }
}

/* Image container */
.image-container { min-width: 200px; }

.generating {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px;
  color: var(--text-muted);
  font-size: 0.85rem;
}

.gen-spinner {
  width: 18px; height: 18px;
  border: 2px solid var(--border);
  border-top-color: var(--text-muted);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  flex-shrink: 0;
}
@keyframes spin { to { transform: rotate(360deg); } }

.gen-error {
  padding: 12px 16px;
  color: var(--danger);
  font-size: 0.85rem;
}

.image-result {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.image-result img {
  width: 100%;
  max-width: 480px;
  border-radius: 10px;
  display: block;
  border: 1px solid var(--border);
}

.image-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 2px;
}

.image-prompt {
  font-size: 0.75rem;
  color: var(--text-muted);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.btn-open {
  font-size: 0.72rem;
  color: #56a8f5;
  text-decoration: none;
  flex-shrink: 0;
  padding: 2px 6px;
  border: 1px solid rgba(86,168,245,0.3);
  border-radius: 4px;
  transition: all 0.15s;
}
.btn-open:hover { background: rgba(86,168,245,0.1); }
</style>

<style>
/* Markdown styles — tidak scoped karena v-html */
.markdown-body { line-height: 1.7; }
.markdown-body p { margin: 0 0 10px; }
.markdown-body p:last-child { margin-bottom: 0; }
.markdown-body h1, .markdown-body h2, .markdown-body h3 { margin: 16px 0 8px; font-weight: 600; }
.markdown-body h1 { font-size: 1.3em; }
.markdown-body h2 { font-size: 1.15em; }
.markdown-body h3 { font-size: 1em; }
.markdown-body ul, .markdown-body ol { padding-left: 20px; margin: 8px 0; }
.markdown-body li { margin: 4px 0; }
.markdown-body blockquote {
  border-left: 3px solid var(--border); margin: 8px 0;
  padding: 6px 12px; color: var(--text-muted); font-style: italic;
}
.markdown-body table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 0.88em; }
.markdown-body th, .markdown-body td { border: 1px solid var(--border); padding: 6px 12px; }
.markdown-body th { background: var(--surface); font-weight: 600; }
.markdown-body strong { font-weight: 600; }
.markdown-body a { color: #56a8f5; text-decoration: none; }
.markdown-body a:hover { text-decoration: underline; }

.inline-code {
  background: rgba(255,255,255,0.07); border: 1px solid var(--border);
  border-radius: 4px; padding: 1px 6px;
  font-family: 'JetBrains Mono', monospace; font-size: 0.85em; color: #c9a96e;
}
.code-block { margin: 10px 0; border-radius: 10px; overflow: hidden; border: 1px solid var(--border); background: #141414; }
.code-header { display: flex; justify-content: space-between; align-items: center; padding: 6px 12px; background: #1a1a1a; border-bottom: 1px solid var(--border); }
.code-lang { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); font-family: monospace; }
.copy-btn { font-size: 0.72rem; background: transparent; border: 1px solid var(--border); color: var(--text-muted); padding: 2px 8px; border-radius: 4px; cursor: pointer; transition: all 0.15s; font-family: monospace; }
.copy-btn:hover { color: var(--text); border-color: var(--text-muted); }
.code-block pre { margin: 0; padding: 14px 16px; overflow-x: auto; }
.code-block pre::-webkit-scrollbar { height: 4px; }
.code-block pre::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
.code-block code { font-family: 'JetBrains Mono', monospace; font-size: 0.85rem; line-height: 1.6; background: transparent !important; }

.hljs { background: transparent !important; color: #c8c8c8; }
.hljs-keyword { color: #cf8e6d; }
.hljs-string { color: #6aab73; }
.hljs-comment { color: #636363; font-style: italic; }
.hljs-function, .hljs-title { color: #56a8f5; }
.hljs-number, .hljs-built_in, .hljs-literal { color: #2aacb8; }
.hljs-attr { color: #c9a96e; }
.hljs-tag { color: #cf8e6d; }
.hljs-meta { color: #636363; }
</style>
