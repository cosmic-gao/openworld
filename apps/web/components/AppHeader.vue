<script setup lang="ts">
const currentMode = useState<'chat' | 'code'>('mode', () => 'chat')

function setMode(mode: 'chat' | 'code') {
  currentMode.value = mode
}
</script>

<template>
  <header class="app-header">
    <div class="logo">
      <span class="logo-icon">⚡</span>
      <span class="logo-text">OpenWorld</span>
    </div>
    <div class="mode-toggle">
      <button
        :class="{ active: currentMode === 'chat' }"
        @click="setMode('chat')"
      >
        聊天模式
      </button>
      <button
        :class="{ active: currentMode === 'code' }"
        @click="setMode('code')"
      >
        代码模式
      </button>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  height: 60px;
  padding: 0 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #e5e5e5;
  background: #fff;
}

.logo {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 18px;
  font-weight: 600;
}

.logo-icon {
  font-size: 24px;
}

.mode-toggle {
  display: flex;
  gap: 8px;
}

.mode-toggle button {
  padding: 8px 16px;
  border: 1px solid #e5e5e5;
  background: #fff;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.mode-toggle button.active {
  background: #333;
  color: #fff;
  border-color: #333;
}
</style>
