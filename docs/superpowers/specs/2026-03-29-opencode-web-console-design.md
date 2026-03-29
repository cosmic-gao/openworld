# OpenCode Web 控制台设计方案

> 版本: 1.0.0  
> 日期: 2026-03-29  
> 状态: 已批准

---

## 1. 项目概述

### 1.1 项目背景

将 OpenCode AI 编码助手集成到自定义 Nuxt 4 Web 应用中，提供多用户支持的 Web 界面。用户通过浏览器访问 Nuxt 应用，该应用代理并管理 OpenCode 服务器的连接，实现会话隔离、项目管理、统一的工具 UI 渲染。

### 1.2 核心目标

1. **多用户支持** - 每个用户有独立的目录空间和会话隔离
2. **自定义 Web UI** - 使用 Nuxt 4 构建独立的 Web 界面
3. **分离部署** - Nuxt 应用与 OpenCode 服务器独立运行
4. **系统级管理** - OpenCode 服务器由 systemd 管理
5. **统一工具注册表** - 工具执行逻辑与 UI 渲染分离，通过 ToolRegistry 统一管理

### 1.3 技术选型

| 组件 | 技术 | 版本 | 说明 |
|------|------|------|------|
| Web 框架 | Nuxt 4 | latest | Vue 3 + SSR |
| 认证 | Better Auth | latest | 开源认证方案 |
| ORM | Drizzle ORM | latest | SQLite (dev) / PostgreSQL (prod) |
| 状态管理 | Pinia | latest | Vue 3 官方推荐 |
| UI 组件 | 自定义 + shadcn/ui | latest | 复刻 OpenCode 桌面端风格 |
| 工具注册 | 自定义 ToolRegistry | - | 借鉴 OpenCode 架构 |
| 实时通信 | SSE | - | 通过 Nuxt Server 代理 |
| OpenCode SDK | @opencode-ai/sdk | latest | TypeScript 客户端 |
| 系统管理 | systemd | - | OpenCode 服务管理 |

---

## 2. 系统架构

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           用户浏览器                                      │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    Nuxt 4 应用 (Port 3000)                        │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │   │
│  │  │ Better Auth │  │   Pinia     │  │   ToolRegistry          │ │   │
│  │  │  (认证)     │  │  (状态管理) │  │   (UI组件注册)          │ │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────────────┘ │   │
│  │  ┌─────────────────────────────────────────────────────────────┐ │   │
│  │  │                   消息组件层                                 │ │   │
│  │  │  MessageList / MessageItem / ToolPartDisplay                │ │   │
│  │  └─────────────────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    HTTP/WebSocket + SSE
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    OpenCode 服务器 (Port 4096)                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │  工具执行   │  │  会话管理   │  │  MCP管理    │  │ Skill系统   │ │
│  │  ToolRegistry│ │             │  │             │  │             │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘ │
│                                                                           │
│  用户目录隔离: x-opencode-directory: /users/{userId}/projects/{id}/     │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │   systemd 管理       │
                         │   opencode@.service  │
                         └─────────────────────┘
```

### 2.2 组件交互流程

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          用户交互流程                                     │
│                                                                           │
│  1. 用户登录 (Better Auth)                                               │
│         ↓                                                                 │
│  2. 进入项目工作区                                                        │
│         ↓                                                                 │
│  3. 发送消息 → Nuxt Server → OpenCode Server                            │
│         ↓                                                                 │
│  4. OpenCode SSE 流式返回 ToolPart                                       │
│         ↓                                                                 │
│  5. Nuxt 解析 ToolPart → ToolRegistry.render(toolName)                  │
│         ↓                                                                 │
│  6. 渲染对应工具卡片 (BashToolCard / ReadToolCard / ...)                  │
│         ↓                                                                 │
│  7. 工具执行结果通过相同流程返回                                           │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.3 用户目录隔离

每个用户/项目有独立的 OpenCode 工作目录：

```
/users/{userId}/projects/{projectId}/
├── .opencode/               # OpenCode 配置
│   ├── config.json
│   └── tools/               # 用户自定义工具 (可选)
├── workspace/               # 项目工作区
│   ├── src/
│   └── ...
└── sessions/                # 会话历史
    └── session-{id}.json
```

**请求头传递：**
```
x-opencode-directory: /users/{userId}/projects/{projectId}/
```

---

## 3. 核心模块设计

### 3.1 ToolRegistry UI 注册系统

#### 3.1.1 设计原理

借鉴 OpenCode 桌面端的 ToolRegistry 模式，实现 Vue 3 Composition API 版本。

#### 3.1.2 核心接口

```typescript
// composables/useToolRegistry.ts

// 工具渲染组件类型
type ToolComponent = DefineComponent<{
  input: Record<string, any>
  tool: string
  metadata?: ToolMetadata
  output?: string
  status: 'pending' | 'running' | 'success' | 'error'
  hideDetails?: boolean
  defaultOpen?: boolean
}>

// 注册表状态
interface ToolRegistryState {
  name: string
  render?: ToolComponent
}

// 注册函数
function registerTool(input: { name: string; render?: ToolComponent }): void

// 获取渲染组件
function getTool(name: string): ToolComponent | undefined

// 注册表
const ToolRegistry = {
  register: registerTool,
  render: getTool,
}
```

#### 3.1.3 内置工具映射

| 工具名称 | 渲染组件 | 图标 | 说明 |
|---------|---------|------|------|
| bash | BashToolCard | console | Shell 命令执行 |
| read | ReadToolCard | glasses | 文件读取 |
| edit | EditToolCard | code-lines | 文件编辑 (Diff) |
| write | WriteToolCard | code-lines | 文件写入 |
| glob | GlobToolCard | magnifying-glass-menu | 文件搜索 |
| grep | GrepToolCard | magnifying-glass-menu | 代码搜索 |
| webfetch | WebFetchToolCard | window-cursor | URL 获取 |
| websearch | WebSearchToolCard | window-cursor | 网络搜索 |
| task | TaskToolCard | task | 子任务 |
| todowrite | TodoWriteToolCard | checklist | Todo 列表 |
| question | QuestionToolCard | bubble-5 | 用户问答 |
| skill | SkillToolCard | brain | 技能调用 |
| * | GenericToolCard | mcp | 通用后备 |

### 3.2 工具卡片组件结构

#### 3.2.1 BasicTool (基础卡片)

所有工具卡片的基类组件，提供统一的折叠/展开 UI 结构：

```vue
<!-- components/tool/BasicTool.vue -->
<template>
  <Collapsible :open="open" @open-change="handleOpenChange">
    <Collapsible.Trigger>
      <div class="tool-trigger">
        <Icon :name="icon" />
        <div class="tool-info">
          <span class="tool-title">{{ title }}</span>
          <span class="tool-subtitle">{{ subtitle }}</span>
        </div>
        <Badge :variant="statusVariant">{{ status }}</Badge>
      </div>
    </Collapsible.Trigger>
    <Collapsible.Content>
      <slot />
    </Collapsible.Content>
  </Collapsible>
</template>
```

#### 3.2.2 GenericTool (通用后备)

当 ToolRegistry 中没有对应工具的专用渲染器时使用：

```vue
<!-- components/tool/GenericTool.vue -->
<template>
  <BasicTool icon="mcp" :title="t('ui.basicTool.called', { tool })" :subtitle="label(input)">
    <pre class="generic-output">{{ output }}</pre>
  </BasicTool>
</template>
```

#### 3.2.3 专用工具卡片

**BashToolCard** - 命令执行工具：
```vue
<template>
  <BasicTool icon="console" :trigger="bashTrigger">
    <div class="bash-output">
      <div class="command">$ {{ command }}</div>
      <pre class="output">{{ stripAnsi(output) }}</pre>
    </div>
  </BasicTool>
</template>
```

**ReadToolCard** - 文件读取工具：
```vue
<template>
  <BasicTool icon="glasses" :trigger="readTrigger">
    <FilePreview :path="input.filePath" />
  </BasicTool>
</template>
```

**EditToolCard** - 文件编辑工具 (Diff 视图)：
```vue
<template>
  <BasicTool icon="code-lines" :trigger="editTrigger">
    <DiffView :old="input.oldString" :new="input.newString" />
  </BasicTool>
</template>
```

### 3.3 消息渲染流程

```
OpenCode SSE 消息
      │
      ▼
┌─────────────────┐
│  解析 ToolPart  │
│  (工具名、状态、│
│   输入、输出)   │
└─────────────────┘
      │
      ▼
┌─────────────────┐
│ ToolRegistry.  │
│ render(toolName)│
└─────────────────┘
      │
      ├──► 找到专用组件 ──► 渲染 BashToolCard / ReadToolCard / ...
      │
      └──► 未找到 ──► 渲染 GenericToolCard (通用后备)
```

### 3.4 状态管理 (Pinia)

#### 3.4.1 useAuthStore

```typescript
// stores/auth.ts
export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const isAuthenticated = computed(() => !!user.value)
  
  async function login(email: string, password: string) { ... }
  async function logout() { ... }
  async function fetchUser() { ... }
  
  return { user, isAuthenticated, login, logout, fetchUser }
})
```

#### 3.4.2 useProjectStore

```typescript
// stores/project.ts
export const useProjectStore = defineStore('project', () => {
  const projects = ref<Project[]>([])
  const currentProject = ref<Project | null>(null)
  const sessions = ref<Session[]>([])
  
  async function createProject(name: string) { ... }
  async function switchProject(id: string) { ... }
  async function deleteProject(id: string) { ... }
  async function loadProjects() { ... }
  
  return { projects, currentProject, sessions, createProject, switchProject, deleteProject, loadProjects }
})
```

#### 3.4.3 useMessageStore

```typescript
// stores/message.ts
export const useMessageStore = defineStore('message', () => {
  const messages = ref<Message[]>([])
  const streamingMessage = ref<Message | null>(null)
  const pendingTools = ref<ToolPart[]>([])
  
  function addMessage(message: Message) { ... }
  function appendStreamingContent(content: string) { ... }
  function completeStreamingMessage() { ... }
  function updateToolPart(id: string, updates: Partial<ToolPart>) { ... }
  function retryMessage(id: string) { ... }
  function deleteMessage(id: string) { ... }
  
  return { 
    messages, streamingMessage, pendingTools,
    addMessage, appendStreamingContent, completeStreamingMessage, 
    updateToolPart, retryMessage, deleteMessage 
  }
})
```

---

## 4. API 设计

### 4.1 认证端点 (Better Auth)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/auth/sign-in | 邮箱密码登录 |
| POST | /api/auth/sign-up | 用户注册 |
| POST | /api/auth/sign-out | 登出 |
| GET | /api/auth/session | 获取当前会话 |

### 4.2 项目管理端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/projects | 列出用户项目 |
| POST | /api/projects | 创建项目 |
| GET | /api/projects/:id | 获取项目详情 |
| PUT | /api/projects/:id | 更新项目 |
| DELETE | /api/projects/:id | 删除项目 |

### 4.3 OpenCode 服务器代理

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/opencode/chat | 发送消息 |
| GET | /api/opencode/sse | SSE 实时流 |
| GET | /api/opencode/sessions | 列出会话 |
| POST | /api/opencode/sessions | 创建会话 |
| DELETE | /api/opencode/sessions/:id | 删除会话 |

---

## 5. 数据库设计 (Drizzle ORM)

### 5.1 Schema

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
  opencodeDir: text('opencode_dir').notNull(),  // /users/{userId}/projects/{projectId}/
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

### 5.2 用户目录结构

```
/users/{userId}/projects/{projectId}/
├── .opencode/
│   ├── config.json
│   └── tools/               # 用户自定义工具
├── workspace/               # 项目工作区
│   ├── src/
│   └── ...
└── sessions/                # 会话历史
    └── session-{id}.json
```

---

## 6. 文件结构

```
opencode-web/
├── nuxt.config.ts
├── package.json
├── drizzle/
│   ├── schema.ts              # 用户、项目、会话表
│   ├── index.ts               # Drizzle 客户端
│   └── migrations/
├── auth/
│   └── [...].ts               # Better Auth 配置
├── composables/
│   ├── useOpencode.ts         # OpenCode SDK 封装
│   ├── useOpencodeSSE.ts      # SSE 实时流
│   └── useToolRegistry.ts     # 工具注册表
├── stores/
│   ├── auth.ts                # 认证状态
│   ├── project.ts             # 项目状态
│   └── message.ts             # 消息状态
├── components/
│   ├── tool/
│   │   ├── BasicTool.vue      # 基础工具卡片
│   │   ├── GenericTool.vue    # 通用工具卡片
│   │   ├── ToolErrorCard.vue  # 错误展示
│   │   ├── BashToolCard.vue   # Bash 工具
│   │   ├── ReadToolCard.vue   # 读取文件工具
│   │   ├── EditToolCard.vue   # 编辑工具
│   │   ├── WriteToolCard.vue  # 写入工具
│   │   ├── GlobToolCard.vue   # 文件搜索工具
│   │   ├── GrepToolCard.vue   # 代码搜索工具
│   │   ├── WebFetchToolCard.vue
│   │   ├── WebSearchToolCard.vue
│   │   ├── TaskToolCard.vue
│   │   ├── TodoWriteToolCard.vue
│   │   ├── QuestionToolCard.vue
│   │   └── SkillToolCard.vue
│   ├── message/
│   │   ├── MessageList.vue     # 消息列表
│   │   ├── MessageItem.vue     # 单条消息
│   │   ├── ToolPartDisplay.vue # 工具部分展示
│   │   └── StreamingIndicator.vue
│   └── ui/                    # shadcn/ui 基础组件
│       ├── button.vue
│       ├── input.vue
│       ├── collapsible.vue
│       ├── badge.vue
│       └── ...
├── pages/
│   ├── index.vue              # 首页/登录
│   ├── register.vue           # 注册页面
│   └── projects/
│       └── [projectId]/
│           └── index.vue      # 项目工作区
├── server/
│   ├── api/
│   │   ├── auth/
│   │   │   └── [...].ts
│   │   ├── projects/
│   │   │   ├── index.get.ts
│   │   │   ├── index.post.ts
│   │   │   └── [id]/
│   │   │       ├── index.get.ts
│   │   │       ├── index.put.ts
│   │   │       └── index.delete.ts
│   │   └── opencode/
│   │       ├── chat.post.ts   # 聊天代理
│   │       ├── sse.get.ts     # SSE 代理
│   │       ├── sessions.get.ts
│   │       ├── sessions.post.ts
│   │       └── sessions/[id].delete.ts
│   └── utils/
│       ├── auth.ts
│       └── opencode.ts
├── assets/
│   └── css/
│       └── main.css
├── .env
└── README.md
```

---

## 7. OpenCode 服务器配置

### 7.1 systemd 服务文件

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

[Install]
WantedBy=multi-user.target
```

### 7.2 多用户目录创建

```bash
# 创建用户目录结构
mkdir -p /users/{userId}/projects/{projectId}/workspace
mkdir -p /users/{userId}/projects/{projectId}/.opencode/tools
```

---

## 8. 实施阶段

### Phase 1: 项目初始化
- [ ] 初始化 Nuxt 4 项目
- [ ] 配置 TypeScript
- [ ] 安装并配置 Better Auth
- [ ] 配置 Drizzle ORM + SQLite
- [ ] 配置 shadcn/ui

### Phase 2: OpenCode 集成
- [ ] 创建 OpenCode SDK 客户端封装
- [ ] 实现 SSE 实时通信
- [ ] 实现用户目录隔离
- [ ] 配置代理端点

### Phase 3: 状态管理
- [ ] 创建 Pinia Stores
- [ ] 实现消息状态管理
- [ ] 实现项目/会话管理

### Phase 4: ToolRegistry UI
- [ ] 实现 ToolRegistry 核心
- [ ] 实现 BasicTool 基础组件
- [ ] 实现 GenericTool 后备组件
- [ ] 实现 ToolErrorCard 错误组件
- [ ] 实现内置工具卡片:
  - [ ] BashToolCard
  - [ ] ReadToolCard
  - [ ] EditToolCard
  - [ ] WriteToolCard
  - [ ] GlobToolCard
  - [ ] GrepToolCard

### Phase 5: 页面与功能
- [ ] 创建登录/注册页面
- [ ] 创建项目列表页面
- [ ] 创建项目工作区页面
- [ ] 实现消息列表展示
- [ ] 实现工具调用流程
- [ ] 实现流式输出

### Phase 6: systemd 部署
- [ ] 配置 systemd 服务
- [ ] 配置 nginx 反向代理
- [ ] 配置 HTTPS

---

## 9. 附录

### 9.1 OpenCode SDK 关键类型

```typescript
// 消息类型
interface MessageV2 {
  id: string
  role: 'user' | 'assistant' | 'system'
  parts: ToolPart[]
  createdAt: number
}

// 工具部分类型
interface ToolPart {
  id: string
  tool: string                    // 'bash' | 'read' | 'edit' | ...
  input: Record<string, any>     // 工具输入参数
  state: {
    status: 'pending' | 'running' | 'success' | 'error'
    output?: string
    error?: string
  }
  metadata?: {
    title?: string
    [key: string]: any
  }
  attachments?: {
    type: 'file'
    name: string
    path: string
  }[]
}

// 工具元数据
interface ToolMetadata {
  title?: string
  [key: string]: any
}
```

### 9.2 参考资源

- OpenCode 桌面端 UI 实现: `packages/ui/src/components/message-part.tsx`
- OpenCode ToolRegistry: `packages/opencode/src/tool/registry.ts`
- OpenCode SDK: `packages/sdk/js/src/`

---

## 10. 修改历史

| 版本 | 日期 | 修改内容 |
|------|------|---------|
| 1.0.0 | 2026-03-29 | 初始版本 |
