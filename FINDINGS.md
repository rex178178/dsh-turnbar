# FINDINGS.md · D1 竞品扫描与生态情报
**日期：2026-08-16 · 执行人：ZCode（D1 冲刺）· 结论：GO，差异化收窄但成立，节奏判断"以天计"**

情报来源：web 检索（dshplugin.dev / dshplugins.cc / dshplugin.store / GitHub）、`vendor/` 下 clone 的 dsh-navbar 与 deepseek-harness 源码通读、本机 `~/.dsh` 实勘、npm registry 直查。dsh 官方仓库版本 **0.1.0-rc.5**（2026-08-13 squash 上线）。

---

## 1. 竞品格局（比规划时严峻，但我们的组合仍空）

| 插件 | 形态 | 数据通道 | 已占掉的功能 | 关键弱点（我们的机会） |
|---|---|---|---|---|
| **vlln/dsh-navbar** v0.3.0（已 clone 通读，用户本机在用） | 右缘点链（>11 滑动窗口） | 无（纯 DOM anchor） | 悬停预览、点击跳转高亮、滚轮逐条、**pin 精选（已占 V1 书签）** | 无全局概览；无元信息；无搜索；无数据层。作者 vlln 多产（task-status/plugin-registry/focus-chat），迭代以天计 |
| **YesSanSan/dsh-conversation-outline**（最强相邻） | better-sidebar 侧栏 tab | **`ctx.sessionQuery.readSession/listEvents` + `ctx.webServer.register` JSON 路由**（读会话日志的正路示范） | **轮次结构化大纲、LLM 一句话标题（llm.stream+指纹缓存）、跨页跳转（自动加载历史）、检查点/错误行** | 停下来查的"地图"：要开侧栏 tab；无全景条/scrub/悬停卡；**无关键词搜索**；无 token；依赖第三方 better-sidebar v0.12+（安装链长）；留下 `docs/PLUGIN_DEV_NOTES.md` 开发笔记（我们的重要参照） |
| **invalidnaaaame/dsh-scroll-timeline** | 侧边横条节点轨（navbar MIT 衍生） | 无（DOM） | 全历史常显（容器滚动）、磁吸 hover | 仍无数据层/元信息/搜索；证明"全图可见"是共同演化方向 |
| **Yujm888/dsh-turn-rail** | 轮次轨道 | 未查（npm 可装） | — | 源码 D2 跟进 |
| **dsh-turn-index**（官方仓库 discussions#493 在议，npm v0.1.1） | 轮次索引侧栏 | 未查 | "长会话下可靠" | 官方讨论区曝光 = 品类需求被官方社区看见 |
| **dsh-rewind**（npm，l-dot，v0.2.2） | **回滚**插件：回退到某轮用户消息 + git 感知文件恢复 | — | — | **不是导航**：证明 "rewind" 在本生态已被语义占位为"回滚"。与我们是互补关系（跳过去看 vs 回滚重跑），README 可互链 |

**格局判定（对 PLAN.md 1.2 的二次修订）**：形态层（点链/轨道/侧栏）5 天内已被 5 个插件填充；数据层读日志 + 轮次结构化已被 outline 占位。**仍无人做的组合：常驻全景进度条 + 拖动 scrub + 悬停富元信息卡（工具数/文件/token）+ 会话内关键词搜索 + token/上下文余量。** 窗口从"2~6 周"修正为"**以天计**"——D7 发布窗口必须守住。

## 2. 战略调整（已回写 PLAN.md 1.2）

1. **与 outline 的区隔是生死线**："停下来查的地图（侧栏列表）" vs "不离手的方向盘（常驻条、悬停即得、拖动即达）"。README 对照表必须含它。
2. **⌘K 搜索从 V1 提前到 v0.1.x**：五个竞品无一有；`user/message` 的 `data.content` 全文在手，成本低。
3. **富元信息悬停卡是护城河**：DOM 系拿不到 `tool/call`/`usage`/`contextWindow`，我们天然有（SPIKE.md Q1/Q2）。
4. **与 dsh-rewind（回滚插件）互链**：跳转过去看（我们）→ 决定回滚（它），天然上下游。

## 3. npm 命名实查（2026-08-16 直查 registry）

| 名字 | 状态 | 备注 |
|---|---|---|
| ~~dsh-rewind~~ | **200 已占** | l-dot 的回滚插件 v0.2.2，语义撞车，弃 |
| **dsh-turnbar** | 404 可用 | **终审选定（用户 2026-08-16）**：形态即名字，turn 族检索可发现 |
| dsh-scrub / dsh-timeline / dsh-playback | 404 可用 | 备选 |

**终审落定：`dsh-turnbar`（用户 2026-08-16 选定）**。npm publish 需用户账号（准备指引见 D2 汇报）。slogan 不变："A progress bar for your agent conversations."

## 4. 生态基建事实（投放/工程用）

- 安装命令形态（README 用）：`dsh plugin --profile web add dsh-scrub`（npm）或 `github:<user>/dsh-scrub#main`（git 源不触发构建，navbar 范式）。安装后**重启 web 生效**，设置页插件面板可停用。
- profile 结构（本机 `~/.dsh/profiles/web/` 实勘）：pnpm workspace，插件进 `dependencies` + `dsh.profile.bundles`；用户 patch 层在 `cordis.patch.yml`。
- Cordis npm 包：`@deepseek-ai/cordis`（当前 ^4.0.1）；客户端官方包 `@deepseek-ai/dsh-client-runtime` / `@deepseek-ai/dsh-client-ui-primitives`；dsh engines：`>=0.1.0-rc.5`，node `>=22.19.0`。
- 目录站/awesome（D7 提交清单）：dshplugins.cc、dshplugin.dev、dshbase.com、dsh-plugins.org、dshplugin.app、dshget.com、dshplugin.store；awesome-deepseek-harness（0xsline）、awesome-dsh-plugin（bruc3van/beancookie、awesome-dsh-plugin org）。另有 `dsh-find-plugin`（awesome org 推荐先装它）。
- 生态规模：GitHub dsh-plugin 标签 1000+（DSH Plugin Store 称 1080+）。

## 5. 测试夹具来源（本机实勘）

`~/.dsh/sessions/--Users-rexli-asset-tracker--/` 下有真实长会话：session-e40715b8（**5.9MB：43 条 user/message、404 条 assistant/message、401 次 tool/call、22 个 turn**）与 session-70075210（1.3MB、6 user/43 step）。可直接作回放夹具与 500 轮级性能用例基底（脱敏后入 `test/fixtures/`）。

## 6.5 D7 前夜竞品复检（2026-08-16，发布前最后一次全量扫描）

### 战场现状：9 个直接导航竞品（4 天涌入）

| 插件 | 形态 | 数据源 | 亮点 | 弱点（我们的机会） |
|---|---|---|---|---|
| vlln/dsh-navbar ★24（08-15 更新） | 右缘点链（滑动窗口>11） | DOM | pin 精选、滚轮切换、生态多产作者 | 无全图/scrub/元信息/搜索 |
| jjxjjjjiik-bot/dsh-chat-timeline ★6（npm） | **chat.deepseek.com 官网导航轨 1:1 复刻**（右侧常驻细轨） | host 会话投影 | 血统最正、悬停预览、滚动高亮、自动加载历史、无障碍 | 仍是用户消息列表轨；无 scrub/元信息/搜索/全图聚合 |
| UlaBe/dsh-conversation-nav ★0（npm） | 右侧按钮→大纲抽屉 | 客户端 snapshot | 自动加载完整历史、Scroll Spy 高亮、实时追加 | 抽屉非常驻；无 scrub/元信息 |
| kekcidbbe-sudo/dsh-message-navigator ★1（npm） | 大纲抽屉 TOC | useSession snapshot | **带搜索**、Markdown 导出、滚动同步高亮 | 抽屉列表；搜索仅限用户消息；无 scrub/元信息/全图 |
| KeLearns/dsh-navigation-bar ★1 | 钢琴键式导航条 | host+browser | 视觉新颖、悬停用户+回复预览 | 用户消息键；无 scrub/元信息 |
| xiaoso456/dsh-turn-navigator ★1（npm） | 轮次导航面板 | ? | — | 文档薄 |
| invalidnaaaame/dsh-scroll-timeline ★3 | 侧边时间线 | DOM | 全历史常显 | 无数据层 |
| Yujm888/dsh-turn-rail ★2 | 轮次轨道 | ? | — | 文档薄 |
| Winter-And-You-Gone/dsh-turn-fold ★1 | 折叠（非导航）：工具调用/整轮折叠 + 轮次统计头（耗时/token/tok/s） | host | 折叠体验好；**轮次 token 统计与我们的卡片 meta 互补** | 非导航，互链机会 |

+ 老对手 dsh-conversation-outline ★0（依赖 better-sidebar，LLM 标题）、318197375/dsh-bottom-stats ★3（底部 stats 行，与 composer 区相邻但非导航）。

### 官方动向（R1 风险核验）

- deepseek-ai/deepseek-harness ★119k，**08-13 后 0 提交、0 相关 issue/discussion**——官方内置导航未现形，R1 暂休眠；但 4 天 9 个社区实现说明需求已被验证，官方跟进是时间问题（估计 1–2 周量级）。
- chat-timeline 复刻的"官网导航轨"来自 chat.deepseek.com 消费级产品——**品类被 DeepSeek 自己背书**，是利好不是威胁。

### 差异化核验：我们的五根支柱还剩几根独有？

| 支柱 | 现状 | 判定 |
|---|---|---|
| 常驻全景条（全量事件日志，≤40 段聚合） | 9 家全是轨/抽屉/列表，无人是全图进度条 | ✅ 独有 |
| 拖动 scrub | 无人有 | ✅ 独有 |
| 富元信息悬停卡（🔧/📄/tok/steering） | 无人有（turn-fold 的轮次统计头是折叠场景，互补） | ✅ 独有（形式与场景均不同） |
| Esc 返回原位 | 无人有 | ✅ 独有 |
| 会话内搜索 | **message-navigator 已有（大纲抽屉内、仅用户消息）** | ⚠️ 被侵蚀：需差异化（⌘K + 全文含助手首段 + 结果预览 + 落到全图上） |
| 滚动高亮当前轮 | chat-timeline / conversation-nav 已有（列表内高亮） | ⚠️ 概念被实现（形式不同：我们是全图 playhead） |

### 结论：方案不大调，四处收紧

1. **叙事唯一化**：8/9 竞品是"导航轨/抽屉"，我们是唯一的"视频播放器"（底部全景条 + scrub）——发布文案、README、HN 标题全部围绕这一点打。
2. **搜索差异化收紧**：⌘K 计划不变但话术改为"在全图上搜索"（含助手内容 + 结果直接落到进度条）；v0.2 尽快（D8–D9），并在 README roadmap 显眼处承诺。
3. **README 对照表扩充**：加 chat-timeline / message-navigator / navigation-bar 三行（已更新）。
4. **互链而非互踩**：README 加 "Companions" 小节——dsh-rewind（回滚，上下游）、dsh-turn-fold（折叠+轮次统计，互补）——社区口碑是这批插件作者的共同货币。

### 窗口判断

品类填充已从"天"加速到"半天"：D7 发布是"玩家形态第一名"的最后合理窗口；再拖，心智会被 chat-timeline（官网血统）或 navbar（★24 生态）拿走。**今天发布。**

## 6. Go / No-Go

**GO**。差异化组合成立、全部技术依赖有官方正路（见 SPIKE.md）、测试数据在手、命名可落。唯一红线：D7 不动摇；若 D5 卡/scrub 未达标按保险丝砍 scrub 先发。

## 7. D8 追加 · web-ui-all 同槽冲突实证与 live-stats 模式借鉴（v0.2.2 · 2026-08-16）

- 安装 dsh-web-ui-all（聚合包，含 dsh-live-stats / dsh-aionui-panel）后 TurnBar 被挤到 ~82px（实测）。
- 根因：live-stats 的 `MERGE_CSS` 用 `:has(> [data-dsh-live-tps])` 把 `conversation.composer.dock` 包装层
  强制改为 flex-row nowrap，且其兄弟选择器按 DOM 相邻匹配误中 TurnBar（限宽 620px + 剥 padding）。
- 借鉴：live-stats 用 `:has()` 锚定 + `!important` + 兄弟选择器把自家条目变成紧凑行内单元，但只考虑
  了自己和官方条目；TurnBar 升级为**通用共存层**（更高特异性 + `!important` 同时压过包装层 flex 与
  兄弟误伤规则），无 JS、无 MutationObserver，确定性方案。
- 验收：布局重现台场景 B/C/D `fullWidth===true` 且场景 C stats 保持 720；真机 profile turnbar-compat
  验证 ≥2 轮/1 轮/0 轮行为与交互冒烟均通过。
