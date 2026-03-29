# OpenCode Web 控制台设计方案

> 版本: 2.0.0  
> 日期: 2026-03-29  
> 状态: 草稿  
> 原则: 开源 + 极简

---

## 1. 项目概述

### 1.1 项目背景

将 OpenCode AI 编码助手集成到自定义 Nuxt 4 Web 应用中，提供多用户支持的 Web 界面。

### 1.2 核心目标

1. **极简依赖** - 使用 Nuxt 内置方案，减少外部依赖
2. **工具渲染分离** - 工具执行由 OpenCode 负责，我们只实现 UI 渲染
3. **快速验证** - 最小可用版本先行

### 1.3 设计原则

| 原则 | 说明 |
|------|------|
| 极简主义 | 优先使用框架内置功能 |
| 开源优先 | 所有技术选型均为开源方案 |
| 渐进增强 | 先跑通核心流程，再迭代功能 |
| 职责分离 | OpenCode 管执行，Nuxt 管渲染 |

---

## 2. 技术选型 (极简版)

### 2.1 核心技术栈

| 组件 | 技术 | 说明 |
|------|------|------|
| Web 框架 | Nuxt 4 | Vue 3 + SSR，内置状态管理 |
| 认证 | Nuxt Auth (sidebase) | 轻量开源认证方案 |
| 数据库 | SQLite + Drizzle ORM | 轻量、高效 |
| UI 组件 | 自定义 | 最小集合 |
| 实时通信 | SSE | Nuxt Server 代理 |
| OpenCode | @opencode-ai/sdk | 官方 SDK |

### 2.2 为什么不用...

| 原方案 | 替代方案 | 原因 |
|--------|---------|------|
| Better Auth | sidebase/parse | 太复杂 |
| Pinia | Nuxt useState | 内置足够用 |
| shadcn/ui | 自定义组件 | 减少依赖 |

---

## 3. 系统架构

### 3.1 整体架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                        用户浏览器                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                     Nuxt 4 应用 (Port 3000)                  │   │
│  │                                                              │   │
│  │  ┌────────────┐  ┌────────────┐  ┌──────────────────────┐   │   │
│  │  │ Nuxt Auth  │  │  useState  │  │    ToolRegistry      │   │   │
│  │  │  (认证)   │  │ (状态管理) │  │    (UI组件注册)      │   │   │
│  │  └────────────┘  └────────────┘  └──────────────────────┘   │   │
│  │                                                              │   │
│  │  ┌──────────────────────────────────────────────────────┐   │   │
│  │  │   消息组件层                                           │   │   │
│  │  │   MessageList / ToolPartDisplay / BasicTool           │   │   │
│  │  └──────────────────────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                          HTTP + SSE
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   OpenCode 服务器 (Port 4096)                       │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│   │   工具执行   │  │   会话管理   │  │  MCP管理    │             │
│   │  (内置)     │  │              │  │             │             │
│   └──────────────┘  └──────────────┘  └──────────────┘             │
│                                                                      │
│   用户目录隔离: x-opencode-directory: /users/{userId}/projects/{id}/  │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                          ┌─────────────────────┐
                          │   systemd 管理      │
                          │  opencode.service   │
                          └─────────────────────┘
```

### 3.2 数据流

```
用户输入消息
     │
     ▼
Nuxt Server ──POST──► OpenCode Server (x-opencode-directory header)
     │
     │ SSE 流
     ▼
OpenCode Server ──SSE──► Nuxt Server ──SSE──► 浏览器
     │                                           │
     │ ToolPart:                                 │
     │ {                                        │
     │   tool: "bash",                          │
     │   input: { command: "ls" },              │
     │   state: { status: "success", output }    │
     │ }                                        │
     │                                           ▼
     │                                    ToolRegistry.render("bash")
     │                                           │
     │                                           ▼
     │                                    BashToolCard 组件
```

### 3.3 用户目录隔离

```
/users/{userId}/projects/{projectId}/
├── workspace/               # 项目文件
└── sessions/                # 会话历史
```

---

## 4. 核心模块设计

### 4.1 ToolRegistry UI 注册系统

#### 4.1.1 设计原理

借鉴 OpenCode 桌面端的 ToolRegistry 模式，用 Vue 3 Composition API 实现。

#### 4.1.2 核心代码

```typescript
// composables/useToolRegistry.ts

interface ToolComponent {
  (props: {
    input: Record<string, any>
    tool: string
    output?: string
    status: 'pending' | 'running' | 'success' | 'error'
  }): any
}

const registry: Record<string, ToolComponent> = {}

export function useToolRegistry() {
  function register(name: string, component: ToolComponent) {
    registry[name] = component
  }

  function render(name: string): ToolComponent | undefined {
    return registry[name]
  }

  return { register, render, registry }
}

export const toolRegistry = useToolRegistry()
```

#### 4.1.3 初始工具映射 (最小集)

| 工具 | 组件 | 说明 |
|------|------|------|
| bash | BashToolCard | 命令执行 |
| read | ReadToolCard | 文件读取 |
| edit | EditToolCard | 文件编辑 |
| write | WriteToolCard | 文件写入 |
| glob | GenericTool | 文件搜索 (通用) |
| grep | GenericTool | 代码搜索 (通用) |
| * | GenericTool | 后备组件 |

**后期可扩展**: webfetch, websearch, task, todowrite, skill 等

### 4.2 工具卡片组件

#### 4.2.1 组件结构

```
components/
├── tool/
│   ├── BasicTool.vue       # 基础卡片 (折叠/展开)
│   ├── GenericTool.vue     # 通用后备卡片
│   ├── BashToolCard.vue    # Bash 命令
│   ├── ReadToolCard.vue    # 读取文件
│   ├── EditToolCard.vue    # 编辑文件 (Diff)
│   └── WriteToolCard.vue   # 写入文件
└── message/
    ├── MessageList.vue     # 消息列表
    ├── MessageItem.vue     # 单条消息
    └── ToolPartDisplay.vue # 工具展示入口
```

#### 4.2.2 BasicTool 基础卡片

```vue
<!-- components/tool/BasicTool.vue -->
<template>
  <div class="tool-card" :class="{ 'tool-error': status === 'error' }">
    <button class="tool-header" @click="toggle">
      <span class="tool-icon">{{ icon }}</span>
      <span class="tool-title">{{ title }}</span>
      <span class="tool-subtitle">{{ subtitle }}</span>
      <span v-if="status" class="tool-status">{{ status }}</span>
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

const open = ref(false)
function toggle() { open.value = !open.value }
</script>
```

#### 4.2.3 GenericTool 后备组件

```vue
<!-- components/tool/GenericTool.vue -->
<template>
  <BasicTool :icon="icon" :title="title" :subtitle="subtitle" :status="status">
    <pre class="tool-output">{{ output || 'No output' }}</pre>
  </BasicTool>
</template>

<script setup lang="ts">
defineProps<{
  tool: string
  input?: Record<string, any>
  output?: string
  status?: string
}>()

const icon = '🔧'
const title = computed(() => `Tool: ${props.tool}`)
const subtitle = computed(() => JSON.stringify(props.input ?? {}))
</script>
```

#### 4.2.4 BashToolCard

```vue
<!-- components/tool/BashToolCard.vue -->
<template>
  <BasicTool icon="⚡" title="Bash" :subtitle="command" :status="status">
    <div class="bash-output">
      <code class="command">$ {{ command }}</code>
      <pre class="output">{{ stripAnsi(output) }}</pre>
    </div>
  </BasicTool>
</template>

<script setup lang="ts">
const props = defineProps<{
  input: { command: string }
  output?: string
  status?: string
}>()

const command = computed(() => props.input?.command ?? '')

function stripAnsi(str: string) {
  return str.replace(/\x1B\[[0-9;]*[mK]/g, '')
}
</script>
```

### 4.3 消息渲染流程

```
ToolPart (from SSE)
      │
      ▼
ToolPartDisplay.vue
      │
      ▼
toolRegistry.render(tool)
      │
      ├── found ──► BashToolCard / ReadToolCard / ...
      │
      └── not found ──► GenericTool
```

---

## 5. 状态管理 (极简版)

使用 Nuxt 内置 `useState` + Composables，无外部状态管理库。

### 5.1 消息状态

```typescript
// composables/useMessages.ts
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

  return { messages, streaming, addMessage, setStreaming, appendContent }
}
```

### 5.2 项目状态

```typescript
// composables/useProjects.ts
export const useProjects = () => {
  const projects = useState<Project[]>('projects', () => [])
  const currentId = useState<string | null>('currentProjectId', () => null)

  const current = computed(() =>
    projects.value.find(p => p.id === currentId.value) ?? null
  )

  async function load() {
    projects.value = await $fetch('/api/projects')
  }

  async function create(name: string) {
    const p = await $fetch('/api/projects', { method: 'POST', body: { name } })
    projects.value.push(p)
    return p
  }

  function switchTo(id: string) {
    currentId.value = id
  }

  return { projects, current, currentId, load, create, switchTo }
}
```

---

## 6. API 设计

### 6.1 认证

使用 sidebase/parse，简单开源方案。

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/auth/login | 登录 |
| POST | /api/auth/register | 注册 |
| POST | /api/auth/logout | 登出 |
| GET | /api/auth/me | 当前用户 |

### 6.2 项目管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/projects | 列表 |
| POST | /api/projects | 创建 |
| GET | /api/projects/:id | 详情 |
| DELETE | /api/projects/:id | 删除 |

### 6.3 OpenCode 代理

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/opencode/chat | 发送消息 |
| GET | /api/opencode/sse | SSE 流 |

---

## 7. 数据库设计 (Drizzle ORM + SQLite)

### 7.1 Schema

```typescript
// drizzle/schema.ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  password: text('password').notNull(),
  name: text('name'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  userId: text('user_id').notNull().references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})
```

### 7.2 用户目录结构

```
/users/{userId}/projects/{projectId}/
└── workspace/    # 项目文件
```

---

## 8. 文件结构 (极简版)

```
opencode-web/
├── nuxt.config.ts
├── package.json
├── drizzle/
│   ├── schema.ts              # 数据库 Schema
│   └── index.ts               # Drizzle 客户端
├── composables/
│   ├── useMessages.ts         # 消息状态
│   ├── useProjects.ts         # 项目状态
│   └── useToolRegistry.ts     # 工具注册表
├── components/
│   ├── tool/
│   │   ├── BasicTool.vue      # 基础卡片 (仅 60 行)
│   │   ├── GenericTool.vue    # 通用后备
│   │   ├── BashToolCard.vue   # Bash 命令
│   │   ├── ReadToolCard.vue   # 读取文件
│   │   ├── EditToolCard.vue   # 编辑文件
│   │   └── WriteToolCard.vue  # 写入文件
│   └── message/
│       ├── MessageList.vue    # 消息列表
│       └── ToolPartDisplay.vue # 工具展示
├── pages/
│   ├── index.vue              # 登录页
│   └── project/
│       └── [id].vue           # 项目工作区
├── server/
│   ├── api/
│   │   ├── auth/
│   │   ├── projects/
│   │   └── opencode/
│   └── utils/
│       └── db.ts
└── .env
```

**总计约 30 个文件，核心代码 < 2000 行**

---

## 9. 实施阶段

### Phase 1: 最小可用版本 (MVP)
- [ ] Nuxt 4 项目初始化
- [ ] Drizzle ORM + SQLite 配置
- [ ] 基础认证 (login/register)
- [ ] 基础项目 CRUD
- [ ] OpenCode SSE 连接
- [ ] BasicTool + GenericTool
- [ ] BashToolCard

**目标**: 能发送消息，看到工具执行结果

### Phase 2: 核心工具卡片
- [ ] ReadToolCard
- [ ] EditToolCard
- [ ] WriteToolCard

### Phase 3: 完善功能
- [ ] 项目切换
- [ ] 会话历史
- [ ] 错误处理
- [ ] 加载状态

### Phase 4: 部署
- [ ] systemd 配置
- [ ] nginx 反向代理

---

## 10. 与 OpenCode 桌面端对比

| 功能 | OpenCode 桌面端 | 我们的方案 |
|------|----------------|-----------|
| 工具执行 | ToolRegistry.register() | OpenCode 内置 |
| 工具渲染 | ToolRegistry.render() | **我们实现** |
| 工具卡片 | 30+ 专用组件 | 5 个核心 + GenericTool |
| 状态管理 | Agent + Session | Nuxt useState |
| 实时通信 | 内置 WebSocket | SSE |
| 认证 | 内置 | Nuxt Auth |

---

## 11. 附录

### 11.1 OpenCode ToolPart 类型

```typescript
interface ToolPart {
  id: string
  tool: string              // 'bash' | 'read' | 'edit' | ...
  input: Record<string, any>
  state: {
    status: 'pending' | 'running' | 'success' | 'error'
    output?: string
    error?: string
  }
  metadata?: {
    title?: string
    [key: string]: any
  }
}
```

### 11.2 参考资源

- OpenCode UI: `packages/ui/src/components/message-part.tsx`
- ToolRegistry: `packages/opencode/src/tool/registry.ts`

---

## 12. 修改历史

| 版本 | 日期 | 修改内容 |
|------|------|---------|
| 1.0.0 | 2026-03-29 | 初始版本 |
| 2.0.0 | 2026-03-29 | 极简优化：移除 Better Auth/Drizzle/Pinia，采用 Nuxt 内置方案 |
| 2.1.0 | 2026-03-29 | 改回 Drizzle ORM (Prisma 体积过大) |
