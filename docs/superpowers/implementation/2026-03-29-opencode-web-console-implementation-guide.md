# OpenCode Web 控制台实施指南

> 版本: 1.0.0  
> 日期: 2026-03-29  
> 文档类型: 实施指南

---

## 1. 环境准备

### 1.1 系统要求

- Node.js >= 20.0.0
- pnpm >= 8.0.0
- SQLite (开发环境)
- PostgreSQL (生产环境)
- systemd (Linux 服务器)

### 1.2 初始化项目

```bash
# 创建 Nuxt 4 项目
npx nuxi@latest init opencode-web
cd opencode-web

# 安装依赖
pnpm install

# 安装核心依赖
pnpm add @opencode-ai/sdk better-auth drizzle-orm pinia @pinia/nuxt
pnpm add -D drizzle-kit better-auth-dev-adapter-sqlite
```

---

## 2. Phase 1: 项目初始化

### 2.1 Nuxt 配置

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@pinia/nuxt', 'shadcn-nuxt'],
  
  shadcn: {
    components: ['ui/button', 'ui/input', 'ui/collapsible', 'ui/badge'],
  },

  nitro: {
    experimental: {
      websocket: true,
    },
  },

  runtimeConfig: {
    opencodeApiUrl: process.env.OPENCODE_API_URL || 'http://localhost:4096',
  },
})
```

### 2.2 Drizzle ORM 配置

```typescript
// drizzle/schema.ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  description: text('description'),
  opencodeDir: text('opencode_dir').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  name: text('name').notNull(),
  opencodeSessionId: text('opencode_session_id'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})
```

```typescript
// drizzle/index.ts
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from './schema'

export const db = drizzle({
  schema,
  url: process.env.DATABASE_URL || 'file:./dev.db',
})
```

### 2.3 Better Auth 配置

```typescript
// auth/[...].ts
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { db } from '~/drizzle'

export const { auth, authHandler } = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'sqlite',
  }),
  emailAndPassword: {
    enabled: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
  },
})
```

---

## 3. Phase 2: OpenCode 集成

### 3.1 OpenCode SDK 封装

```typescript
// composables/useOpencode.ts
import { OpenCode } from '@opencode-ai/sdk'

export function useOpencode() {
  const config = useRuntimeConfig()
  
  const client = new OpenCode({
    baseURL: config.opencodeApiUrl,
    directory: useUserDirectory(), // /users/{userId}/projects/{projectId}/
  })

  return {
    client,
    async sendMessage(content: string) {
      return client.chat.send({ content })
    },
    async *streamMessage(content: string) {
      const response = await client.chat.send({ content })
      for await (const part of response.parts()) {
        yield part
      }
    },
  }
}

function useUserDirectory(): string {
  const authStore = useAuthStore()
  const projectStore = useProjectStore()
  return `/users/${authStore.user?.id}/projects/${projectStore.currentProject?.id}`
}
```

### 3.2 SSE 实时流

```typescript
// composables/useOpencodeSSE.ts
import { useMessageStore } from '~/stores/message'

export function useOpencodeSSE(sessionId: Ref<string>) {
  const messageStore = useMessageStore()
  let eventSource: EventSource | null = null

  function connect() {
    const config = useRuntimeConfig()
    const projectStore = useProjectStore()
    
    eventSource = new EventSource(
      `${config.public.apiBase}/opencode/sse?sessionId=${sessionId.value}&directory=/users/${projectStore.currentProject?.id}`
    )

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data)
      
      if (data.type === 'tool') {
        messageStore.updateToolPart(data.id, data)
      } else if (data.type === 'message') {
        messageStore.appendStreamingContent(data.content)
      } else if (data.type === 'complete') {
        messageStore.completeStreamingMessage()
      }
    }
  }

  function disconnect() {
    eventSource?.close()
    eventSource = null
  }

  onUnmounted(() => disconnect())

  return { connect, disconnect }
}
```

### 3.3 服务端代理

```typescript
// server/api/opencode/sse.get.ts
import { OpenCode } from '@opencode-ai/sdk'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const { sessionId, directory } = query

  const config = useRuntimeConfig()
  
  const client = new OpenCode({
    baseURL: config.opencodeApiUrl,
    directory: directory as string,
  })

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      
      try {
        for await (const part of client.chat.stream()) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(part)}\n\n`))
        }
      } finally {
        controller.close()
      }
    },
  })

  return sendStream(event, stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
})
```

---

## 4. Phase 3: 状态管理

### 4.1 useAuthStore

```typescript
// stores/auth.ts
import { defineStore } from 'pinia'
import type { User } from 'better-auth'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const isAuthenticated = computed(() => !!user.value)

  async function fetchUser() {
    try {
      const { data } = await useFetch('/api/auth/session')
      user.value = data.value
    } catch {
      user.value = null
    }
  }

  async function login(email: string, password: string) {
    await $fetch('/api/auth/sign-in', {
      method: 'POST',
      body: { email, password },
    })
    await fetchUser()
  }

  async function logout() {
    await $fetch('/api/auth/sign-out', { method: 'POST' })
    user.value = null
  }

  return { user, isAuthenticated, fetchUser, login, logout }
})
```

### 4.2 useProjectStore

```typescript
// stores/project.ts
import { defineStore } from 'pinia'

export const useProjectStore = defineStore('project', () => {
  const projects = ref<Project[]>([])
  const currentProject = ref<Project | null>(null)
  const sessions = ref<Session[]>([])

  async function loadProjects() {
    projects.value = await $fetch('/api/projects')
  }

  async function createProject(name: string, description?: string) {
    const project = await $fetch('/api/projects', {
      method: 'POST',
      body: { name, description },
    })
    projects.value.push(project)
    return project
  }

  async function switchProject(id: string) {
    currentProject.value = projects.value.find((p) => p.id === id) || null
    if (currentProject.value) {
      await loadSessions(currentProject.value.id)
    }
  }

  async function deleteProject(id: string) {
    await $fetch(`/api/projects/${id}`, { method: 'DELETE' })
    projects.value = projects.value.filter((p) => p.id !== id)
    if (currentProject.value?.id === id) {
      currentProject.value = null
    }
  }

  async function loadSessions(projectId: string) {
    sessions.value = await $fetch(`/api/opencode/sessions?projectId=${projectId}`)
  }

  return {
    projects, currentProject, sessions,
    loadProjects, createProject, switchProject, deleteProject, loadSessions,
  }
})
```

### 4.3 useMessageStore

```typescript
// stores/message.ts
import { defineStore } from 'pinia'
import type { ToolPart, Message } from '@opencode-ai/sdk'

export const useMessageStore = defineStore('message', () => {
  const messages = ref<Message[]>([])
  const streamingMessage = ref<Message | null>(null)
  const pendingTools = ref<ToolPart[]>([])

  function addMessage(message: Message) {
    messages.value.push(message)
  }

  function appendStreamingContent(content: string) {
    if (!streamingMessage.value) {
      streamingMessage.value = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
        parts: [],
        createdAt: Date.now(),
      }
    }
    streamingMessage.value.content += content
  }

  function updateToolPart(id: string, updates: Partial<ToolPart>) {
    if (!streamingMessage.value) return
    
    let toolPart = streamingMessage.value.parts.find((p) => p.id === id)
    if (!toolPart) {
      toolPart = { id, tool: '', input: {}, state: { status: 'pending' }, ...updates }
      streamingMessage.value.parts.push(toolPart)
    }
    
    Object.assign(toolPart, updates)
  }

  function completeStreamingMessage() {
    if (streamingMessage.value) {
      messages.value.push(streamingMessage.value)
      streamingMessage.value = null
    }
  }

  function retryMessage(id: string) {
    const message = messages.value.find((m) => m.id === id)
    if (message) {
      streamingMessage.value = { ...message }
      messages.value = messages.value.filter((m) => m.id !== id)
    }
  }

  function deleteMessage(id: string) {
    messages.value = messages.value.filter((m) => m.id !== id)
  }

  return {
    messages, streamingMessage, pendingTools,
    addMessage, appendStreamingContent, updateToolPart,
    completeStreamingMessage, retryMessage, deleteMessage,
  }
})
```

---

## 5. Phase 4: ToolRegistry UI

### 5.1 ToolRegistry 核心

```typescript
// composables/useToolRegistry.ts
import type { Component } from 'vue'

interface ToolRegistryState {
  name: string
  render?: Component
}

const state: Record<string, ToolRegistryState> = {}

export function registerTool(input: { name: string; render?: Component }) {
  state[input.name] = input
  return input
}

export function getTool(name: string): Component | undefined {
  return state[name]?.render
}

export const ToolRegistry = {
  register: registerTool,
  render: getTool,
}
```

### 5.2 BasicTool 基础组件

```vue
<!-- components/tool/BasicTool.vue -->
<script setup lang="ts">
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '~/components/ui/collapsible'
import { Badge } from '~/components/ui/badge'

const props = defineProps<{
  icon?: string
  title: string
  subtitle?: string
  status?: 'pending' | 'running' | 'success' | 'error'
  defaultOpen?: boolean
}>()

const open = ref(props.defaultOpen ?? false)

const statusVariant = computed(() => {
  switch (props.status) {
    case 'error': return 'destructive'
    case 'running': return 'secondary'
    case 'success': return 'default'
    default: return 'outline'
  }
})
</script>

<template>
  <Collapsible v-model:open="open">
    <CollapsibleTrigger as-child>
      <div class="tool-trigger">
        <Icon :name="icon ?? 'mcp'" class="tool-icon" />
        <div class="tool-info">
          <span class="tool-title">{{ title }}</span>
          <span v-if="subtitle" class="tool-subtitle">{{ subtitle }}</span>
        </div>
        <Badge v-if="status" :variant="statusVariant">{{ status }}</Badge>
        <Icon name="chevron-down" class="collapse-icon" :class="{ rotated: open }" />
      </div>
    </CollapsibleTrigger>
    <CollapsibleContent>
      <div class="tool-content">
        <slot />
      </div>
    </CollapsibleContent>
  </Collapsible>
</template>
```

### 5.3 GenericTool 后备组件

```vue
<!-- components/tool/GenericTool.vue -->
<script setup lang="ts">
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
  <BasicTool icon="mcp" :title="title" :subtitle="subtitle" :status="status">
    <pre class="generic-output">{{ output }}</pre>
  </BasicTool>
</template>

<style scoped>
.generic-output {
  @apply text-sm p-3 bg-muted rounded-md overflow-x-auto;
}
</style>
```

### 5.4 BashToolCard

```vue
<!-- components/tool/BashToolCard.vue -->
<script setup lang="ts">
import { stripAnsi } from '~/utils/ansi'

const props = defineProps<{
  input: { command: string; workdir?: string }
  output?: string
  status?: 'pending' | 'running' | 'success' | 'error'
}>()

const title = computed(() => 'Bash')
const subtitle = computed(() => props.input.command)
</script>

<template>
  <BasicTool icon="console" :title="title" :subtitle="subtitle" :status="status">
    <div class="bash-output">
      <div class="command">
        <span class="prompt">$</span>
        <code>{{ props.input.command }}</code>
      </div>
      <pre v-if="output" class="output">{{ stripAnsi(output) }}</pre>
    </div>
  </BasicTool>
</template>

<style scoped>
.bash-output {
  @apply p-3 space-y-2;
}

.command {
  @apply flex items-center gap-2;
}

.prompt {
  @apply text-green-600 font-bold;
}

.output {
  @apply text-sm bg-muted p-3 rounded-md overflow-x-auto;
}
</style>
```

### 5.5 ReadToolCard

```vue
<!-- components/tool/ReadToolCard.vue -->
<script setup lang="ts">
const props = defineProps<{
  input: { filePath: string }
  output?: string
  status?: 'pending' | 'running' | 'success' | 'error'
}>()

const title = computed(() => 'Read')
const subtitle = computed(() => props.input.filePath)
const filename = computed(() => props.input.filePath.split('/').pop())
</script>

<template>
  <BasicTool icon="glasses" :title="title" :subtitle="subtitle" :status="status">
    <div class="read-output">
      <div class="file-header">
        <Icon name="file-text" />
        <span>{{ filename }}</span>
      </div>
      <pre class="file-content">{{ output }}</pre>
    </div>
  </BasicTool>
</template>

<style scoped>
.read-output {
  @apply p-3;
}

.file-header {
  @apply flex items-center gap-2 text-sm text-muted-foreground mb-2;
}

.file-content {
  @apply text-sm bg-muted p-3 rounded-md overflow-x-auto;
}
</style>
```

### 5.6 EditToolCard (Diff 视图)

```vue
<!-- components/tool/EditToolCard.vue -->
<script setup lang="ts">
const props = defineProps<{
  input: { filePath: string; oldString: string; newString: string }
  status?: 'pending' | 'running' | 'success' | 'error'
}>()

const title = computed(() => 'Edit')
const subtitle = computed(() => props.input.filePath)
</script>

<template>
  <BasicTool icon="code-lines" :title="title" :subtitle="subtitle" :status="status">
    <div class="diff-view">
      <div class="diff-line removed">
        <span class="diff-marker">-</span>
        <code>{{ props.input.oldString }}</code>
      </div>
      <div class="diff-line added">
        <span class="diff-marker">+</span>
        <code>{{ props.input.newString }}</code>
      </div>
    </div>
  </BasicTool>
</template>

<style scoped>
.diff-view {
  @apply p-3 space-y-1 font-mono text-sm;
}

.diff-line {
  @apply flex items-start p-1 rounded;
}

.diff-line.removed {
  @apply bg-red-500/10 text-red-600;
}

.diff-line.added {
  @apply bg-green-500/10 text-green-600;
}

.diff-marker {
  @apply w-4 flex-shrink-0;
}
</style>
```

### 5.7 工具卡片注册

```typescript
// components/tool/index.ts
import BashToolCard from './BashToolCard.vue'
import ReadToolCard from './ReadToolCard.vue'
import EditToolCard from './EditToolCard.vue'
import WriteToolCard from './WriteToolCard.vue'
import GenericTool from './GenericTool.vue'

export function registerToolComponents() {
  ToolRegistry.register({ name: 'bash', render: BashToolCard })
  ToolRegistry.register({ name: 'read', render: ReadToolCard })
  ToolRegistry.register({ name: 'edit', render: EditToolCard })
  ToolRegistry.register({ name: 'write', render: WriteToolCard })
  ToolRegistry.register({ name: 'glob', render: GlobToolCard })
  ToolRegistry.register({ name: 'grep', render: GrepToolCard })
  // ... 其他工具
}
```

---

## 6. Phase 5: 页面与功能

### 6.1 消息列表组件

```vue
<!-- components/message/MessageList.vue -->
<script setup lang="ts">
const messageStore = useMessageStore()

const messages = computed(() => messageStore.messages)
const streamingMessage = computed(() => messageStore.streamingMessage)
</script>

<template>
  <div class="message-list">
    <MessageItem
      v-for="message in messages"
      :key="message.id"
      :message="message"
    />
    
    <MessageItem
      v-if="streamingMessage"
      :message="streamingMessage"
      :streaming="true"
    />
  </div>
</template>
```

### 6.2 ToolPartDisplay 组件

```vue
<!-- components/message/ToolPartDisplay.vue -->
<script setup lang="ts">
import { markRaw } from 'vue'
import GenericTool from '~/components/tool/GenericTool.vue'

const props = defineProps<{
  toolPart: ToolPart
}>()

const ToolComponent = computed(() => {
  const render = ToolRegistry.render(props.toolPart.tool)
  return render ? markRaw(render) : markRaw(GenericTool)
})
</script>

<template>
  <component
    :is="ToolComponent"
    :input="toolPart.input"
    :tool="toolPart.tool"
    :metadata="toolPart.metadata"
    :output="toolPart.state.output"
    :status="toolPart.state.status"
  />
</template>
```

### 6.3 项目工作区页面

```vue
<!-- pages/projects/[projectId]/index.vue -->
<script setup lang="ts">
const route = useRoute()
const projectId = route.params.projectId as string
const messageStore = useMessageStore()
const projectStore = useProjectStore()
const { connect, disconnect } = useOpencodeSSE(computed(() => projectId))

const input = ref('')

onMounted(() => {
  projectStore.switchProject(projectId)
  connect()
})

onUnmounted(() => disconnect())

async function sendMessage() {
  if (!input.value.trim()) return
  
  const content = input.value
  input.value = ''
  
  messageStore.appendStreamingContent('')
  await $fetch('/api/opencode/chat', {
    method: 'POST',
    body: { content, sessionId: projectId },
  })
}
</script>

<template>
  <div class="workspace">
    <div class="workspace-header">
      <h1>{{ projectStore.currentProject?.name }}</h1>
      <ProjectSwitcher />
    </div>
    
    <MessageList class="workspace-messages" />
    
    <div class="workspace-input">
      <Input
        v-model="input"
        placeholder="Send a message..."
        @keydown.enter="sendMessage"
      />
      <Button @click="sendMessage">Send</Button>
    </div>
  </div>
</template>
```

---

## 7. Phase 6: systemd 部署

### 7.1 服务文件

```ini
# /etc/systemd/system/opencode@.service
[Unit]
Description=OpenCode Server for User %i
After=network.target

[Service]
Type=simple
User=%i
WorkingDirectory=/home/%i
ExecStart=/usr/local/bin/opencode serve --port 4096
Environment=OPENCODE_DIRECTORY=/users/%i
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

### 7.2 用户管理脚本

```bash
#!/bin/bash
# scripts/create-opencode-user.sh

USER_ID=$1
USER_HOME=/users/$USER_ID

# 创建目录结构
mkdir -p $USER_HOME/projects
mkdir -p $USER_HOME/.opencode

# 设置权限
chown -R $USER_ID:$USER_ID $USER_HOME

# 启用服务
systemctl enable opencode@$USER_ID
systemctl start opencode@$USER_ID
```

---

## 8. 验证清单

### 8.1 本地开发验证

- [ ] Nuxt 开发服务器启动成功 (pnpm dev)
- [ ] 数据库迁移成功 (pnpm db:migrate)
- [ ] 用户注册/登录功能正常
- [ ] 项目创建/切换/删除功能正常
- [ ] OpenCode SSE 连接正常
- [ ] 工具卡片渲染正常
- [ ] 消息流式输出正常

### 8.2 生产部署验证

- [ ] systemd 服务运行正常
- [ ] nginx 反向代理配置正确
- [ ] HTTPS 证书配置正确
- [ ] 数据库迁移到 PostgreSQL 成功
- [ ] 用户目录权限配置正确

---

## 9. 常见问题

### 9.1 SSE 连接断开

检查 OpenCode 服务器是否正常运行：
```bash
systemctl status opencode@username
```

### 9.2 工具卡片不显示

确认工具已注册：
```typescript
// 在 Nuxt 插件中注册
export default defineNuxtPlugin(() => {
  registerToolComponents()
})
```

### 9.3 权限错误

检查目录权限：
```bash
ls -la /users/{userId}/projects/{projectId}
chown -R opencode:opencode /users/{userId}
```
