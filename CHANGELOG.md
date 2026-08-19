# Changelog

All notable changes to **dsh-turnbar** are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); versions respect semver.

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
- 测试：66→84 之外新增 merge 6 场景 + save 合并 1 场景（**91 全绿**）。

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