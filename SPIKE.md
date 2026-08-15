# SPIKE.md · dsh 源码侦察（四项关键依赖 · 全部有结论）
**日期：2026-08-16 · 证据基线：vendor/deepseek-harness @ 0.1.0-rc.5（2026-08-13）+ vendor/dsh-navbar @ v0.3.0 + 本机 ~/.dsh 实勘**
**结论先行：四项全部走官方正路，无需 patch hack。架构维持 PLAN.md 第 6 章不变，双通道与注入方式均已实证。**

---

## Q1 会话事件流 ✅ 官方 firehose，一条订阅拿全轮次数据

**订阅方式**：`ctx.on('session/event', (session, event) => ...)` —— cordis 事件，post-commit 广播全部持久化事件。
- 定义：`packages/core/session/src/index.ts:76`；事件类型表：`packages/core/session/src/types.ts:236-333`（`SessionEventMap`）；全量已知类型清单：`packages/core/session/src/known-event-types.ts`。

**事件信封**：`{ type, seq, time, data }`（seq 会话内单调递增；本机会话文件实勘吻合）。

**轮次相关事件（全部自带 turn/step 号，TurnStore 直接 fold）**：
| 事件 | data 关键字段 | 用途 |
|---|---|---|
| `turn/start` / `turn/end` | `{turn}` / `{turn, reason}` | **轮次边界是一等公民，无需自己推** |
| `user/message` | `{content, source, role, id}` | 用户首句提取 |
| `assistant/message` | `{turn, step, message, usage?}` | **token 数据在此** |
| `tool/call` / `tool/result` | `{turn, step, callId, name, arguments}` | 工具计数/文件改动聚合 |
| `step/start` / `step/end` | `{turn, step}` | 组内折叠 |
| `request/context` | `{provider, model, contextWindow}` | **V2 上下文余量的分母** |
| `goal/change` / `todo/write` | `{goal, operation...}` / `{todos}` | **V1 章节切分信号（任务边界）** |

流式 chunk（`assistant/chunk`、`text-chunks` 等打包行）**不需要**——等 `assistant/message` 落定即可。

**补充实时事件**（`packages/core/agent/src/runtime-types.ts:146-292`）：`agent/status`（idle/running）、`agent/inbox/inserted`（用户提交的最早时机，早于 user/message 入日志）、`agent/error`。

**⚠️ 关键坑（本机验证 + 源码 `firstLiveSeq`）**：resume/fork 的 seed 事件**不重放** firehose——插件加载前已发生的轮次必须走 Q2 的持久化读取回填。双通道设计因此是必需而非优化。

## Q2 会话持久化 ✅ 官方读取 API + 文件格式全明

- **落盘**：`packages/session/session-persistence-jsonl/src/format.ts` → `~/.dsh/sessions/--<projectKey(cwd)>--/<sessionId>/session.jsonl.zstd`（zstd 压缩 JSONL；`compression:'none'` 可配明文；home 解析 `$DSH_HOME` > `~/.dsh`）。
- **官方服务**：`ctx.sessionPersistence`（`packages/session/session-persistence/src/index.ts`）：
  - `load/inspect(id) → {meta, events}`（整会话）
  - `readFrom(id, fromSeq) → {meta, events}`（增量，断线续读用）
  - `list() → SessionHeader[]`、`readRaw(id)`（逐字节 JSONL）
- **格式细节**：首行 `type:'session'` header；chunk 行会被打包（`text-chunks`/`reasoning-chunks`/`tool-call-chunks`，`seq0/time0` 信封，`packages/core/session/src/chunk-rows.ts`），读取时需经 `decodeStorageRecord` 还原——**用官方 API 读取则无感**。
- **第三方先例**：dsh-conversation-outline 的 Host 半边用 `ctx.sessionQuery.readSession/listEvents` 读日志并经 `ctx.webServer.register` 暴露同源 JSON 路由给浏览器半边（其 `docs/PLUGIN_DEV_NOTES.md` 有完整笔记）——**client↔host 数据桥的成熟范式，照抄**。
- 本机实勘 5.9MB 会话（43 user / 404 assistant / 401 tool / 22 turn）解析无误，事件分类学与 `SessionEventMap` 一致。

## Q3 Web UI 注入 ✅ 有官方插槽，进度条有正路

- **包清单**：package.json `dsh: { client: { inject: ['@deepseek-ai/dsh-client-runtime', '@deepseek-ai/dsh-client-ui-primitives'], platform: 'web' } }` + `exports['./client']`（解析于 `packages/client/modules/src/index.ts:46-142`）。bundle 以 `/plugins/<id>/client.js` 提供；CSS 随模块自动 `<style data-plugin>` 注入。
- **client 入口**：导出 `{ name, inject: string[], apply(ctx: ClientContext) }`；React 18 由平台冻结表提供（`packages/client/web/src/platform.ts`），**无需自带框架**（Web Component 决策可保留，但 React 现成——D2 定）。
- **插槽 API**：`ctx.slots.register({ name, id, order, locale, inject? }, Component)`；类型 `packages/client/ui-slots/src/index.ts:741-785`（kind: single/keyed/list/chain）。
- **🎯 底部进度条直接可用的官方 list 插槽（已在本仓库 grep 复核）**：
  - **`conversation.composer.dock`** —— composer 停靠区，官方 StatsLine 范例在 `packages/client/ui-conversation/src/client/apply.ts:429`。**首选**。
  - `conversation.input.dock` / `.left` / `.right`、`shell.overlay`（`packages/client/ui-layout/src/client/index.ts:83,126`）备选。
- **生态先例**：navbar 自渲染 fixed DOM（无插槽，全屏自由定位）；outline 注册 better-sidebar tab。我们用官方 composer 插槽 = 比两者都正。

## Q4 虚拟滚动 ✅ 没有虚拟化，但有分页——跳转配方确定

- ChatView（`packages/client/ui-conversation/src/client/chat/ChatView.tsx`）：已加载节点**全量直接渲染**（L382-397 map），无 react-window/virtua。
- **历史分页**：`hasMore` + `loadOlder()`（L147/159/362，UI 是"加载更早"按钮）。**跳转配方：目标轮未加载时先触发 loadOlder 直到 `data-chat-anchor-key`/`data-turn-tail` 出现，再 scrollIntoView**。编程式触发方式（DOM 点击按钮 vs 更高契约）→ D2 验证项 #1。outline 已实现"自动加载历史"，证明可行。
- **滚动容器**：`[data-conversation-scroll]`（ChatView.tsx:27）。
- **follow/底部吸附陷阱（navbar 踩过并记录，0811 起已解）**：程序化写 `scrollTop` 会被官方"读者输入账本"识别为读者输入、不再拉回底部；navbar 仍保留 wheel 事件兜底（`vendor/dsh-navbar/src/client/index.ts:407-416`）。照抄其 jumpToRow 即可。

## Q5 锚点属性 ✅ 复核完毕

- `data-time-hover-root`：无值布尔属性，挂**用户消息行**（`MessageItem.tsx:194`）与**轮次尾行**（`TurnTailNodeView.tsx:36`）；出处 feature note 2026-08-03，0.1.0-rc.5 已含。**不带 turn 号**。
- 轮号在 `data-turn-tail={turn}` 与 `data-chat-anchor-key`（`ChatNodeSeat.tsx:42-47`）；聊天流容器 `data-chat-flow`（navbar 用的选择器，现源码对应 `[data-conversation-scroll]` 滚动容器）。

## Q6 插件包结构 ✅ 双半包模板齐备

- 入口约定：`export const name / inject: string[] / apply(ctx, config) / Config`（范本 `packages/todo/tool-todo/src/index.ts:22-43`）。
- 工具注册（V2 用）：`ctx.tools.register(defineTool({name, description, parameters, output, execute}))` 返回 disposer（`packages/core/tools/src/index.ts:1037`、`schema.ts:545`）。
- 构建：tsdown 双产物（node ESM + client CJS 带 `__ModuleLoader__` 包装，navbar `tsdown.config.ts` 现成模板）。
- peerDependencies：`@deepseek-ai/cordis` + 用到的 `@deepseek-ai/dsh-*` 包（范本 `packages/todo/tool-todo/package.json`、`packages/client/ui-conversation/package.json`）；engines：`dsh >=0.1.0-rc.5`、`node >=22.19.0`。
- 挂载：自带 `cordis.patch.yml`（insert 一行插件 id）声明 `dsh.bundle.patch`；`dsh plugin --profile web add` 自动 reconcile 进 profile（`apps/cli/src/plugin.ts:59-91`）。

---

## 架构判定总表

| 事项 | 判定 | 依据 |
|---|---|---|
| 事件流捕获轮次 | ✅ 官方正路 | `session/event` firehose，Q1 |
| 存储回填 | ✅ 官方正路 | `ctx.sessionPersistence`，Q2 |
| client↔host 数据桥 | ✅ 照抄先例 | outline 的 webServer JSON 路由，Q2 |
| 底部条注入 | ✅ 官方正路 | `conversation.composer.dock` 插槽，Q3 |
| 跳转滚动 | ⚠️ 基本正路 | 无虚拟化但需先 loadOlder；follow 陷阱有解，Q4 |
| 探测/降级 | ✅ 可实现 | 事件名/服务名/插槽名均可 `typeof` 探测，失败走 L1–L4 |

## D2 遗留验证项（✅ 2026-08-16 D2 已全部落定）

1. **loadOlder**：它是客户端 session 契约的一等方法——`loadOlder(): Promise<void>`（`packages/client/runtime/src/client/contract/session.ts:74`，实现 `sessions/session.ts:377`）。D3 接 UI 时沿 ChatView 同源（useSession 那套 runtime 契约）调用即可，另保底 DOM 兜底（触发"加载更早"按钮）。
2. **sessionQuery**：确认为 host 侧服务（`packages/context/session-reference/src/index.ts:71`，`static inject = ['sessionQuery']`），已见方法 `listSessions` / `readTitleSnapshots` / `readSurface`（outline 笔记里的 readSession/listEvents 是转述名）。D5 回填以 core 的 `ctx.sessionPersistence` 为权威，sessionQuery 作备选。
3. **UI 框架选型锁定：平台 React**。插槽组件类型 `SlotComponent<P> = (props: P) => ReactNode`（`packages/client/ui-slots/src/index.ts:370`），React 18 由 client runtime 平台冻结表提供，插槽组件天然是 React——不引入 Web Component 桥。
4. **（新增）文件工具**：dsh 的文件编辑工具为 `str_replace_editor`（参数 `path`，`command: view|create|...`，`view` 只读），已录入 fold 的 FILE_TOOLS 注册表。

## D2 交付快照（2026-08-16，commit c1c5e03）

- 数据层落地：`src/core/fold.ts`（SessionFold 纯函数折叠）+ `src/core/turn-store.ts`（原子 JSONL sidecar，`$DSH_HOME/plugins/dsh-turnbar/sessions/`）+ `src/core/first-line.ts`（markdown 剥离与首句截断）；node half 订阅 `session/event`，全异常吞没。
- 夹具：真实 5.9MB 会话脱敏为 21195 事件 / 22 轮（`test/fixtures/long-session.json`，`scripts/make-fixture.mjs` 可再生）。
- 测试：vitest 20/20 绿（轮次守恒 22、工具调用守恒 401、用户消息归属守恒 43 = 触发 + steering + dangling）；tsc --noEmit 干净；tsdown 双 half 产物 lib/index.mjs + lib/client.js。
- 工程注意：pnpm 11 需 `pnpm-workspace.yaml` `allowBuilds: esbuild: true`（与 dsh profile 同机制）；vitest 需限定 include（否则扫进 vendor/ 的官方测试）。
