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

## 6. Go / No-Go

**GO**。差异化组合成立、全部技术依赖有官方正路（见 SPIKE.md）、测试数据在手、命名可落。唯一红线：D7 不动摇；若 D5 卡/scrub 未达标按保险丝砍 scrub 先发。
