<template>
  <div class="chat-window" ref="windowRef">
    <div v-if="!hasMessages" class="empty-state">
      <div class="empty-icon">◎</div>
      <p>Pilih model dan mulai ngobrol</p>
    </div>
    <TransitionGroup name="msg" tag="div" class="messages">
      <MessageBubble v-for="msg in messages" :key="msg.id" :message="msg" />
    </TransitionGroup>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useChatStore } from '@/stores/chat'
import MessageBubble from './MessageBubble.vue'

const store = useChatStore()
const { messages, hasMessages } = storeToRefs(store)

const windowRef = ref(null)

// Auto scroll ke bawah setiap ada pesan baru atau konten update
watch(messages, async () => {
  await nextTick()
  if (windowRef.value) {
    windowRef.value.scrollTop = windowRef.value.scrollHeight
  }
}, { deep: true })
</script>

<style scoped>
.chat-window {
  flex: 1;
  overflow-y: auto;
  padding: 24px 20px;
  display: flex;
  flex-direction: column;
  scroll-behavior: smooth;
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
</style>
