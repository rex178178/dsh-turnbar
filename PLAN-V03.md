# PLAN-V03.md · v0.3.0 完整开发设计（M1+M2 合并版）

**用户拍板（2026-08-18）：M1（上下文余量 + 搜索落图）与 M2（章节刻度 + 轨迹联动）合并为一个 v0.3.0 发布；不排 v0.4/v0.5。**

设计依据：08-18 竞品复检（13+ 导航类插件、搜索概念被 5 家侵蚀、codex-timeline 锁 commit 重写 adapter）。
核心原则：**五根支柱（全景条/scrub/Esc/富元卡/⌘K）一行不动**，只在其上加"播放器余量 + 章节刻度 + 双视图"。

---

## F1 · 数据层：每轮上下文占用（contextUsed）

**人话**：每轮结束时"对话占内存的多少"已经随事件流送来了（`assistant/message` 的 `usage.inputTokens` ≈ 该次请求时的上下文用量），但目前只累加成 `tokenIn`，把"轮内最后一次"的值单独存一份即可。

| 项 | 内容 |
|---|---|
| `src/core/types.ts` | `TurnRecord` += `readonly contextUsed?: number`（该轮最后一次请求的输入 token；无 usage 则 undefined）。`ChapterBreak` += `readonly label?: string`（goal/change 的 Objective 文本，探测性提取） |
| `src/core/fold.ts` | `TurnDraft` += `contextUsed?: number`；`assistant/message` 分支：`if (typeof usage.inputTokens === 'number') draft.contextUsed = usage.inputTokens`（**后写覆盖 = 轮内最后一次**，多步工具轮取末值即"该轮结束时占用"）。`goal/change` 分支：防御性提取 `data.goal?.objective / data.objective / data.title` 为 label |
| sidecar 兼容 | `{type:'turnbar/state', v:1}` 单行快照追加可选字段，旧 sidecar 读入为 undefined → 客户端按"数据不可得整行隐藏"处理，**不改 v、不需迁移** |
| node 半区 | 零改动（`/state` 路由透传 snapshot，`contextWindow`/`chapterBreaks` 本就在 payload 里） |

派生计算放客户端纯函数（可测、不进 fold）——新增 `src/client/context.ts`：

```ts
occupancyOf(used?: number, window?: number): number | null   // used/window，clamp 0..1；任一缺失 → null
formatContextLine(occ, window): { text, level } | null        // "上下文 62% · 余 38k"，level: warn≥80%、crit≥95%
latestOccupancy(turns, window): number | null                 // 末轮占用（条尾警示用）
```

## F2 · 悬停卡余量行

- `card.ts`：`CardTurn` += `contextUsed?: number`；`CardModel` += `context?: { text: string; level: 'normal' | 'warn' | 'crit' }`。
- `buildCardModel(turn, opts?)` 增第二参 `{ contextWindow?: number }`（默认行为不变，现有调用兼容）；组卡取组内**末轮**占用。
- `fill()`：meta 行上方渲染 `.tb-context`，warn/crit 分别着琥珀/红（DSW 变量缺省字面量兜底）。
- **降级**：occupancy 为 null → 整行不渲染（不估算、不误导）。
- **独有形态**：scrub 扫过时每张卡显示"**该轮当时**"的占用——回到第 47 轮时上下文还剩多少，DOM 订阅系竞品无此数据。

## F3 · 条尾余量警示

- `index.ts`：`occ = latestOccupancy(turns, contextWindow)`；条容器 className += `ctx-warn`（≥80%）/ `ctx-crit`（≥95%）。
- `useTurnbarData` 扩展：meta 轮询同时保留 `contextWindow` 与 `chapterBreaks`（签名 = turns+contextWindow+chapterBreaks 的 JSON，不变不 setState）；store 推导路径无 contextWindow → 不警示（L1 隐藏）。
- CSS：条右缘渐变暖色（warn 琥珀 .16 / crit 红 .22），不遮段、不加高条。`aria-label` 追加"上下文 N%"。

## F4 · 搜索落图（⌘K 结果可视化在全景条上）

- `search.ts`：`renderResults` 后 `window.dispatchEvent(new CustomEvent('dsh-turnbar:hits', { detail: turns[] }))`；关闭面板/空结果发空数组。
- `index.ts`：`hitsRef` + window 监听更新后 `applyHits()`——按 `segmentsRef`（渲染期同步的段表）把含命中轮的段加 `.hit` class；`turns` 变化重渲染后在 effect 里重放。
- CSS：`.hit` 琥珀底色，置于 `.has-user` 之后、`.ghost`/`:hover` 之前（幽灵段保持灰、悬停仍最高优先）。
- 点击命中段 = 正常跳转（tick 只做"命中在哪里"的全图呈现）。

## F5 · 章节刻度（goal 轮先行）

- 数据**已在**（fold v0.1 起记录 `chapterBreaks`）。`grouping.ts` 新增纯函数 `chapterTickPercents(breaks, segments)`：只取 `kind === 'goal'` 的断点（`todo/write` 高频、噪声大，**只记录不渲染**），对 `seg.from === break.turn` 的段返回其左缘百分比。
- `index.ts`：渲染绝对定位 `[data-turnbar-chapter]` 细条（2px 品牌色、goal 一种），与 playhead 同款**命令式定位**（effect + resize 复用 paint 流程，避免渲染期读布局）。
- 刻度 passive（pointer-events:none），不与段交互冲突。

## F6 · 轨迹视图联动（⌘/Alt+点击段）

**配方来源（已从 dsh-chat-outline bundle 逆向 + 验证）**：
- `session.getSnapshot().views.get('trajectory')` → eventNodes（kind/turn/step/seq）；
- 轨迹表行 `tr[data-trajectory-row-key]` = `encodeURIComponent(trajectoryRecordId)`：user 行 `user\0seq\0{seq}`、assistant 行 `assistant\0{turn}\0{step}`（`\0` → `%00`）；
- 视图切换：按文案候选（`轨迹/Trajectory/trajectory/Trace`）找 tab 元素点击；
- 虚拟化（>100 行不在 DOM）：按目标 seq 占比先跳大致位置再轮询逼近。

**实现**：`jumpTrajectory(turn)` — 快照取 eventNodes 找目标轮首个节点（user 优先）→ 表不在则点 tab 切换（≤2s 轮询等渲染）→ 精确 key 查行，不在 DOM 则比例跳位 + ≤10 次轮询 → pane 内居中 + 复用 flash。**任何一步失败：console.warn + 回落正常对话内跳转**（降级不崩溃）。

### F6.1 可发现性设计（隐藏手势必须有教学入口，三重触达）

| 通道 | 时机 | 形式 | 频率 |
|---|---|---|---|
| **悬停卡提示行（主通道）** | 卡片打开时 | 卡片末行弱色小字「⌘/Alt+点击 → 轨迹视图定位」——用户决策"点不点"的那一刻就在眼前，上下文最强、零打断、可反复查看 | 常驻 |
| **首跳教学 toast（兜底通道）** | 用户第一次完成段点击跳转后 | 复用现有返回 toast，追加一行「提示：⌘+点击可在轨迹视图打开该轮」，localStorage 键 `dsh-turnbar:hint-traj` 记忆 | 仅一次 |
| **README / CHANGELOG** | 发布时 | 特性列表明示快捷键与 GIF 演示位 | 一次性 |

- 实现挂点：卡片提示行进 `card.ts` 的 CardModel/fill（与余量行同层）；教学 toast 进 `toast.ts`（`showReturnToast` 增可选提示参数，不改现有布局）；均在既有组件上追加，无新浮层。
- 触摸屏无修饰键：本功能定位为桌面增强，教学文案只提 ⌘/Alt，不为触摸做长按等替代交互（保持范围克制）。

## 交付物清单（改哪些文件）

| 文件 | 改动 |
|---|---|
| `src/core/types.ts` `src/core/fold.ts` | F1 两个字段 + 标签提取（约 15 行） |
| `src/client/context.ts`（新增） | 占用/文案/阈值纯函数 |
| `src/client/card.ts` | 余量行渲染 + 三档着色 + 轨迹快捷键提示行 |
| `src/client/toast.ts` | 返回 toast 追加可选提示行（首跳一次性教学，localStorage 记忆） |
| `src/client/grouping.ts` | 章节刻度位置纯函数 |
| `src/client/search.ts` | 命中广播（约 10 行） |
| `src/client/trajectory.ts`（新增） | 轨迹联动全链 + 降级 |
| `src/client/index.ts` | 数据 hook 扩展、条尾警示类、命中标记、章节刻度渲染、修饰点击 |
| `package.json` / `src/index.ts` | 版本号 0.3.0 |
| `CHANGELOG.md` / `README.md` | 新特性说明（含 ⌘/Alt 快捷键明示与 GIF 位）；对照表补 5 行新竞品 + 兼容性列 |

## 版本 / 文档

- `package.json` + `src/index.ts` version → **0.3.0**；CHANGELOG 新增条目。
- README：特性列表补 4 项（余量卡/条尾警示/搜索落图/章节刻度+轨迹联动）；对照表补 5 行新竞品（codex-timeline / outline / chat-outline / message-preview / turn-marks）+ 兼容性一列（对照 adapter 锁 commit 路线，只列事实）。

## 测试与验收

| 层 | 用例 |
|---|---|
| `fold.test.ts` | contextUsed 末值覆盖 / 无 usage 为 undefined；goal/change label 提取 |
| `context.test.ts`（新） | occupancyOf 边界（缺失/0/超1）；formatContextLine 阈值 80%/95% 与文案；latestOccupancy |
| `card.test.ts` | 余量行三档渲染 + null 隐藏；组卡取末轮；轨迹提示行常驻渲染 |
| `grouping.test.ts` | chapterTickPercents：goal-only、段左缘对齐、无断点空数组 |
| 真机（8791） | 复现会话 session-31ed62b0（goal 轮可见刻度、卡显占用）；⌘K tick 出现/清除；⌘+点击落轨迹视图居中高亮；悬停卡显示 ⌘ 提示行；首跳 toast 带教学提示且清缓存后仅出现一次；无 usage 会话整行隐藏不崩 |

## 风险与降级矩阵

| 风险 | 缓解 |
|---|---|
| inputTokens ≠ 严格上下文占用（缓存命中/compaction） | 语义定为"该轮最后一次请求的输入规模"，文案写"上下文"，不做精确承诺；无数据隐藏 |
| 轨迹 tab 文案/DOM 变更 | 全链 try/catch + 回落对话内跳转；tab 候选数组集中一处 |
| todo/write 刻度噪声 | v0.3 只渲染 goal 断点，todo 数据继续记录待验证 |
| 搜索 hits 与段重渲染竞态 | hits 存 ref，`[turns]` effect 重放；类序保证 ghost/hover 优先 |
