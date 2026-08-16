# AGENTS.md — dsh-turnbar

**DeepSeek Harness (dsh) 插件**：会话内轮次导航——全景进度条 + 悬停预览卡 + 拖动 scrub + playhead + Esc 返回 + ⌘K 搜索 + ⌘↑/⌘↓。双半区（dual-half）插件：node 半区跑在 dsh 主进程，browser 半区跑在 Web UI。已发布 npm（dsh-turnbar）、GitHub（rex178178/dsh-turnbar，SSH）。

**改任何敏感区域前先读**：`PLAN.md`（定位与决策记录）、`SPIKE.md`（dsh API 实证与踩坑，含行号）、`FINDINGS.md`（竞品情报与发布清单）。

## 常用命令

```sh
pnpm test          # vitest（40 个测试；必须全绿）
pnpm build         # tsdown：lib/index.mjs（node）+ lib/client.js（web，__ModuleLoader__ 包装）
./node_modules/.bin/tsc --noEmit   # 类型检查（vitest 不查类型！）
node scripts/make-fixture.mjs      # 从真实会话重新生成脱敏夹具
```

## 架构边界（改代码前必读）

- `src/core/` — 纯逻辑，**零 dsh import**：`fold.ts`（事件流→轮次记录的折叠机，唯一的数据真相源）、`turn-store.ts`（sidecar JSONL 持久化）、`first-line.ts`（首句/搜索文本提取）。
- `src/index.ts` — node 半区：订阅 `ctx.on('session/event')` firehose + webServer 注册 `/plugins/dsh-turnbar/state` 与 `/search` 路由（三级供给：live store → sidecar → `sessionPersistence.inspect` 回填）。
- `src/client/` — browser 半区：`index.ts`（TurnBar 组件，经官方 `conversation.composer.dock` 插槽注入）+ 单例 DOM 模块 `card.ts`/`toast.ts`/`search.ts` + 纯函数 `grouping.ts`。
- 平台边界：`src/client/platform.d.ts` 把 react 声明为 any；`React.PointerEvent` 类型不可用，用本地 `PointerEventLike`；React 由平台冻结表提供（不 import react-dom，无 portal）。

## 硬规则（每条都曾在真机测试中炸过）

1. **组件 hooks 必须全部在条件 return 之前**——放后面，数据 0→N 到达时 React 静默杀组件（无日志）。
2. **副作用判定写在动作之后**（如 toast 的位移判定必须在 scrollTop 写入后）。
3. **每版必须真机验证**：单测拦不住 DOM 交互时序 bug。测试实例：`DSH=/Users/rexli/.npm/_npx/1e7f6d9597241db0/node_modules/.bin/dsh; $DSH --profile turnbar-test --port 8791`（插件以 link 安装，rebuild 后重启实例生效）；22 轮测试会话 = "修复股市信号看板"（session-e40715b8）。
4. **降级不崩溃**：node half 全部异常吞没；能力探测失败只降级（L2：inspect 抛错 → 404）。

## dsh 内部契约（已实证，勿凭旧知识）

- 轮次边界是事件流一等公民：`turn/start|end`；`assistant/message` 带 usage；`request/context` 带 contextWindow。
- **`user/message` 必须过滤 `data.source.kind`**：只有 `'user'`（或缺失）是真实用户消息；`plugin`/`skill-catalog`/`agent-instructions`/`goal` 是系统回显（会污染卡片内容）。
- composer.dock 插槽 props：`useSession`/`sessionId`/`session`（`loadOlder` 在 props.session 上）；store 节点轮号在顶层 `node.turn`。
- **纯工具轮不渲染 `[data-turn-tail]`**——行定位用"上一个/下一个存在轮尾"区间法；区间无下界且"Load earlier"在 → 返回 null 继续翻页（否则长会话点第一段落错轮）。翻页上限 400 页。
- 跳转配方：分页（`session.loadOlder()` 优先，DOM "Load earlier" 按钮兜底）→ wheel 事件 + scrollTop 一步写入（0811 起程序化写入即读者输入，无 follow 拉回）。

## 已知环境怪癖

- curl 访问 github.com/raw.githubusercontent 在本机常 404/超时（网络缓存假象）——验证一律用 `gh api`；WebFetch 走独立网络可作对照。
- GitHub 对新建仓库有网页/raw 层传播延迟（API 正常但 raw/camo/jsdelivr 404，数小时到一天自动恢复）。
- 账号 rex178178 曾遇 fork 403（风控，网页/API 都拦，停止重试等自动解除）。
- npm publish 需用户终端跑（浏览器授权 + 2FA），agent 侧会被认证门拦截。
- 发布后需用 `dsh plugin --profile <新profile> add dsh-turnbar`（真实 npm 包）做安装验收，而不是本地 link。
