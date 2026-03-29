<script setup lang="ts">
const previewUrl = useState<string>('previewUrl', () => '')
const isLoading = ref(false)

function refresh() {
  isLoading.value = true
  setTimeout(() => {
    isLoading.value = false
  }, 500)
}
</script>

<template>
  <div class="preview-panel">
    <div class="preview-toolbar">
      <span>预览</span>
      <button @click="refresh" :disabled="isLoading">
        {{ isLoading ? '加载中...' : '刷新' }}
      </button>
    </div>
    <div class="preview-container">
      <iframe
        v-if="previewUrl"
        :src="previewUrl"
        class="preview-frame"
      />
      <div v-else class="preview-placeholder">
        <p>预览区域</p>
        <p class="hint">WebContainer 将在此加载预览</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.preview-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.preview-toolbar {
  height: 48px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #e5e5e5;
  background: #fafafa;
}

.preview-toolbar button {
  padding: 6px 12px;
  border: 1px solid #e5e5e5;
  background: #fff;
  border-radius: 4px;
  cursor: pointer;
}

.preview-toolbar button:disabled {
  opacity: 0.6;
}

.preview-container {
  flex: 1;
  position: relative;
}

.preview-frame {
  width: 100%;
  height: 100%;
  border: none;
}

.preview-placeholder {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #999;
  background: #fafafa;
}

.preview-placeholder .hint {
  font-size: 12px;
  margin-top: 8px;
}
</style>
