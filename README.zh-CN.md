# dsh-turnbar

[![npm version](https://img.shields.io/npm/v/dsh-turnbar)](https://www.npmjs.com/package/dsh-turnbar)
[![npm downloads](https://img.shields.io/npm/dm/dsh-turnbar)](https://www.npmjs.com/package/dsh-turnbar)
[![license](https://img.shields.io/github/license/rex178178/dsh-turnbar)](LICENSE)

**[English](README.md) | [简体中文](README.zh-CN.md)**

> 给你的 agent 会话装上一条视频进度条。

长会话用起来很爽，直到你想找回"80 轮之前提过的那条要求"。这时候原生滚动条只会让你瞎猜。
dsh-turnbar 给 DeepSeek Harness 的对话区加了一条视频播放器式的进度条：悬停就能预览任何一轮、
按住拖动扫过全部轮次、点一下直接跳过去、`Esc` 一键回到原位。

![悬停预览](https://raw.githubusercontent.com/rex178178/dsh-turnbar/main/docs/demo-hover.png)

![悬停卡、拖动扫过与 ⌘K 搜索落图](https://raw.githubusercontent.com/rex178178/dsh-turnbar/main/docs/demo-scrub.gif)

## 安装

三条路，任选其一：

**① 插件市场（最省事）**：dsh 里打开 [dshmarket](https://github.com/dsh-market/dsh-market)
市场，搜「turnbar」一键安装。

**② 命令行**：打开 Mac 的「终端」App（Terminal.app），粘贴：

```sh
dsh plugin --profile web add dsh-turnbar
```

注意：这条命令要在**终端 App** 里运行，不是在 dsh 的聊天框里。如果你的终端不认识
`dsh` 这个命令（输入 `dsh --version` 提示 command not found，说明 dsh 不是全局安装的，
比如你一直用桌面版或让 AI 帮你启动），先跑：

```sh
npm install -g @deepseek-ai/dsh
```

**③ 让 AI 帮你装**：直接对你的 AI 说"帮我装 dsh-turnbar"，它会执行上面的命令——
和你之前装其他插件的方式一样。

装完**重启 dsh** 生效。零配置，历史会话自动回填，进度条永远显示**完整**会话。

![跳转落地](https://raw.githubusercontent.com/rex178178/dsh-turnbar/main/docs/demo-jump.png)

## 功能

- 🎚 **全景进度条**：每轮一段，阅读位置用**段高亮**实时标出来；超过 150 轮自动聚合成
  ≤40 组，条永远不会糊成一片。
- 🖼 **悬停预览卡**：跳之前先知道"这轮讲了什么"——首句、工具调用数、改过的文件、
  token 用量、轮内补充消息，悬停一下全都有。被终止的空轮会置灰，卡片上注明
  「该轮已终止，无对话内容」，不装懂。
- 🔎 **会话内搜索**：进度条右端的放大镜按钮或 `⌘K` 都能唤起。搜你说过的，也搜 agent
  说过的，覆盖**整个会话**（包括没加载出来的历史）；结果带计数，↑↓ 选择时自动滚进
  视野，回车直接落到进度条上。**结果还会直接画在进度条上**——命中的轮次泛琥珀色，
  搜「TypeScript」一眼就能看到它在会话里的分布（v0.3）。
- ⛽ **上下文余量仪表**：悬停任一轮就能看到"那一刻"的上下文占用（「上下文 62% · 余
  38k」），80%/95% 阈值处颜色递进告警；最新一轮越过阈值时进度条尾端先泛琥珀色再变红——
  不悬停也能发现油箱快空了（v0.3）。
- 📑 **章节刻度**：`/goal` 轮在条上标出细刻度线，长会话因此有了看得见的"里程碑"，
  不需要任何手工记账（v0.3）。
- 🧭 **轨迹视图跳转**：`⌘/Alt` + 点某一段，打开官方 *Trajectory* 视图并滚到该轮
  那一行、居中高亮；轨迹视图不可用时自动回落为普通会话内跳转（v0.3）。
- ⤴ **点击 / 拖动跳转**：点一下 ≤300ms 即时落地；按住拖就像拖视频进度一样扫过各轮。
  目标轮还没加载时会自动翻页直到找到为止。
- ⌨️ **`⌘↑` / `⌘↓`**：从你正在读的位置逐轮上下走，空轮自动跳过。
- ↩ **Esc 返回原位**：每次跳转后按 `Esc`（或点左下角提示条）精确回到跳转前的位置。
- 🧩 **优雅降级**：哪天 dsh 改了 API 不兼容，插件会自己藏起来，绝不让你的会话崩掉。

![⌘K 搜索——命中的轮次在条上泛琥珀色](https://raw.githubusercontent.com/rex178178/dsh-turnbar/main/docs/demo-search.png)

## 为什么还要再做一个导航插件？

轮次导航这块很快就挤满了：dsh 从 `0.1.2` 起自带一条**原生轮次轨道**，社区又给它挂上了
二十来种预览、搜索和收藏插件。但它们几乎清一色是"轨 / 抽屉 / 点链"：给你一串消息让你点。
dsh-turnbar 是唯一做成**播放器**形态的——整个会话就是一条常驻的全宽进度条，和原生轨道
并排存在，而不是取代它。

悬停预览和点击跳转如今已是标配，所以下表只留能拉开差距的项——以及我们落后的那几行：

| | dsh-turnbar | 原生轨道 | dsh-milestone | dsh-message-rail | dsh-jumpbar | dsh-codex-timeline | dsh-navbar |
|---|---|---|---|---|---|---|---|
| 形态 | 全宽进度条（底部 dock） | 官方内置竖向轨 | 右侧圆点时间线 | 左侧导航轨（Codex 风格） | 右缘 minimap 条带 | 增强原生轨道 | 右缘节点串 |
| 整个会话一屏可见 | ✅ 一条条全览 | ❌ | ⚠️ 圆点 + 另开会话全表 | ⚠️ 全量索引，点击逐页加载 | ⚠️ 消息 minimap | ❌ | ❌ |
| 拖动 scrub | ✅ 在全宽条上拖 | ❌ | ⚠️ 滚轮在圆点上滑动选中 | ❌ | ✅ 在条带上拖 | ❌ | ❌ |
| 悬停卡：工具 / 文件 / 上下文 | ✅ | ❌ 只有「第 N 轮」 | ❌ 时间·用时·TTFT·token | ❌ 文本 + 时间 | ❌ 文本 | ❌ 内容·时间·token | ❌ |
| 上下文余量仪表（窗口占用，80/95% 告警） | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 章节刻度（`/goal` 里程碑） | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 搜索命中直接画在条上 | ✅ 琥珀段，全景保留 | ❌ | ⚠️ 过滤圆点（非命中即隐藏） | ❌ | ❌ | ⚠️ 结果列表 | ❌ |
| 跨会话搜索 / 书签 | ❌ | ❌ | ✅ 两者都有 | ❌ | ❌ | ⚠️ 收藏 | ❌ |
| 跳转后 `Esc` 回原位 | ✅ | ❌ | ❌ `Esc` 是清空搜索框 | ❌ | ❌ | ❌ | ❌ |
| 升级 dsh 不破 | ✅ 官方插槽，两代持久化 | —— 它本体 | ✅ | ✅ | ✅ | ❌ 只支持 `0.1.2-alpha.3` | ✅ |

有话直说：跨会话搜索和 `#msg=` 书签深链是
[dsh-milestone](https://github.com/SnowCrescenter-tech/dsh-milestone) 的，
我们还没有；轨迹视图跳转与
[dsh-chat-outline](https://github.com/liliuCourier/dsh-chat-outline) 共有。
仍然只此一家的：全宽条这个形态本身、上下文余量仪表、`/goal` 章节刻度、以及
`Esc` 回原位。它们都是 MIT 协议、各有各的好——dsh-turnbar 只是在"手感"上走得更远：
**它是播放器，不是列表。** 想搭配使用的话见下面。

## 互补插件

- [dsh-rewind](https://www.npmjs.com/package/dsh-rewind) —— 把会话回滚到更早的轮次（先跳过去看，再决定回滚）。
- [dsh-turn-fold](https://github.com/Winter-And-You-Gone/dsh-turn-fold) —— 折叠工具调用风暴；它的轮次统计头和我们的预览卡正好互补。

## 致谢

这个插件踩在别人验证过的路上，特此感谢：

- **[@vlln](https://github.com/vlln)** 的 [dsh-navbar](https://github.com/vlln/dsh-navbar) ——
  悬停预览与点击跳转的 DOM 交互范式、wheel+scrollTop 跳转配方，都是从他那里验证来的；
- **[@YesSanSan](https://github.com/YesSanSan)** 的 [dsh-conversation-outline](https://github.com/YesSanSan/dsh-conversation-outline) ——
  host↔client 同源 JSON 数据桥的正路示范，以及那份非常实用的 `PLUGIN_DEV_NOTES.md`；
- **DeepSeek Harness 团队** —— 官方插槽、session 事件流与持久化 API，让这个插件可以全程走正路，零 patch。

## 兼容性

已在 dsh `0.1.5-rc.1`（web profile，句柄制持久化 `open/read/close`）与
`0.1.0-rc.7`（一步式 `inspect`/`readRaw` 持久化）实测。两代持久化运行时自动
探测，历史回填两代都通。挂在官方 web UI 的 `conversation.composer.dock`
插槽上，无 patch、无 UI hack——这正是要点：**升级 dsh 不需要先卸载
dsh-turnbar**。挂得更深的插件要为此付代价：
[dsh-codex-timeline](https://github.com/Wine-Red/dsh-codex-timeline) 现在改为
增强官方轨道，并且只支持某一个 dsh 版本（`0.1.2-alpha.3`），README 里挂着版本
对照表和按版本安装的包。取舍不同，直说无妨。

和其他占用同一 `composer.dock` 插槽的插件
（[dsh-web-ui-all](https://www.npmjs.com/package/@linxin666/dsh-web-ui-all)
及其内含的 dsh-live-stats / dsh-aionui-panel）可以同槽共存：内置的**共存 CSS
层**（v0.2.2+）把 dock 强制成可换行的行排，进度条永远独占自己一整行，官方
统计行靠在任意第三方条目旁，进度条绝不被挤扁。单轮会话现在也显示一条
1 段进度条（只有全新的 0 轮会话保持隐藏）。

| dsh 版本 | 状态 |
|---|---|
| 0.1.5+（web，句柄制持久化） | ✅ 全功能 |
| 0.1.0-rc.5 – 0.1.1-rc.x（web，inspect/readRaw） | ✅ 全功能（旧链） |
| 更旧 / 非 web profile | 插件保持惰性，什么都不破坏 |

## Roadmap

- 下一步：任务边界章节（不止 `/goal`）、书签、trajectory ↔ 聊天往返打磨。

## 开发

```sh
pnpm install
pnpm test        # vitest：fold 逻辑、卡片模型、host 半区降级
pnpm build       # tsdown：lib/index.mjs（node 半区）+ lib/client.js（web 半区）
```

架构：双半区插件——node 半区把 `session/event` firehose 折叠成轮次记录（sidecar 持久化），
经 `/plugins/dsh-turnbar/state` 提供给浏览器；web 半区把进度条渲染进官方 composer dock 插槽。
所有 dsh API 接触面收敛在 `src/platform/dsh/`。

## 支持这个项目

如果 dsh-turnbar 让你的长会话好用了，去
[GitHub](https://github.com/rex178178/dsh-turnbar) 点个 ⭐，能帮更多 dsh 用户发现它。

## License

MIT。
