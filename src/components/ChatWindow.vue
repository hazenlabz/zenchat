<template>
  <div class="chat-window" ref="windowRef">
    <div v-if="!hasMessages" class="empty-state">
      <div class="empty-icon">◎</div>
      <p>Pilih model dan mulai ngobrol</p>
    </div>
    <TransitionGroup name="msg" tag="div" class="messages">
      <MessageBubble v-for="msg in messages" :key="msg.id" :message="msg" />
    </TransitionGroup>

    <!-- Tombol scroll ke bawah -->
    <Transition name="fade">
      <button
        v-if="showScrollBtn"
        class="btn-scroll-bottom"
        @click="scrollToBottom"
        title="Scroll ke bawah"
      >↓</button>
    </Transition>
  </div>
</template>

<script setup>
import { ref, watch, nextTick, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useChatStore } from '@/stores/chat'
import MessageBubble from './MessageBubble.vue'

const store = useChatStore()
const { messages, hasMessages } = storeToRefs(store)

const windowRef = ref(null)
const showScrollBtn = ref(false)

function scrollToBottom() {
  if (windowRef.value) {
    windowRef.value.scrollTop = windowRef.value.scrollHeight
  }
}

function onScroll() {
  if (!windowRef.value) return
  const el = windowRef.value
  const threshold = 200 // px dari bawah
  showScrollBtn.value = el.scrollHeight - el.scrollTop - el.clientHeight > threshold
}

// Auto scroll ke bawah setiap ada pesan baru atau konten update
watch(messages, async () => {
  await nextTick()
  if (windowRef.value) {
    windowRef.value.scrollTop = windowRef.value.scrollHeight
  }
}, { deep: true })

// Scroll ke bawah saat mount (restore posisi chat terakhir)
onMounted(async () => {
  await nextTick()
  scrollToBottom()
})
</script>

<style scoped>
.chat-window {
  flex: 1;
  min-height: 0; /* Penting: cegah flex child overflow yang bikin input 'hilang' */
  overflow-y: auto;
  padding: 24px 20px;
  display: flex;
  flex-direction: column;
  scroll-behavior: smooth;
  position: relative;
}

.chat-window::-webkit-scrollbar { width: 4px; }
.chat-window::-webkit-scrollbar-track { background: transparent; }
.chat-window::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

.messages {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 760px;
  width: 100%;
  margin: 0 auto;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-muted);
}

.empty-icon {
  font-size: 2.5rem;
  opacity: 0.3;
}

/* Transition */
.msg-enter-active { transition: all 0.2s ease; }
.msg-enter-from { opacity: 0; transform: translateY(8px); }

.btn-scroll-bottom {
  position: absolute;
  bottom: 16px;
  right: 24px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-size: 1.1rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  transition: background 0.15s, transform 0.15s;
  z-index: 10;
}
.btn-scroll-bottom:hover {
  background: var(--hover);
  transform: scale(1.05);
}
</style>
