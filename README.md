# dsh-turnbar

> A progress bar for your agent conversations.

Long agent sessions are productive — until you need to find *that one requirement
you mentioned 80 turns ago*. Native scrollbars make you guess and re-scroll.
dsh-turnbar gives your DeepSeek Harness chat a video-style progress bar: hover to
preview any turn, drag to scrub, click to jump, `Esc` to come back.

![hover preview](docs/demo-hover.png)

**Install** (dsh ≥ 0.1.0-rc.5):

```sh
dsh plugin --profile web add dsh-turnbar
```

That's it — restart the web app, open any session, and the bar appears above the
input box. Zero config. Historical sessions are backfilled automatically, so the
bar always shows the **whole** conversation, not just what's loaded.

![jump with highlight](docs/demo-jump.png)

## Features

- 🎚 **Full-map progress bar** — every turn is a segment; the playhead tracks
  where you're reading. 150+ turns are aggregated into ≤40 groups so the bar
  never becomes a mess.
- 🖼 **Hover preview cards** — see *who said what* before you jump: the turn's
  first lines, tool-call count, file edits, token usage, and steering messages.
  Pin-worthy detail, zero clicks.
- ⤴ **Click / drag to jump** — click a segment to land in ≤300 ms with a
  highlight ring; press and drag to scrub through turns like a video timeline.
  Jumps across unloaded history page it in automatically.
- ↩ **Esc to return** — after any jump, `Esc` (or the toast) takes you back to
  exactly where you were.
- 🧩 **Graceful degradation** — if your dsh version changes APIs, dsh-turnbar
  hides itself instead of breaking your session.

## Why not just use dsh-navbar?

| | dsh-turnbar | dsh-navbar | dsh-conversation-outline |
|---|---|---|---|
| Form | full-map bar, always visible | sliding dot window (>11 nodes) | sidebar outline tab |
| Data source | session event log (full history) | loaded DOM only | session log (host) |
| Hover preview with rich meta | ✅ tools/files/tokens | text only | list, no preview cards |
| Drag scrub | ✅ | ❌ | ❌ |
| Esc return | ✅ | ❌ | ❌ |
| Works beyond loaded window | ✅ | ❌ | ❌ |
| Standalone install | ✅ | ✅ | requires better-sidebar |

All three are MIT and genuinely useful — dsh-turnbar just goes further on the
*feel*: it's a video player, not a list.

## Compatibility

Tested against dsh `0.1.0-rc.5` / `0.1.0-rc.6` (web profile). Works with the
official web UI's `conversation.composer.dock` slot; no patches, no UI hacks.

| dsh version | status |
|---|---|
| ≥ 0.1.0-rc.5 (web) | ✅ full features |
| older / non-web profiles | plugin stays inert; nothing breaks |

## Roadmap

- v0.2: keyboard navigation (`⌘↑`/`⌘↓`), bookmarks
- v1.0: auto chapters (task boundaries), `⌘K` in-conversation search, token /
  context-window gauge

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

MIT — same as dsh. [简体中文](README.zh-CN.md)
