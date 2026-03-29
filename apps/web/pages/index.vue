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
        <template v-if="currentMode === 'chat'">
          <PreviewPanel />
        </template>
        <template v-else>
          <div class="code-editor-area">
            <div class="code-editor">
              <div class="editor-header">Editor</div>
              <textarea class="code-textarea" placeholder="Write your code here..."></textarea>
            </div>
            <div class="code-preview">
              <PreviewPanel />
            </div>
          </div>
        </template>
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

.code-editor-area {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.code-editor {
  flex: 1;
  display: flex;
  flex-direction: column;
  border-bottom: 1px solid #e5e5e5;
}

.editor-header {
  padding: 8px 12px;
  background: #f5f5f5;
  border-bottom: 1px solid #e5e5e5;
  font-size: 12px;
  color: #666;
}

.code-textarea {
  flex: 1;
  padding: 12px;
  border: none;
  resize: none;
  font-family: 'Monaco', 'Menlo', monospace;
  font-size: 14px;
  line-height: 1.5;
}

.code-preview {
  height: 50%;
}
</style>
