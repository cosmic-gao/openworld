<script setup lang="ts">
interface Message {
  role: 'user' | 'assistant'
  content: string
}

const messages = useState<Message[]>('messages', () => [])
const inputText = ref('')

function sendMessage() {
  if (!inputText.value.trim()) return
  
  messages.value.push({
    role: 'user',
    content: inputText.value,
  })
  
  inputText.value = ''
}
</script>

<template>
  <div class="chat-panel">
    <div class="messages">
      <div
        v-for="(msg, index) in messages"
        :key="index"
        :class="['message', msg.role]"
      >
        <div class="message-content">{{ msg.content }}</div>
      </div>
      <div v-if="messages.length === 0" class="empty-state">
        <p>👋 你好！告诉我你想生成什么网页？</p>
      </div>
    </div>
    <div class="input-area">
      <textarea
        v-model="inputText"
        placeholder="输入你的需求..."
        @keydown.enter.exact.prevent="sendMessage"
      />
      <button @click="sendMessage">发送</button>
    </div>
  </div>
</template>

<style scoped>
.chat-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.message {
  margin-bottom: 16px;
}

.message.user {
  text-align: right;
}

.message-content {
  display: inline-block;
  padding: 12px 16px;
  border-radius: 12px;
  max-width: 80%;
}

.message.user .message-content {
  background: #333;
  color: #fff;
}

.message.assistant .message-content {
  background: #f5f5f5;
  color: #333;
}

.empty-state {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #999;
}

.input-area {
  padding: 16px;
  border-top: 1px solid #e5e5e5;
  display: flex;
  gap: 12px;
}

.input-area textarea {
  flex: 1;
  padding: 12px;
  border: 1px solid #e5e5e5;
  border-radius: 8px;
  resize: none;
  font-size: 14px;
  font-family: inherit;
}

.input-area button {
  padding: 12px 24px;
  background: #333;
  color: #fff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}
</style>
