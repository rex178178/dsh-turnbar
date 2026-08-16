# dsh-turnbar

**[English](README.md) | [简体中文](README.zh-CN.md)**


> A progress bar for your agent conversations.

Long agent sessions are productive — until you need to find *that one requirement
you mentioned 80 turns ago*. Native scrollbars make you guess and re-scroll.
dsh-turnbar gives your DeepSeek Harness chat a video-style progress bar: hover to
preview any turn, drag to scrub, click to jump, `Esc` to come back.

![hover preview](https://cdn.jsdelivr.net/gh/rex178178/dsh-turnbar@main/docs/demo-hover.png)

**Install** (dsh ≥ 0.1.0-rc.5):

```sh
dsh plugin --profile web add dsh-turnbar
```

That's it — restart the web app, open any session, and the bar appears above the
input box. Zero config. Historical sessions are backfilled automatically, so the
bar always shows the **whole** conversation, not just what's loaded.

![jump with highlight](https://cdn.jsdelivr.net/gh/rex178178/dsh-turnbar@main/docs/demo-jump.png)

## Features

- 🎚 **Full-map progress bar** — every turn is a segment; the playhead tracks
  where you're reading. 150+ turns are aggregated into ≤40 groups so the bar
  never becomes a mess.
- 🖼 **Hover preview cards** — see *who said what* before you jump: the turn's
  first lines, tool-call count, file edits, token usage, and steering messages.
  Pin-worthy detail, zero clicks.
- 🔎 **`⌘K` in-conversation search** — search everything the agent said or you
  said, across the *whole* session (including history beyond what's loaded);
  pick a result and it lands on the bar.
- ⤴ **Click / drag to jump** — click a segment to land in ≤300 ms with a
  highlight ring; press and drag to scrub through turns like a video timeline.
  Jumps across unloaded history page it in automatically.
- ⌨️ **`⌘↑` / `⌘↓`** — hop one turn at a time from where you're reading.
- ↩ **Esc to return** — after any jump, `Esc` (or the toast) takes you back to
  exactly where you were.
- 🧩 **Graceful degradation** — if your dsh version changes APIs, dsh-turnbar
  hides itself instead of breaking your session.

## Why yet another navigation plugin?

Nine navigation plugins appeared in dsh's first four days — all of them are
*rails, drawers, or dot chains*: a list of user messages you click through.
dsh-turnbar is the only one shaped like a **video player**:

| | dsh-turnbar | dsh-navbar | dsh-chat-timeline | dsh-message-navigator | dsh-conversation-outline |
|---|---|---|---|---|---|
| Form | full-map bar, always visible | sliding dot window | official-rail clone (right rail) | outline drawer | sidebar outline tab |
| Whole-conversation map (beyond loaded window) | ✅ event log | ❌ | ❌ | ❌ | ❌ |
| Drag scrub | ✅ | ❌ | ❌ | ❌ | ❌ |
| Rich hover meta (tools/files/tokens) | ✅ | ❌ | ❌ | ❌ | ❌ |
| `Esc` return | ✅ | ❌ | ❌ | ❌ | ❌ |
| In-conversation search | roadmap | ❌ | ❌ | outline only | ❌ |
| Standalone install | ✅ | ✅ | ✅ | ✅ | requires better-sidebar |

All of them are MIT and genuinely useful — dsh-turnbar just goes further on the
*feel*: it's a video player, not a list. See also
[Companions](#companions) below.

## Companions

- [dsh-rewind](https://www.npmjs.com/package/dsh-rewind) — roll the conversation
  back to an earlier turn (jump over, then rewind).
- [dsh-turn-fold](https://github.com/Winter-And-You-Gone/dsh-turn-fold) — collapse
  tool-call storms; its per-turn stats pair well with our preview cards.

## Compatibility

Tested against dsh `0.1.0-rc.5` / `0.1.0-rc.6` (web profile). Works with the
official web UI's `conversation.composer.dock` slot; no patches, no UI hacks.

| dsh version | status |
|---|---|
| ≥ 0.1.0-rc.5 (web) | ✅ full features |
| older / non-web profiles | plugin stays inert; nothing breaks |

## Roadmap

- v1.0: auto chapters (task boundaries), bookmarks, token / context-window gauge

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
