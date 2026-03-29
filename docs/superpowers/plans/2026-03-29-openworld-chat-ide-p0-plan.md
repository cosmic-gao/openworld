# OpenWorld Chat IDE - P0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现左右布局、模式切换、WebContainer 预览三个 P0 功能

**Architecture:** 基于 Nuxt 4 的单页应用，使用 `useState` 管理模式状态，WebContainer API 实现浏览器内预览

**Tech Stack:** Nuxt 4, Vue 3 Composition API, @webcontainer/api, TypeScript

---

## 文件结构

```
apps/web/
├── nuxt.config.ts                    # Nuxt 配置
├── app.vue                           # 根组件
├── pages/
│   └── index.vue                     # 主页面（布局）
├── components/
│   ├── AppHeader.vue                 # 顶部导航 + 模式切换
│   ├── ChatPanel.vue                 # 聊天面板
│   └── PreviewPanel.vue              # 预览面板
└── composables/
    └── useWebContainer.ts            # WebContainer 封装
```

---

## 任务清单

### Task 1: 初始化 Nuxt 4 应用

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/nuxt.config.ts`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/app.vue`

- [ ] **Step 1: 创建 apps/web/package.json**

```json
{
  "name": "@openworld/web",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "nuxt dev",
    "build": "nuxt build",
    "generate": "nuxt generate"
  },
  "dependencies": {
    "@webcontainer/api": "^1.5.0",
    "nuxt": "^4.0.0",
    "vue": "^3.5.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.0.0"
  }
}
```

- [ ] **Step 2: 创建 apps/web/nuxt.config.ts**

```typescript
export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devtools: { enabled: true },
  app: {
    head: {
      title: 'OpenWorld Chat IDE',
    },
  },
})
```

- [ ] **Step 3: 创建 apps/web/tsconfig.json**

```json
{
  "extends": "../../tsconfig.json"
}
```

- [ ] **Step 4: 创建 apps/web/app.vue**

```vue
<template>
  <div>
    <NuxtPage />
  </div>
</template>
```

- [ ] **Step 5: 提交**

```bash
git add apps/web/package.json apps/web/nuxt.config.ts apps/web/tsconfig.json apps/web/app.vue
git commit -m "feat(web): 初始化 Nuxt 4 应用"
```

---

### Task 2: 创建主页面布局

**Files:**
- Create: `apps/web/pages/index.vue`

- [ ] **Step 1: 创建左右分栏布局**

```vue
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
```

- [ ] **Step 2: 提交**

```bash
git add apps/web/pages/index.vue
git commit -m "feat(web): 添加主页面左右分栏布局"
```

---

### Task 3: 创建 AppHeader 组件

**Files:**
- Create: `apps/web/components/AppHeader.vue`

- [ ] **Step 1: 创建 AppHeader 组件**

```vue
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
```

- [ ] **Step 2: 提交**

```bash
git add apps/web/components/AppHeader.vue
git commit -m "feat(web): 添加 AppHeader 组件和模式切换"
```

---

### Task 4: 创建 ChatPanel 组件

**Files:**
- Create: `apps/web/components/ChatPanel.vue`

- [ ] **Step 1: 创建 ChatPanel 组件**

```vue
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
```

- [ ] **Step 2: 提交**

```bash
git add apps/web/components/ChatPanel.vue
git commit -m "feat(web): 添加 ChatPanel 组件"
```

---

### Task 5: 创建 PreviewPanel 组件

**Files:**
- Create: `apps/web/components/PreviewPanel.vue`

- [ ] **Step 1: 创建 PreviewPanel 组件**

```vue
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
```

- [ ] **Step 2: 提交**

```bash
git add apps/web/components/PreviewPanel.vue
git commit -m "feat(web): 添加 PreviewPanel 组件"
```

---

### Task 6: 创建 WebContainer Composable

**Files:**
- Create: `apps/web/composables/useWebContainer.ts`

- [ ] **Step 1: 创建 useWebContainer.ts**

```typescript
import { WebContainer } from '@webcontainer/api'

let wcInstance: WebContainer | null = null
let serverUrl: string | null = null

export function useWebContainer() {
  const isReady = ref(false)
  const error = ref<string | null>(null)

  async function boot() {
    try {
      wcInstance = await WebContainer.boot()
      isReady.value = true
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to boot WebContainer'
    }
  }

  async function writeFile(path: string, content: string) {
    if (!wcInstance) throw new Error('WebContainer not initialized')
    await wcInstance.fs.writeFile(path, content)
  }

  async function startDevServer() {
    if (!wcInstance) throw new Error('WebContainer not initialized')
    
    await wcInstance.spawn('npx', ['vite', '--port', '3000'])
    
    wcInstance.on('server-ready', (port, url) => {
      serverUrl = url
    })
  }

  function getServerUrl() {
    return serverUrl
  }

  onUnmounted(async () => {
    if (wcInstance) {
      await wcInstance.teardown()
      wcInstance = null
      serverUrl = null
    }
  })

  return {
    isReady: readonly(isReady),
    error: readonly(error),
    boot,
    writeFile,
    startDevServer,
    getServerUrl,
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add apps/web/composables/useWebContainer.ts
git commit -m "feat(web): 添加 WebContainer composable"
```

---

### Task 7: 代码模式布局

**Files:**
- Modify: `apps/web/pages/index.vue`

- [ ] **Step 1: 更新 index.vue 支持代码模式**

```vue
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
```

- [ ] **Step 2: 提交**

```bash
git add apps/web/pages/index.vue
git commit -m "feat(web): 添加代码模式布局"
```

---

### Task 8: 安装依赖并验证

**Files:**
- Modify: `apps/web/package.json` (添加 WebContainer 类型)

- [ ] **Step 1: 添加 @types/webcontainer-api**

```bash
cd apps/web && pnpm add @webcontainer/api @types/node
```

- [ ] **Step 2: 验证构建**

```bash
cd apps/web && pnpm dev
```

预期：Nuxt 开发服务器启动成功

- [ ] **Step 3: 提交**

```bash
git add apps/web/package.json pnpm-lock.yaml
git commit -m "chore(web): 安装 WebContainer 依赖"
```

---

## 验证清单

- [ ] 左右分栏布局正常显示
- [ ] 模式切换按钮正常工作
- [ ] 聊天面板可以发送消息
- [ ] 预览面板显示占位
- [ ] 代码模式下编辑器区域显示

---

**Plan complete and saved to `docs/superpowers/plans/2026-03-29-openworld-chat-ide-p0-plan.md`**

**Two execution options:**

1. **Subagent-Driven (recommended)** - 任务逐个执行，任务间可审查
2. **Inline Execution** - 当前 session 内批量执行

选择哪个方式？