# AGENTS.md — dsh-turnbar

**DeepSeek Harness (dsh) 插件**：会话内轮次导航——全景进度条 + 悬停预览卡 + 拖动 scrub + playhead + Esc 返回 + ⌘K 搜索 + ⌘↑/⌘↓。双半区（dual-half）插件：node 半区跑在 dsh 主进程，browser 半区跑在 Web UI。已发布 npm（dsh-turnbar）、GitHub（rex178178/dsh-turnbar，SSH）。

**改任何敏感区域前先读**：`PLAN.md`（定位与决策记录）、`SPIKE.md`（dsh API 实证与踩坑，含行号）、`FINDINGS.md`（竞品情报与发布清单）。

## 常用命令

```sh
pnpm test          # vitest（66 个测试；必须全绿）
pnpm build         # tsdown：lib/index.mjs（node）+ lib/client.js（web，__ModuleLoader__ 包装）
./node_modules/.bin/tsc --noEmit   # 类型检查（vitest 不查类型！）
node scripts/make-fixture.mjs      # 从真实会话重新生成脱敏夹具
node ~/dsh-session-repair.mjs --scan   # 会话日志损坏扫描（修复工具，见"环境怪癖"）
```

## 架构边界（改代码前必读）

- `src/core/` — 纯逻辑，**零 dsh import**：`fold.ts`（事件流→轮次记录的折叠机，唯一的数据真相源）、`turn-store.ts`（sidecar JSONL 持久化）、`first-line.ts`（首句/搜索文本提取，含 goal Objective 提取）。
- `src/index.ts` — node 半区：订阅 `ctx.on('session/event')` firehose + webServer 注册 `/plugins/dsh-turnbar/state` 与 `/search` 路由（四级供给：live store → sidecar → `sessionPersistence.inspect` → **`readRaw` 裸读兜底**——rc.7 的 inspect 对 seq 不连续的日志抛校验错，readRaw 逐行解析跳过坏行，v0.2.4 起）。
- `src/client/` — browser 半区：`index.ts`（TurnBar 组件，经官方 `conversation.composer.dock` 插槽注入）+ 单例 DOM 模块 `card.ts`/`toast.ts`/`search.ts` + 纯函数 `grouping.ts`/`locate.ts`（**权威轮次索引 `s.chat.locations.getTurn(N)` → `pickTurnAnchor`**：精确锚定该轮首个 user 行或首行，取代区间启发式的盲区，见下）。
- 平台边界：`src/client/platform.d.ts` 把 react 声明为 any；`React.PointerEvent` 类型不可用，用本地 `PointerEventLike`；React 由平台冻结表提供（不 import react-dom，无 portal）。

## 硬规则（每条都曾在真机测试中炸过）

1. **组件 hooks 必须全部在条件 return 之前**——放后面，数据 0→N 到达时 React 静默杀组件（无日志）。
2. **副作用判定写在动作之后**（如 toast 的位移判定必须在 scrollTop 写入后）。
3. **每版必须真机验证**：单测拦不住 DOM 交互时序 bug。测试实例：`dsh --profile turnbar-test --port 8791`（**dsh 已全局安装**，`which dsh` = ~/.npm-global/bin/dsh；插件以 link 安装，rebuild 后重启实例生效）。复现会话 = 本项目「继续」**session-31ed62b0-7d87-435f-95c9-6f9b6e9896a9**（18 轮全 aborted：轮 1 是 goal 轮无用户气泡、轮 10 无轮尾、轮 2/4 同文"继续"——跳转逻辑的 canonical 复现）；全套验收脚本 `.usertest/cdp-v023-verify.mjs`（8 项：首/末/中段/#3/#11/卡片/scrub），跑前确认 8791 实例在跑。
4. **降级不崩溃**：node half 全部异常吞没；能力探测失败只降级（L2：inspect 抛错 → 404；v0.2.4 起 inspect 失败会走 readRaw 兜底）。

## dsh 内部契约（已实证，勿凭旧知识）

- 轮次边界是事件流一等公民：`turn/start|end`；`assistant/message` 带 usage；`request/context` 带 contextWindow。
- **`user/message` 必须过滤 `data.source.kind`**：只有 `'user'`（或缺失）是真实用户消息；`plugin`/`skill-catalog`/`agent-instructions` 是系统回显。**例外：`goal` 回显**——`/goal X` 输入被包装成 `<goal_round> Objective: "…"`（source.kind='goal'），DOM 渲染为上下文行（无用户气泡）；fold 提取 Objective 归为用户首句（提取失败仍过滤，v0.2.3 起）。
- composer.dock 插槽 props：`useSession`/`sessionId`/`session`（`loadOlder` 在 props.session 上）；store 节点轮号在顶层 `node.turn`。
- **纯工具轮不渲染 `[data-turn-tail]`**——行定位用"上一个/下一个存在轮尾"区间法；区间无下界且"Load earlier"在 → 返回 null 继续翻页（否则长会话点第一段落错轮）。翻页上限 400 页。
- **跳转优先走权威索引（v0.2.3+）**：`s.chat.locations.getTurn(N)` 给出轮 N 的有序节点 key，与 flowItem 的 `data-chat-flow-key`/`data-chat-flow-kind` 对位（`rowFromTurnIndex` + `locate.ts:pickTurnAnchor`）；索引未命中才回落区间法。区间法两个已知盲区：① 前一轮 aborted 无 closing 只渲染无属性的 tail 壳 → 区间溢进上一轮（点 #11 曾落 turn 10）；② goal 轮无用户行（点 #3 曾落 tool 行）。
- 跳转配方：分页（`session.loadOlder()` 优先，DOM "Load earlier" 按钮兜底）→ wheel 事件 + scrollTop 一步写入（顶部留白 16px，flash 用 inset 内描边防裁切；0811 起程序化写入即读者输入，无 follow 拉回）。

## 已知环境怪癖

- curl 访问 github.com/raw.githubusercontent 在本机常 404/超时（网络缓存假象）——验证一律用 `gh api`；WebFetch 走独立网络可作对照。
- GitHub 对新建仓库有网页/raw 层传播延迟（API 正常但 raw/camo/jsdelivr 404，数小时到一天自动恢复）。
- 账号 rex178178 曾遇 fork 403（风控，网页/API 都拦，停止重试等自动解除）。
- npm publish 需用户终端跑（浏览器授权 + 2FA），agent 侧会被认证门拦截；**publish 报 E404 的假象**：`~/.npmrc` 里的 token 过期（`npm whoami` 返回 401）时，npmjs 对无效凭证 PUT 已存在包名统一回 404。诊断只用 `npm whoami`/`npm view`；**禁止读取、打印或外传 token 值本身**（检查配置时一律打码），修复 = 让用户终端 `npm login`（账号必须 rexli178）。
- 发布后需用 `dsh plugin --profile <新profile> add dsh-turnbar`（真实 npm 包）做安装验收，而不是本地 link。注意 `dsh plugin add` 生成的 profile bundles 缺 `@deepseek-ai/dsh-web-app` 会起不来（waiting for service: webServer），需手动补上。
- **会话日志损坏**（用户主诉"更新插件重启后历史对话打不开"）：rc.7 `sessionPersistence.inspect` 要求 seq 严格连续，`agent/inbox/spliced` 重复打号（dsh 系统性缺陷）或缺事件都会让整会话校验失败、误报 "torn JSONL record"。**修复工具**：`~/dsh-session-repair.mjs`（独立脚本）——`--scan` 定位、`--fix --id <sid>|--all` 重编号修复（自动备份），修后用 state 路由 200 复验。
- 版本节奏：npm 已有 0.2.3（latest），仓库在 0.2.4——**再次发布必须 ≥0.2.4**（npm 禁止重发已存在版本）。
