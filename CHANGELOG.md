# Changelog

All notable changes to **dsh-turnbar** are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); versions respect semver.

## [0.3.2] — 2026-09-13

### Fixed（dsh 0.1.5 持久化接口换代适配）

- **重启/冷启动后打开历史会话，进度条整体不渲染**——dsh `0.1.5-rc.1` 把会话
  持久化读取从 `inspect`/`readRaw` 一步全量换成了句柄制（`open('read')` →
  `handle.read(0)` → `handle.close()`，旧函数已删除）。插件回填链还在调旧
  API，能力探测静默降级 → 0 轮 → 按设计规则（≥1 轮才显示）不渲染。
- 修复：回填链最前面加**新句柄链**（能力探测 `open` 存在即走，`read(0)` 一次
  全量，`close` 幂等且成功/失败路径都必调——失败路径也还证，防句柄累积）；
  旧 `inspect` → `readRaw` 链**原样保留**给 ≤0.1.1-rc.x 用户。同一 dsh 上新旧
  API 互斥存在，链序即兼容，双版本用户都不破。
- 新后端契约 fail-closed（torn tail 永不给读者、坏日志抛
  `SessionFormatUnsupportedError`/`SessionPersistenceCorruptionError` 绝不误读），
  readRaw 兜底在新版无存在意义——NotFound/Corruption/Unsupported 一律降级 404。
- 半读防御探活（先纯折叠出轮次才算数）抽为新旧链共用；新链探活折 0 轮时打
  一行 `console.warn` 诊断（区分"接口没接通"与"事件格式漂移"）。
- 测试：93→**99 全绿**（新增 6 个句柄链用例：成功+必还证 / NotFound 落旧链 /
  Corruption→404+不记 seeded+还证 / 折 0 轮弃半读 / close 抛错不影响结果 /
  空事件静默落旧链）。

### Fixed（dsh 0.1.5 UI 适配：跳转锚定 DOM 分组定位）

- **点进度条跳转落点错行**——0.1.5 删了权威轮次索引 `chat.locations.getTurn`
  与聊天行的 `data-time-hover-root` 标记，跳转跌回区间法两个已知盲区：末轮
  跳转错停工具行、#11 错落轮 10（前一轮 aborted 掏空）、⌘↑/搜索兜底全灭。
- 修复（仅 client 半区，`src/client/locate.ts` + `index.ts`）：定位链改为
  **权威索引（rc.7 原路）→ DOM 分组（0.1.5 接管）→ 区间法（兜底）**。
  DOM 分组一次扫描 `[data-chat-flow-key]` 自己重建每轮行清单：
  - 轮号解析只认**类型段尾随数字**（`12:turn-process14`→14），行首 `NN:` 是
    槽位号不是轮号；turn-tail 只信 `data-turn-tail` 属性（且该属性长在
    flowItem **内部**元素上，须向内查）；
  - user/context 行向后归属、其余行向前归属；aborted 轮掏空后漏入下轮组的
    孤儿 user 行，由「锚行前最后一个 user」+「分组还在长闸门」（user 落组、
    锚行未渲染时区间法禁答）双保险消解——无属性轮尾壳不带轮号、不收网；
  - 锚选择复用 `pickTurnAnchor` 的选锚智慧（`pickGroupAnchor` 分组特化）；
  - 顺带加固：`userRowOfTurn`/`nthUserRow` 在 hover-root 全灭时回退
    kind=user flowItem（旧版行为逐字节不变）。
- 测试：99→**117 全绿**（新增 18 个分组/锚选择用例，含真机 #11 全同构）。

## [0.3.1] — 2026-08-19

### Fixed（生产事故，同日修复）

- **历史轮次从进度条"消失"、悬停全变「该轮已终止，无对话内容」**——根因是两层
  同源（resume/fork 不重放 firehose，进程重启后 live fold 只收新事件）：
  1. `stateOf` 原"live 非空即返回"会让**半截/空的 live 状态遮蔽完整 sidecar**；
  2. `TurnStore.save()` 直接以半截 fold 覆盖写盘，**把既有完整历史 sidecar 冲掉**
     （生产实测：11 轮历史被冲成 3 轮）。
- 修复：
  - 新增 `src/core/merge.ts`（纯函数）：sidecar（历史）+ live（新轮）按轮号合并，
    同轮号以 live 最新为准，章节断点按 seq 去重，会话级字段 live 优先回落；
  - `stateOf` 只在"真正带轮次"时才信任合并结果，空 live 继续走持久化回填；
  - `save()` 落盘前与既有 sidecar 合并（历史永不丢）。
- 生产恢复：受影响会话删除损坏 sidecar 后由 dsh 会话日志**回填出完整的 21 轮**
  （含此前被半截 fold 掩盖的轮次），浏览器复验 21 段、无幽灵轮、悬停正常。
- 追加健壮性（同版收敛，93 测试全绿）：
  - `stateOf` **完整性优先**：sidecar 缺失 + live 半截（重启后只收新轮的进行中状态）
    时，先向持久化回填完整版，持久化没有才退回 live；
  - 大/仍在写入的会话日志，inspect 半读折叠出 0 轮时**弃用该结果**、落到 readRaw
    裸读兜底（生产 2.9MB 实时写入会话实测：首请求即回填 21 轮）；
  - 回填**成功才记 seeded**：冷启动/一次失败不锁死整进程（不会永久 404）。
- 测试：66→84 之外新增 merge 6 场景 + save 合并 1 场景 + 完整性优先 1 场景 +
  inspect半读落readRaw 1 场景（**93 全绿**）。

## [0.3.0] — 2026-08-18

### Added

- **Context fuel gauge (F1/F2)** — each turn now records the input-token count of
  its last LLM request (`contextUsed`); the hover card shows session context-window
  occupancy at that moment (「上下文 62% · 余 38k」) with amber escalation ≥80% and
  red ≥95%. Scrub over turns to see "how much context was left back then".
- **Bar-tail occupancy warning (F3)** — when the latest turn's occupancy crosses
  80%/95%, the bar's right edge glows amber/red. Low-occupancy sessions show
  nothing; sessions without usage data hide the gauge entirely (no estimation).
- **Search lands on the map (F4)** — `⌘K` results are drawn onto the bar: segments
  containing matches glow amber; they clear when the panel closes. Discover which
  turns mention a topic at a glance.
- **Chapter ticks (F5)** — `/goal` rounds render as thin brand-color ticks at the
  segment left edge, giving long sessions visible milestones. `todo` events are
  recorded (with `label` extraction for goals) but not rendered yet.
- **Trajectory view jump (F6)** — `⌘/Alt` + click a segment switches to the
  official Trajectory view and centers + highlights that turn's row (snapshot
  keys, tab-by-label switching, virtualized proportional jump + polling fallback).
  Any failure degrades to a normal in-chat jump.
- **Discoverability for the hidden gesture (F6.1)** — the hover card always shows
  「⌘/Alt+点击 → 轨迹视图定位」; the first real jump appends a one-time teaching
  line to the return toast (localStorage `dsh-turnbar:hint-traj`); README documents
  the shortcut.
- `goal/change` events now carry their Objective text as `ChapterBreak.label`
  (defensive extraction across field-name drifts).

### Fixed

- Ghost (terminated-empty) turns now still surface their context occupancy when the
  data exists — a terminated turn did consume context.

### Internal

- New pure modules: `src/client/context.ts` (occupancy derivation/formatting,
  thresholds 0.8/0.95) and `src/client/trajectory.ts` (trajectory jump + degrade).
- `buildCardModel`/`buildGroupCardModel` accept an options object
  `{ contextWindow?, now? }`; the legacy naked-timestamp second argument still works.
- Test suite: 66 → 84 tests (context thresholds, fold last-wins `contextUsed`,
  goal-label extraction, chapter-tick alignment, card fuel levels).

## 0.2.x — 2026-08-16/17

- **0.2.4** — `readRaw` bare-read backfill fallback for corrupt session logs
  (rc.7 strict `inspect` rejects torn/non-contiguous records); exact turn anchoring
  via `chat.locations.getTurn(N)` fixing #3/#11 mis-lands; first/last-turn jump
  fixes, goal-round fold, flash clipping, scrub offset.
- **0.2.3** — `⌘K` search now searches assistant text too, plus search-result
  highlight scrolling.
- **0.2.2** — co-existence CSS layer for the `conversation.composer.dock` slot
  (survives dsh-web-ui-all / dsh-live-stats); single-turn sessions now render a
  one-segment bar.
- **0.2.0 – 0.2.1** — initial release: full-map progress bar, hover preview cards
  with rich meta (tools/files/tokens), drag scrub, playhead, `⌘↑`/`⌘↓`, `Esc`
  return, `⌘K` search, graceful degradation ladder.