# Changelog

All notable changes to **dsh-turnbar** are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); versions respect semver.

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