# dsh-turnbar

[![npm version](https://img.shields.io/npm/v/dsh-turnbar)](https://www.npmjs.com/package/dsh-turnbar)
[![license](https://img.shields.io/github/license/rex178178/dsh-turnbar)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/rex178178/dsh-turnbar)](https://github.com/rex178178/dsh-turnbar)

**[English](README.md) | [简体中文](README.zh-CN.md)**

> A progress bar for your agent conversations.

Long agent sessions are productive — until you need to find *that one requirement
you mentioned 80 turns ago*. Native scrollbars make you guess and re-scroll.
dsh-turnbar gives your DeepSeek Harness chat a video-style progress bar: hover to
preview any turn, drag to scrub, click to jump, `Esc` to come back.

![hover preview](https://raw.githubusercontent.com/rex178178/dsh-turnbar/main/docs/demo-hover.png)

![scrub, hover cards, and ⌘K search landing on the bar](https://raw.githubusercontent.com/rex178178/dsh-turnbar/main/docs/demo-scrub.gif)

## Install

Three ways, pick one:

**① Plugin market (easiest)**: open [dshmarket](https://github.com/dsh-market/dsh-market)
inside dsh, search "turnbar", one click (listing pending; until it lands, use the options below).

**② Command line**: open your macOS Terminal app and paste:

```sh
dsh plugin --profile web add dsh-turnbar
```

This runs in the **Terminal app**, not in the dsh chat box. If your terminal doesn't
know the `dsh` command (`dsh --version` says command not found — you never installed
dsh globally, e.g. you use a desktop build or let your AI launch it), install it first:

```sh
npm install -g @deepseek-ai/dsh
```

**③ Ask your AI**: just tell your agent "install dsh-turnbar for me" — it runs the
same command on your machine, exactly how you've been installing your other plugins.

Restart dsh afterwards. Zero config; historical sessions are backfilled automatically
and the bar always shows the **whole** conversation.

![jump to a turn](https://raw.githubusercontent.com/rex178178/dsh-turnbar/main/docs/demo-jump.png)

## Features

- 🎚 **Full-map progress bar** — every turn is a segment; the playhead **highlights
  the segment** you're reading. 150+ turns aggregate into ≤40 groups so the bar
  never becomes a mess.
- 🖼 **Hover preview cards** — see *who said what* before you jump: the turn's
  first lines, tool-call count, file edits, token usage, and steering messages.
  Terminated empty turns are dimmed and labeled 「该轮已终止，无对话内容」instead
  of pretending to have content.
- 🔎 **In-conversation search** — the magnifier button at the bar's right edge or
  `⌘K` opens it. Search everything the agent said or you said, across the *whole*
  session (including history beyond what's loaded); results show a count, arrow
  keys scroll the highlight into view, Enter lands the pick on the bar. **Results
  are also drawn on the bar itself** — matching turns glow amber, so a query like
  "TypeScript" shows you at a glance *where* in the conversation it lives (`v0.3`).
- ⛽ **Context fuel gauge** — hover any turn to see the context window occupancy
  *at that moment* ("上下文 62% · 余 38k"), with color escalation at 80%/95%.
  When the latest turn passes those thresholds, the bar's tail edge glows amber,
  then red — you notice the tank is nearly empty without even hovering (`v0.3`).
- 📑 **Chapter ticks** — `/goal` rounds are marked as thin ticks on the bar, so a
  long session gets visible "milestones" without any manual bookkeeping (`v0.3`).
- 🧭 **Trajectory view jump** — `⌘/Alt` + click a segment opens the official
  *Trajectory* view and scrolls to that turn's row, centered and highlighted.
  Falls back to a normal in-chat jump when trajectory is unavailable (`v0.3`).
- ⤴ **Click / drag to jump** — click a segment to land in ≤300 ms;
  press and drag to scrub through turns like a video timeline.
  Jumps across unloaded history page it in automatically.
- ⌨️ **`⌘↑` / `⌘↓`** — hop one turn at a time from where you're reading; empty
  turns are skipped automatically.
- ↩ **Esc to return** — after any jump, `Esc` (or the toast) takes you back to
  exactly where you were.
- 🧩 **Graceful degradation** — if your dsh version changes APIs, dsh-turnbar
  hides itself instead of breaking your session.

## Why yet another navigation plugin?

Nine navigation plugins appeared in dsh's first four days — all of them are
*rails, drawers, or dot chains*: a list of user messages you click through.
dsh-turnbar is the only one shaped like a **video player**:

| | dsh-turnbar | dsh-navbar | dsh-chat-timeline | dsh-message-navigator | dsh-conversation-outline | dsh-codex-timeline | dsh-outline | dsh-chat-outline | dsh-message-preview | dsh-turn-marks |
|---|---|---|---|---|---|---|---|---|---|---|
| Form | full-map bar, always visible | sliding dot window | official-rail clone (right rail) | outline drawer | sidebar outline tab | left rail (Codex-style) | outline overlay | left sidebar outline | right-edge navigator | left-turn strip |
| Whole-conversation map (beyond loaded window) | ✅ event log | ❌ | ❌ | ❌ | ❌ | ⚠️ auto-loads history | ❌ | ⚠️ full mode on demand | ❌ | ❌ |
| Drag scrub | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Rich hover meta (tools/files/tokens) | ✅ | ❌ | ❌ | ❌ | ❌ | ⚠️ latency/tok-s only | ❌ | ❌ | ✅ preview | ✅ preview |
| Context fuel gauge (window occupancy) | ✅ from usage events | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Search (whole conversation incl. assistant) | ✅ + results on the bar | ❌ | ❌ | user msgs only | ❌ | ⚠️ local browser-only | ⚠️ headings/keywords | ⚠️ keyword filter | ❌ | ❌ |
| Chapter ticks (`/goal` milestones) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ markdown headings | ❌ | ❌ | ❌ |
| Trajectory view jump | ✅ `⌘/Alt`+click | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ Ctrl/Shift click | ❌ | ❌ |
| `Esc` return | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Survives dsh upgrades | ✅ official slot + graceful degradation | ✅ | ✅ | ✅ | ⚠️ via better-sidebar | ❌ pins an exact dsh commit, uninstall before upgrading | ✅ | ✅ | ✅ | ✅ |

All of them are MIT and genuinely useful — dsh-turnbar just goes further on the
*feel*: it's a video player, not a list. See also
[Companions](#companions) below.

## Companions

- [dsh-rewind](https://www.npmjs.com/package/dsh-rewind) — roll the conversation
  back to an earlier turn (jump over, then rewind).
- [dsh-turn-fold](https://github.com/Winter-And-You-Gone/dsh-turn-fold) — collapse
  tool-call storms; its per-turn stats pair well with our preview cards.

## Acknowledgements

Built on paths others paved first — with gratitude:

- **[@vlln](https://github.com/vlln)**'s [dsh-navbar](https://github.com/vlln/dsh-navbar) —
  the hover-preview / click-to-jump DOM patterns and the wheel+scrollTop jump recipe;
- **[@YesSanSan](https://github.com/YesSanSan)**'s [dsh-conversation-outline](https://github.com/YesSanSan/dsh-conversation-outline) —
  the host↔client same-origin JSON bridge pattern and its invaluable `PLUGIN_DEV_NOTES.md`;
- **the DeepSeek Harness team** — official slots, session event streams, and
  persistence APIs that let this plugin take the paved road end to end, zero patches.

## Compatibility

Tested against dsh `0.1.5-rc.1` (web profile, handle-based persistence
`open/read/close`) and `0.1.0-rc.7` (one-step `inspect`/`readRaw` persistence).
Both persistence generations are auto-detected at runtime, so history backfill
works on either. Works with the official web UI's `conversation.composer.dock`
slot; no patches, no UI hacks — which is the point: **upgrading dsh does not
require uninstalling dsh-turnbar first.** The one plugin that does require that
dance is
[dsh-codex-timeline](https://github.com/Wine-Red/dsh-codex-timeline): it pins an
exact dsh commit by replacing the official conversation adapter, so the upgrade
checklist says "uninstall before upgrading". Different trade-off, stated plainly.

Coexists with other plugins that share the same `composer.dock` slot —
[dsh-web-ui-all](https://www.npmjs.com/package/@linxin666/dsh-web-ui-all) and its
included dsh-live-stats / dsh-aionui-panel. A built-in co-existence CSS layer
(`v0.2.2+`) forces the dock into a wrapping row so the TurnBar always owns its own
full-width line while the official StatsLine sits beside any third-party entries,
so the bar is never squeezed sideways. Single-turn sessions now show a one-segment
progress bar too (only brand-new 0-turn sessions stay hidden).

| dsh version | status |
|---|---|
| 0.1.5+ (web, handle-based persistence) | ✅ full features |
| 0.1.0-rc.5 – 0.1.1-rc.x (web, inspect/readRaw) | ✅ full features (legacy chain) |
| older / non-web profiles | plugin stays inert; nothing breaks |

## Roadmap

- Next: task-boundary chapters (beyond `/goal`), bookmarks, trajectory ↔ chat
  round-trip polish.

## Development

```sh
pnpm install
pnpm test        # vitest (fold logic, card model, host-half degradation)
pnpm build       # tsdown: lib/index.mjs (node half) + lib/client.js (web half)
```

Architecture: a dual-half plugin — the node half folds the `session/event`
firehose into per-turn records (persisted sidecar), serves them over
`/plugins/dsh-turnbar/state`; the web half renders the bar into the official
composer dock slot. All dsh API contact is confined to `src/platform/dsh/`.

## License

MIT — same as dsh.
