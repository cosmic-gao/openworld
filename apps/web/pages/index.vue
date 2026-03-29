<script setup lang="ts">
const currentMode = useState<'chat' | 'code'>('mode', () => 'chat')
</script>

<template>
  <div class="app-container">
    <AppHeader />
    <main class="main-content">
      <div class="left-panel">
        <ChatPanel />
      </div>
      <div class="right-panel">
        <PreviewPanel />
      </div>
    </main>
  </div>
</template>

<style>
.app-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.main-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.left-panel {
  width: 50%;
  border-right: 1px solid #e5e5e5;
  overflow: hidden;
}

.right-panel {
  width: 50%;
  overflow: hidden;
}
</style>
