# OpenCode Web 控制台实施指南 (极简版)

> 版本: 2.0.0  
> 日期: 2026-03-29  
> 原则: 开源 + 极简

---

## 1. 项目初始化

### 1.1 创建项目

```bash
# 初始化 Nuxt 4 项目
npx nuxi@latest init opencode-web
cd opencode-web

# 安装核心依赖
pnpm add @opencode-ai/sdk prisma @prisma/client
pnpm add -D prisma
```

### 1.2 配置 Prisma

```bash
# 初始化 Prisma (选择 SQLite)
pnpm prisma init --datasource-provider sqlite
```

```prisma
// prisma/schema.prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id        String    @id @default(cuid())
  email     String    @unique
  password  String
  name      String?
  projects  Project[]
  createdAt DateTime  @default(now())
}

model Project {
  id        String    @id @default(cuid())
  name      String
  userId    String
  user      User      @relation(fields: [userId], references: [id])
  createdAt DateTime  @default(now())
}
```

```bash
# 创建数据库
pnpm prisma db push
```

---

## 2. Prisma 客户端

```typescript
// server/utils/prisma.ts
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export { prisma }
```

---

## 3. 状态管理 (Nuxt useState)

### 3.1 消息状态

```typescript
// composables/useMessages.ts

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolParts: ToolPart[]
  createdAt: number
}

export interface ToolPart {
  id: string
  tool: string
  input: Record<string, any>
  output?: string
  status: 'pending' | 'running' | 'success' | 'error'
  error?: string
}

export const useMessages = () => {
  const messages = useState<Message[]>('messages', () => [])
  const streaming = useState<Message | null>('streaming', () => null)

  function addMessage(msg: Message) {
    messages.value.push(msg)
  }

  function setStreaming(msg: Message | null) {
    streaming.value = msg
  }

  function appendContent(content: string) {
    if (streaming.value) {
      streaming.value.content += content
    }
  }

  function updateToolPart(id: string, updates: Partial<ToolPart>) {
    if (!streaming.value) return
    const idx = streaming.value.toolParts.findIndex(p => p.id === id)
    if (idx >= 0) {
      streaming.value.toolParts[idx] = { ...streaming.value.toolParts[idx], ...updates }
    }
  }

  function completeStreaming() {
    if (streaming.value) {
      messages.value.push(streaming.value)
      streaming.value = null
    }
  }

  function clear() {
    messages.value = []
    streaming.value = null
  }

  return {
    messages: readonly(messages),
    streaming: readonly(streaming),
    addMessage,
    setStreaming,
    appendContent,
    updateToolPart,
    completeStreaming,
    clear,
  }
}
```

### 3.2 项目状态

```typescript
// composables/useProjects.ts

export interface Project {
  id: string
  name: string
  userId: string
  createdAt: Date
}

export const useProjects = () => {
  const projects = useState<Project[]>('projects', () => [])
  const currentId = useState<string | null>('currentProjectId', () => null)

  const current = computed(() =>
    projects.value.find(p => p.id === currentId.value) ?? null
  )

  const opencodeDir = computed(() => {
    if (!current.value) return null
    return `/users/${current.value.userId}/projects/${current.value.id}`
  })

  async function load() {
    projects.value = await $fetch('/api/projects')
  }

  async function create(name: string) {
    const p = await $fetch('/api/projects', {
      method: 'POST',
      body: { name },
    })
    projects.value.push(p)
    return p
  }

  function switchTo(id: string) {
    currentId.value = id
  }

  async function remove(id: string) {
    await $fetch(`/api/projects/${id}`, { method: 'DELETE' })
    projects.value = projects.value.filter(p => p.id !== id)
    if (currentId.value === id) {
      currentId.value = null
    }
  }

  return {
    projects: readonly(projects),
    current,
    currentId: readonly(currentId),
    opencodeDir,
    load,
    create,
    switchTo,
    remove,
  }
}
```

### 3.3 认证状态

```typescript
// composables/useAuth.ts

export const useAuth = () => {
  const user = useState<{ id: string; email: string; name?: string } | null>('user', () => null)
  const isAuthenticated = computed(() => !!user.value)

  async function login(email: string, password: string) {
    const res = await $fetch('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    })
    user.value = res.user
    return res
  }

  async function register(email: string, password: string, name?: string) {
    const res = await $fetch('/api/auth/register', {
      method: 'POST',
      body: { email, password, name },
    })
    user.value = res.user
    return res
  }

  async function logout() {
    await $fetch('/api/auth/logout', { method: 'POST' })
    user.value = null
  }

  async function fetchUser() {
    try {
      const res = await $fetch('/api/auth/me')
      user.value = res.user
    } catch {
      user.value = null
    }
  }

  return {
    user: readonly(user),
    isAuthenticated,
    login,
    register,
    logout,
    fetchUser,
  }
}
```

---

## 4. ToolRegistry 系统

### 4.1 核心实现

```typescript
// composables/useToolRegistry.ts
import type { Component } from 'vue'

export interface ToolComponent {
  (props: {
    input: Record<string, any>
    tool: string
    output?: string
    status: 'pending' | 'running' | 'success' | 'error'
    error?: string
  }): Component
}

const registry: Record<string, ToolComponent> = {}

export function useToolRegistry() {
  function register(name: string, component: ToolComponent) {
    registry[name] = component
  }

  function render(name: string): ToolComponent | undefined {
    return registry[name]
  }

  function has(name: string): boolean {
    return name in registry
  }

  return { register, render, has, registry }
}
```

### 4.2 工具卡片组件

#### BasicTool.vue (基础卡片)

```vue
<!-- components/tool/BasicTool.vue -->
<template>
  <div class="tool-card" :class="{ 'tool-error': status === 'error' }">
    <button class="tool-header" @click="open = !open">
      <span class="tool-icon">{{ icon || '🔧' }}</span>
      <span class="tool-title">{{ title }}</span>
      <span v-if="subtitle" class="tool-subtitle">{{ subtitle }}</span>
      <span v-if="status" class="tool-status" :class="status">{{ status }}</span>
      <span class="tool-chevron" :class="{ open }">▼</span>
    </button>
    <div v-show="open" class="tool-content">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  icon?: string
  title: string
  subtitle?: string
  status?: string
}>()

const open = ref(true)
</script>

<style scoped>
.tool-card {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  margin: 8px 0;
  overflow: hidden;
}

.tool-header {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: #f9fafb;
  border: none;
  cursor: pointer;
  text-align: left;
}

.tool-header:hover {
  background: #f3f4f6;
}

.tool-icon {
  font-size: 16px;
}

.tool-title {
  font-weight: 500;
  color: #111827;
}

.tool-subtitle {
  flex: 1;
  color: #6b7280;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tool-status {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 9999px;
  background: #e5e7eb;
  color: #374151;
}

.tool-status.success { background: #d1fae5; color: #065f46; }
.tool-status.error { background: #fee2e2; color: #991b1b; }
.tool-status.running { background: #dbeafe; color: #1e40af; }

.tool-chevron {
  transition: transform 0.2s;
  color: #9ca3af;
}

.tool-chevron.open {
  transform: rotate(180deg);
}

.tool-content {
  padding: 12px;
  background: white;
  border-top: 1px solid #e5e7eb;
}
</style>
```

#### GenericTool.vue (通用后备)

```vue
<!-- components/tool/GenericTool.vue -->
<script setup lang="ts">
import BasicTool from './BasicTool.vue'

const props = defineProps<{
  tool: string
  input?: Record<string, any>
  output?: string
  status?: string
}>()

const title = computed(() => `Tool: ${props.tool}`)
const subtitle = computed(() => JSON.stringify(props.input ?? {}))
</script>

<template>
  <BasicTool icon="🔧" :title="title" :subtitle="subtitle" :status="status">
    <pre class="output">{{ output || 'No output' }}</pre>
  </BasicTool>
</template>

<style scoped>
.output {
  font-size: 13px;
  background: #f9fafb;
  padding: 8px;
  border-radius: 4px;
  overflow-x: auto;
}
</style>
```

#### BashToolCard.vue

```vue
<!-- components/tool/BashToolCard.vue -->
<script setup lang="ts">
import BasicTool from './BasicTool.vue'

const props = defineProps<{
  input: { command: string; workdir?: string }
  output?: string
  status?: string
}>()

const command = computed(() => props.input?.command ?? '')

function stripAnsi(str: string): string {
  return str.replace(/\x1B\[[0-9;]*[mK]/g, '')
}
</script>

<template>
  <BasicTool icon="⚡" title="Bash" :subtitle="command" :status="status">
    <div class="bash-output">
      <code class="command">$ {{ command }}</code>
      <pre v-if="output" class="output">{{ stripAnsi(output) }}</pre>
    </div>
  </BasicTool>
</template>

<style scoped>
.bash-output {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.command {
  color: #059669;
  font-weight: 500;
}

.output {
  font-size: 13px;
  background: #1f2937;
  color: #f9fafb;
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
  margin: 0;
}
</style>
```

#### ReadToolCard.vue

```vue
<!-- components/tool/ReadToolCard.vue -->
<script setup lang="ts">
import BasicTool from './BasicTool.vue'

const props = defineProps<{
  input: { filePath: string }
  output?: string
  status?: string
}>()

const filename = computed(() => {
  const parts = (props.input?.filePath ?? '').split('/')
  return parts[parts.length - 1] || props.input?.filePath
})
</script>

<template>
  <BasicTool icon="📄" title="Read" :subtitle="filename" :status="status">
    <div class="file-info">
      <span class="filepath">{{ input.filePath }}</span>
    </div>
    <pre class="content">{{ output || '(empty)' }}</pre>
  </BasicTool>
</template>

<style scoped>
.file-info {
  margin-bottom: 8px;
}

.filepath {
  font-size: 12px;
  color: #6b7280;
}

.content {
  font-size: 13px;
  background: #f9fafb;
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
  margin: 0;
}
</style>
```

#### EditToolCard.vue

```vue
<!-- components/tool/EditToolCard.vue -->
<script setup lang="ts">
import BasicTool from './BasicTool.vue'

const props = defineProps<{
  input: { filePath: string; oldString: string; newString: string }
  status?: string
}>()

const filename = computed(() => {
  const parts = (props.input?.filePath ?? '').split('/')
  return parts[parts.length - 1]
})
</script>

<template>
  <BasicTool icon="✏️" title="Edit" :subtitle="filename" :status="status">
    <div class="diff-view">
      <div class="diff-line removed">
        <span>- {{ input.oldString }}</span>
      </div>
      <div class="diff-line added">
        <span>+ {{ input.newString }}</span>
      </div>
    </div>
  </BasicTool>
</template>

<style scoped>
.diff-view {
  font-family: monospace;
  font-size: 13px;
}

.diff-line {
  padding: 4px 8px;
  border-radius: 4px;
  margin: 4px 0;
}

.diff-line.removed {
  background: #fee2e2;
  color: #991b1b;
}

.diff-line.added {
  background: #d1fae5;
  color: #065f46;
}
</style>
```

#### WriteToolCard.vue

```vue
<!-- components/tool/WriteToolCard.vue -->
<script setup lang="ts">
import BasicTool from './BasicTool.vue'

const props = defineProps<{
  input: { filePath: string; content: string }
  status?: string
}>()

const filename = computed(() => {
  const parts = (props.input?.filePath ?? '').split('/')
  return parts[parts.length - 1]
})
</script>

<template>
  <BasicTool icon="📝" title="Write" :subtitle="filename" :status="status">
    <div class="file-preview">
      <pre>{{ input.content }}</pre>
    </div>
  </BasicTool>
</template>

<style scoped>
.file-preview pre {
  font-size: 13px;
  background: #f9fafb;
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
  margin: 0;
}
</style>
```

### 4.3 注册工具

```typescript
// plugins/toolRegistry.client.ts
import { useToolRegistry } from '~/composables/useToolRegistry'
import GenericTool from '~/components/tool/GenericTool.vue'
import BashToolCard from '~/components/tool/BashToolCard.vue'
import ReadToolCard from '~/components/tool/ReadToolCard.vue'
import EditToolCard from '~/components/tool/EditToolCard.vue'
import WriteToolCard from '~/components/tool/WriteToolCard.vue'

export default defineNuxtPlugin(() => {
  const { register } = useToolRegistry()

  register('bash', BashToolCard)
  register('read', ReadToolCard)
  register('edit', EditToolCard)
  register('write', WriteToolCard)
  register('glob', GenericTool)
  register('grep', GenericTool)
})
```

---

## 5. 消息组件

### 5.1 ToolPartDisplay

```vue
<!-- components/message/ToolPartDisplay.vue -->
<script setup lang="ts">
import { useToolRegistry } from '~/composables/useToolRegistry'
import GenericTool from '~/components/tool/GenericTool.vue'
import type { ToolPart } from '~/composables/useMessages'

const props = defineProps<{
  toolPart: ToolPart
}>()

const { render } = useToolRegistry()

const Component = computed(() => {
  return render(props.toolPart.tool) ?? GenericTool
})
</script>

<template>
  <component
    :is="Component"
    :input="toolPart.input"
    :tool="toolPart.tool"
    :output="toolPart.output"
    :status="toolPart.status"
    :error="toolPart.error"
  />
</template>
```

### 5.2 MessageList

```vue
<!-- components/message/MessageList.vue -->
<script setup lang="ts">
import { useMessages } from '~/composables/useMessages'
import ToolPartDisplay from './ToolPartDisplay.vue'

const { messages, streaming } = useMessages()
</script>

<template>
  <div class="message-list">
    <div
      v-for="msg in messages"
      :key="msg.id"
      class="message"
      :class="msg.role"
    >
      <div class="message-content">
        <template v-if="msg.role === 'user'">
          {{ msg.content }}
        </template>
        <template v-else>
          <div v-if="msg.content" class="assistant-content">
            {{ msg.content }}
          </div>
          <div v-if="msg.toolParts.length" class="tool-parts">
            <ToolPartDisplay
              v-for="tp in msg.toolParts"
              :key="tp.id"
              :tool-part="tp"
            />
          </div>
        </template>
      </div>
    </div>

    <div v-if="streaming" class="message assistant streaming">
      <div class="message-content">
        <div v-if="streaming.content" class="assistant-content">
          {{ streaming.content }}
        </div>
        <div v-if="streaming.toolParts.length" class="tool-parts">
          <ToolPartDisplay
            v-for="tp in streaming.toolParts"
            :key="tp.id"
            :tool-part="tp"
          />
        </div>
        <span class="typing-indicator">...</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.message-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.message {
  max-width: 100%;
}

.message.user {
  text-align: right;
}

.message-content {
  display: inline-block;
  padding: 12px 16px;
  border-radius: 12px;
  text-align: left;
}

.message.user .message-content {
  background: #3b82f6;
  color: white;
}

.message.assistant .message-content {
  background: #f3f4f6;
  color: #111827;
}

.tool-parts {
  margin-top: 12px;
}

.typing-indicator {
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
</style>
```

---

## 6. API 端点

### 6.1 认证

```typescript
// server/api/auth/login.post.ts
import { prisma } from '~/server/utils/prisma'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { email, password } = body

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user || user.password !== password) {
    throw createError({ statusCode: 401, message: 'Invalid credentials' })
  }

  return {
    user: { id: user.id, email: user.email, name: user.name },
  }
})
```

```typescript
// server/api/auth/register.post.ts
import { prisma } from '~/server/utils/prisma'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { email, password, name } = body

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    throw createError({ statusCode: 400, message: 'Email already exists' })
  }

  const user = await prisma.user.create({
    data: { email, password, name },
  })

  return {
    user: { id: user.id, email: user.email, name: user.name },
  }
})
```

### 6.2 项目管理

```typescript
// server/api/projects/index.get.ts
import { prisma } from '~/server/utils/prisma'

export default defineEventHandler(async (event) => {
  const user = await getUser(event)
  const projects = await prisma.project.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  })
  return projects
})
```

```typescript
// server/api/projects/index.post.ts
import { prisma } from '~/server/utils/prisma'

export default defineEventHandler(async (event) => {
  const user = await getUser(event)
  const body = await readBody(event)

  const project = await prisma.project.create({
    data: {
      name: body.name,
      userId: user.id,
    },
  })

  // 创建用户目录
  const dir = `/users/${user.id}/projects/${project.id}/workspace`
  // TODO: 在实际文件系统中创建目录

  return project
})
```

### 6.3 OpenCode 代理

```typescript
// server/api/opencode/sse.get.ts
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const { sessionId, directory } = query

  const config = useRuntimeConfig()
  const url = `${config.opencodeApiUrl}/sse?sessionId=${sessionId}&directory=${directory}`

  const stream = await fetch(url, {
    headers: {
      'Accept': 'text/event-stream',
    },
  })

  return sendStream(event, stream.body!, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
})
```

```typescript
// server/api/opencode/chat.post.ts
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { content, directory } = body

  const config = useRuntimeConfig()

  const response = await fetch(`${config.opencodeApiUrl}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-opencode-directory': directory,
    },
    body: JSON.stringify({ content }),
  })

  return response.json()
})
```

---

## 7. 页面

### 7.1 登录页

```vue
<!-- pages/index.vue -->
<script setup lang="ts">
const { login, register, isAuthenticated, fetchUser } = useAuth()

const isLogin = ref(true)
const email = ref('')
const password = ref('')
const name = ref('')

onMounted(async () => {
  await fetchUser()
  if (isAuthenticated.value) {
    navigateTo('/projects')
  }
})

async function handleSubmit() {
  try {
    if (isLogin.value) {
      await login(email.value, password.value)
    } else {
      await register(email.value, password.value, name.value)
    }
    navigateTo('/projects')
  } catch (e: any) {
    alert(e.data?.message || 'Error')
  }
}
</script>

<template>
  <div class="auth-page">
    <h1>OpenCode Web</h1>
    
    <form @submit.prevent="handleSubmit">
      <h2>{{ isLogin ? 'Login' : 'Register' }}</h2>
      
      <input v-model="email" type="email" placeholder="Email" required />
      <input v-model="password" type="password" placeholder="Password" required />
      <input v-if="!isLogin" v-model="name" type="text" placeholder="Name" />
      
      <button type="submit">{{ isLogin ? 'Login' : 'Register' }}</button>
    </form>
    
    <button @click="isLogin = !isLogin">
      Switch to {{ isLogin ? 'Register' : 'Login' }}
    </button>
  </div>
</template>

<style scoped>
.auth-page {
  max-width: 400px;
  margin: 100px auto;
  padding: 24px;
  text-align: center;
}

form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 24px 0;
}

input {
  padding: 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
}

button {
  padding: 12px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
</style>
```

### 7.2 项目列表页

```vue
<!-- pages/projects.vue -->
<script setup lang="ts">
const { projects, load, create, switchTo, remove } = useProjects()
const { isAuthenticated } = useAuth()

const showNew = ref(false)
const newName = ref('')

onMounted(async () => {
  if (!isAuthenticated.value) {
    navigateTo('/')
    return
  }
  await load()
})

async function handleCreate() {
  if (!newName.value.trim()) return
  await create(newName.value)
  newName.value = ''
  showNew.value = false
}
</script>

<template>
  <div class="projects-page">
    <header>
      <h1>Projects</h1>
      <button @click="showNew = !showNew">New Project</button>
    </header>

    <div v-if="showNew" class="new-project">
      <input v-model="newName" placeholder="Project name" @keyup.enter="handleCreate" />
      <button @click="handleCreate">Create</button>
    </div>

    <div class="project-list">
      <div v-for="project in projects" :key="project.id" class="project-card">
        <div @click="switchTo(project.id); navigateTo(`/project/${project.id}`)">
          <h3>{{ project.name }}</h3>
          <p>{{ new Date(project.createdAt).toLocaleDateString() }}</p>
        </div>
        <button @click.stop="remove(project.id)">Delete</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.projects-page {
  max-width: 800px;
  margin: 40px auto;
  padding: 24px;
}

header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.project-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 16px;
}

.project-card {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
  cursor: pointer;
}

.project-card:hover {
  border-color: #3b82f6;
}
</style>
```

### 7.3 项目工作区

```vue
<!-- pages/project/[id].vue -->
<script setup lang="ts">
const route = useRoute()
const projectId = route.params.id as string

const { current, opencodeDir, switchTo } = useProjects()
const { messages, streaming, setStreaming, appendContent, updateToolPart, completeStreaming, clear } = useMessages()
const { isAuthenticated } = useAuth()

const input = ref('')

onMounted(async () => {
  if (!isAuthenticated.value) {
    navigateTo('/')
    return
  }
  switchTo(projectId)
  clear()
})

async function sendMessage() {
  if (!input.value.trim() || !opencodeDir.value) return

  const content = input.value
  input.value = ''

  setStreaming({
    id: crypto.randomUUID(),
    role: 'assistant',
    content: '',
    toolParts: [],
    createdAt: Date.now(),
  })

  try {
    const response = await fetch('/api/opencode/chat', {
      method: 'POST',
      body: JSON.stringify({
        content,
        directory: opencodeDir.value,
      }),
    })

    const reader = response.body?.getReader()
    const decoder = new TextDecoder()

    if (reader) {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const text = decoder.decode(value)
        const lines = text.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6))
            
            if (data.type === 'content') {
              appendContent(data.content)
            } else if (data.type === 'tool') {
              updateToolPart(data.id, data)
            } else if (data.type === 'done') {
              completeStreaming()
            }
          }
        }
      }
    }
  } catch (e) {
    console.error('Error:', e)
    completeStreaming()
  }
}
</script>

<template>
  <div class="workspace">
    <header>
      <h1>{{ current?.name || 'Project' }}</h1>
      <NuxtLink to="/projects">← Back</NuxtLink>
    </header>

    <MessageList />

    <div class="input-area">
      <textarea
        v-model="input"
        placeholder="Send a message..."
        @keydown.enter.exact.prevent="sendMessage"
      />
      <button @click="sendMessage">Send</button>
    </div>
  </div>
</template>

<style scoped>
.workspace {
  height: 100vh;
  display: flex;
  flex-direction: column;
  max-width: 900px;
  margin: 0 auto;
  padding: 20px;
}

header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.input-area {
  margin-top: auto;
  display: flex;
  gap: 12px;
}

textarea {
  flex: 1;
  padding: 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  resize: none;
  height: 60px;
}
</style>
```

---

## 8. 验证清单

- [ ] 项目启动: `pnpm dev`
- [ ] 数据库创建: `pnpm prisma db push`
- [ ] 用户注册/登录
- [ ] 创建项目
- [ ] 发送消息，收到 SSE 响应
- [ ] 工具卡片正确渲染

---

## 9. 常见问题

### 9.1 SSE 不工作

检查 OpenCode 服务器是否运行在 4096 端口。

### 9.2 工具卡片不显示

确认在 `plugins/toolRegistry.client.ts` 中已注册。

### 9.3 目录权限错误

确保 `/users/{userId}/projects/{projectId}/workspace` 目录存在且可写。
