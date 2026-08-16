# dsh-turnbar

**[English](README.md) | [简体中文](README.zh-CN.md)**

> 给你的 agent 会话装上一条视频进度条。

长会话用起来很爽，直到你想找回"80 轮之前提过的那条要求"。这时候原生滚动条只会让你瞎猜。
dsh-turnbar 给 DeepSeek Harness 的对话区加了一条视频播放器式的进度条：悬停就能预览任何一轮、
按住拖动扫过全部轮次、点一下直接跳过去、`Esc` 一键回到原位。

![悬停预览](https://raw.githubusercontent.com/rex178178/dsh-turnbar/main/docs/demo-hover.png)

## 安装

先确认两件事：**终端里有 `dsh` 命令**（`dsh --version` 能输出版本，且 ≥ 0.1.0-rc.5），
以及**你平时就是用它启动 web 的**。然后：

```sh
dsh plugin --profile web add dsh-turnbar
```

装完**重启 web 实例**，打开任意会话，进度条就出现在输入框上方。零配置。

两个常见坑，提前说清楚：

- 如果你是给一个**全新的 profile** 安装，命令会自动建 profile，但只带基础包、**不含 web UI**
  （`@deepseek-ai/dsh-web-app`）。这种情况请装进你正在用的 web profile，或装完再手动
  `dsh plugin --profile <名字> add @deepseek-ai/dsh-web-app`。
- 如果 `dsh` 命令本身不存在（提示 command not found），先按官方方式安装 dsh 本体，
  插件才有地方可装。

历史会话会自动回填，进度条永远显示**完整**会话，而不是只显示当前已加载的部分。

![跳转高亮](https://raw.githubusercontent.com/rex178178/dsh-turnbar/main/docs/demo-jump.png)

## 功能

- 🎚 **全景进度条**：每轮一段，阅读位置用**段高亮**实时标出来；超过 150 轮自动聚合成
  ≤40 组，条永远不会糊成一片。
- 🖼 **悬停预览卡**：跳之前先知道"这轮讲了什么"——首句、工具调用数、改过的文件、
  token 用量、轮内补充消息，悬停一下全都有。被终止的空轮会置灰，卡片上注明
  「该轮已终止，无对话内容」，不装懂。
- 🔎 **会话内搜索**：进度条右端的放大镜按钮或 `⌘K` 都能唤起。搜你说过的，也搜 agent
  说过的，覆盖**整个会话**（包括没加载出来的历史）；结果带计数，↑↓ 选择时自动滚进
  视野，回车直接落到进度条上。
- ⤴ **点击 / 拖动跳转**：点一下 ≤300ms 落地并高亮；按住拖就像拖视频进度一样扫过各轮。
  目标轮还没加载时会自动翻页直到找到为止。
- ⌨️ **`⌘↑` / `⌘↓`**：从你正在读的位置逐轮上下走，空轮自动跳过。
- ↩ **Esc 返回原位**：每次跳转后按 `Esc`（或点左下角提示条）精确回到跳转前的位置。
- 🧩 **优雅降级**：哪天 dsh 改了 API 不兼容，插件会自己藏起来，绝不让你的会话崩掉。

## 为什么还要再做一个导航插件？

dsh 发布头四天里涌进来 9 个导航插件，但清一色是"导航轨 / 抽屉 / 点链"：给你一串
用户消息让你点。dsh-turnbar 是唯一做成**播放器**形态的：

| | dsh-turnbar | dsh-navbar | dsh-chat-timeline | dsh-message-navigator | dsh-conversation-outline |
|---|---|---|---|---|---|
| 形态 | 常驻全景进度条 | 滑动窗口点链 | 官网导航轨复刻（右侧细轨） | 大纲抽屉 | 侧栏大纲 tab |
| 全会话地图（超出已加载窗口） | ✅ 事件日志 | ❌ | ❌ | ❌ | ❌ |
| 拖动 scrub | ✅ | ❌ | ❌ | ❌ | ❌ |
| 富元信息悬停卡（工具/文件/token） | ✅ | ❌ | ❌ | ❌ | ❌ |
| Esc 返回原位 | ✅ | ❌ | ❌ | ❌ | ❌ |
| 会话内搜索 | ✅ 全文（用户+助手） | ❌ | ❌ | 仅用户消息 | ❌ |
| 独立安装 | ✅ | ✅ | ✅ | ✅ | 依赖 better-sidebar |

它们都是 MIT 协议、各有各的好——dsh-turnbar 只是在"手感"上走得更远：**它是播放器，不是列表。**
想搭配使用的话见下面。

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

已在 dsh `0.1.0-rc.5` / `0.1.0-rc.6`（web profile）实测。挂在官方
`conversation.composer.dock` 插槽上，无 patch、无 UI hack。

## Roadmap

- v1.0：章节自动分段（任务边界）、书签、token/上下文余量仪表

## 开发

```sh
pnpm install
pnpm test        # vitest：fold 逻辑、卡片模型、host 半区降级
pnpm build       # tsdown：lib/index.mjs（node 半区）+ lib/client.js（web 半区）
```

架构：双半区插件——node 半区把 `session/event` firehose 折叠成轮次记录（sidecar 持久化），
经 `/plugins/dsh-turnbar/state` 提供给浏览器；web 半区把进度条渲染进官方 composer dock 插槽。
所有 dsh API 接触面收敛在 `src/platform/dsh/`。

## License

MIT。
