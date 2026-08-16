# dsh-turnbar 发布文案（2026-08-16 · 复制即用）

> 状态：npm 0.2.0 已发布；GitHub rex178178/dsh-turnbar 已上线；awesome 申请 #257/#934 已提交。
> 发布渠道节奏：HN 与 Reddit 同周、同一 48h 窗口引爆；V2EX 紧随；X 与 HN 同日。

---

## HN（Show HN，英文，发帖时间：周二~四美东 8–10 点）

**标题：** `Show HN: dsh-turnbar – a video-style progress bar for AI agent chats`

**正文：**

Long agent conversations are great — until you need to find "that one requirement I mentioned 80 turns ago". Scrollbars make you guess and re-scroll.

dsh-turnbar gives DeepSeek Harness chats a video-style progress bar:

- **Full-map bar** — every turn is a segment. The whole conversation is visible at once, including history beyond what's loaded (it's built on the session event log, not the DOM).
- **Hover previews** — see who said what before you jump: first lines, tool-call counts, file edits, token usage. No clicks needed.
- **Drag to scrub** — like scrubbing a video timeline; release to jump.
- **⌘K search** — search everything you or the agent said across the whole session; results land on the bar.
- **Esc to return** — after any jump, go back to exactly where you were.

Screenshots: https://github.com/rex178178/dsh-turnbar

Install: `dsh plugin --profile web add dsh-turnbar`（npm）— done in seconds, zero config.

Why this form? In dsh's first four days, nine navigation plugins appeared — all of them are rails, drawers, or dot chains: a list of messages you click through. We built the only "player": a full map you can hover, scrub, search, and return from. The data layer (event log → turn records with rich metadata) is what makes search and beyond-window navigation possible — DOM-anchored plugins can't get there.

MIT, dual-half plugin on the official composer.dock slot, no patches. Tested on dsh 0.1.0-rc.5/rc.6. Happy to answer questions about the fold/events architecture.

---

## Reddit r/LocalLLaMA（英文，同周，遵守 9:1 自我推广比例）

**标题：** `I built a video-style progress bar for DeepSeek Harness conversations — hover previews, drag scrub, ⌘K search`

**正文（技术向）：**

After getting lost in 200+ turn agent sessions one too many times, I built dsh-turnbar for DeepSeek Harness: a progress bar above the composer where every turn is a segment.

The interesting part is the data path. The web UI only keeps a loaded window in memory, so navigation plugins that read the DOM can't see history you haven't scrolled to. dsh-turnbar subscribes to the `session/event` firehose (turn/start|end, user/assistant messages with token usage, tool calls) and folds everything into per-turn records; for historical sessions it backfills from the persistence layer (~300ms for a 21k-event session). That gives you: the whole conversation as a map, search across everything ever said (⌘K), and jumps that auto-page history in.

Interaction-wise it borrows from video players: hover = preview card with tools/files/tokens, drag = scrub, click = jump with a highlight, Esc = return to where you were. 60fps by keeping all pointer state out of React (imperative DOM, rAF-throttled).

npm: dsh-turnbar · repo: github.com/rex178178/dsh-turnbar · MIT, works with the official composer.dock slot.

Would love feedback on the interaction model — especially whether scrubbing feels right vs. a plain click list.

---

## V2EX（中文，/share 或 /programmer，HN 发布次日）

**标题：** `给 DeepSeek Harness 的长会话装了个视频进度条（悬停预览 / 拖动 / ⌘K 搜索）`

**正文：**

长会话最大的痛点不是"消息太多"，而是"找不到之前那轮说过的话"。滚动条只能靠猜。

我给 dsh 写了个插件 dsh-turnbar，把对话变成一条视频进度条：

- 每轮一段，**全会话一图尽览**（包括没加载过的历史——数据来自会话事件日志，不是 DOM）；
- 悬停出预览卡：首句、工具调用数、文件改动、token 用量；
- 按住拖动像拖视频一样扫过各轮，松手直达；
- ⌘K 搜你说过的和 agent 说过的所有内容，命中直接落到进度条上；
- 跳错了？Esc 精确回到原位。

安装：`dsh plugin --profile web add dsh-turnbar`，零配置。

背景：dsh 开源 4 天涌进了 9 个导航插件，全是"轨/抽屉/点链"。这个是目前唯一做成播放器形态的——全景条 + 数据层支撑的搜索，DOM 系插件架构上做不了。

仓库：github.com/rex178178/dsh-turnbar（MIT，npm: dsh-turnbar）

---

## X（英文，与 HN 同日发）

**Thread：**

1. Your agent session is 200 turns long. The thing you need is in turn 47. Good luck scrolling. — dsh-turnbar gives DeepSeek Harness a video-style progress bar: hover any turn to preview it, drag to scrub, click to jump, Esc to come back. github.com/rex178178/dsh-turnbar

2. The whole conversation as a map — even the parts not loaded yet. Built on the session event log, not the DOM (that's what makes search + beyond-window jumps possible).

3. ⌘K search across everything you or the agent ever said. Results land on the bar.

4. Install: `dsh plugin --profile web add dsh-turnbar` — 3 seconds, zero config. MIT.

(配 demo-hover.png / demo-jump.png 两张图；有屏录就换成 15s scrub 视频)

---

## 目录站提交清单（FINDINGS.md §4；多数从 npm/GitHub topic 自动收录，需手动的先查提交方式）

- dshplugins.cc · dshplugin.dev · dshbase.com · dsh-plugins.org（~475 自动爬取）· dshget.com · dshplugin.app · dshplugin.store
- dsh-market（dshmarket 插件内的插件市场——自动索引则无需操作）
- awesome：0xsline#257 ✓ 已提交 · awesome-dsh-plugin#934 ✓ 已提交；fork 被 GitHub 403 临时限制，稍后重试转正式 PR
