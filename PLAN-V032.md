# PLAN-V032.md · 适配 dsh 0.1.5 持久化新接口（历史回填链修复）

**状态：✅ 0.3.2 全部完成（2026-09-13）。主修复（F1-F5 句柄链）+ §10 B 路线（跳转锚定 DOM 分组）均已实施并真机验收全绿：G0 117 测试/tsc/build 全绿；G2 8/8（A/F11 转绿）；G3 10/10；G4 PASS；G5 镜像（重打包 tarball 重装）v023 8/8 · v03 10/10 · 冲突 9/9。待办仅剩用户终端 npm publish。实施追加真机实证见 docs/acceptance-runbook.md 当日记录（轮尾属性在内层/壳行不带轮号/分组闸门）。**
**v2 修订**：① G1/G2 增设 sidecar 清理前置——审查实测替身会话修复前就靠 sidecar 返回 200，不清必"假绿"；② F5 复验升级为"官方应用打开无错 + state 200"双门，且剔坏事件后必须重编号；③ F3 补 2 个用例（失败路径必还证、空事件落链）；④ F1 增探活 0 轮诊断日志。
**实施追加发现**：0.1.5 web 服务新增 `?token=` 鉴权（验收脚本已加 TB_TOKEN）；复现会话病灶实为"日志尾重复删除 splice"（修复工具已扩 dup-splice 检测/剔除/重编号，双复验双门过）。
**背景（2026-09-13）**：dsh CLI 从 0.1.1-rc.2 升级到 0.1.5-rc.1（npm latest）后真机验证发现：插件的"历史会话回填"链路整体失效——重启后打开任何历史会话，进度条不渲染（state 路由 404）。

---

## 0 · 一句话人话

官方把"读会话历史档案"的接口**换了一代**：以前是"报编号，档案室直接把整份档案递给你"（`inspect` / `readRaw` 两个函数，说没就没）；现在改成"先登记借阅证 → 凭证翻阅 → 看完归还"（`open` 句柄制）。我们插件还在喊旧暗号，档案室听不懂，按"查无此档"处理 → 前端拿到 0 轮次 → 按设计规则（≥1 轮才显示）不渲染进度条。**修法 = 在回填链最前面加一条"借阅证"新通道，老通道原样保留给旧版 dsh 用户。**
**（v2 补充）验收有个坑：插件自己记的"小抄"（sidecar 缓存文件）会抢答——审查实测替身会话此刻没修就已经返回 200，全靠小抄；所以验收前必须先删小抄再验，绿灯才算数（见 G1）。**

## 1 · 验证记录（已实证的事实，本方案的地基）

| # | 事实 | 证据 |
|---|---|---|
| 1 | 插件 host 半区在新版正常加载、webServer 路由活着 | state 路由返回结构化 404 JSON（非 5xx/无响应） |
| 2 | client bundle 被新版正常发现与下发 | 合并加载器 URL 含 `dsh-turnbar/client.js&rev=…`（探针 probe-v015-net.mjs） |
| 3 | 回填链四层全空 → 404 | `curl state?sessionId=31ed62b0…` → `{"error":"session not recorded"}`；日志无任何插件报错（能力探测静默降级，符合"降级不崩溃"设计） |
| 4 | 旧 API 已删、新 API 为句柄制 | 官方包 `dsh-session-persistence@0.1.5-rc.2` 类型声明：`open(id,'read')→SessionHandle`；`handle.read(offset=0,length?)→{eventState,events}`；`handle.close():Promise<void>`；服务层另有 `stat(id)` / `list()`。公开服务契约（`SessionPersistence` 抽象类）已无 `inspect`/`readRaw`——jsonl 后端内部残留一个私有 `inspect()` 闭包参数，与插件无关（2026-09-13 审查复核） |
| 5 | 新后端 fail-closed 且自愈能力更强 | 契约原文：torn tail 永不返回给读者、写入前自动截断；坏日志抛 `SessionFormatUnsupportedError` / `SessionPersistenceCorruptionError`，**绝不误读**。→ 插件的 readRaw 兜底在新版没有存在意义（也不会存在） |
| 6 | 前端渲染逻辑无恙 | `shouldShowTurnbar`: ≥1 轮显示；0 轮隐藏是正确行为（探针 probe-v015-compat.mjs：0 segs + state 404 同框） |
| 7 | 旧格式会话总体能被 0.1.5 打开 | session-33dd6b21（2 万事件老会话）直达配方打开成功：5 个轮尾、真实内容（探针 probe-v015-recipe.mjs 同款） |
| 8 | **复现会话 31ed62b0 本身带旧伤，新版拒绝投影** | 页面报"历史加载失败：invalid persisted inbox splice at session seq 2161"；修复工具 `--scan` 判它 seq 连续（✅）——新版规则不同：重放 `agent/inbox/spliced` 时若消息 id 已在收件箱 pending 即拒绝（`dsh-agent-loop` 源码实证）。属 dsh 已知"spliced 重复打号"缺陷族的残留，**与本次接口变更无关的独立问题** |
| 9 | 直达会话配方（`localStorage['dsh.sessions.current']` + 刷新）在新版仍有效 | 探针实测：写入后应用认可该会话（未被改写）；应用自己也会写这个 key |
| 10 | `read(0)` 一次调用即全量，无需翻页循环 | 官方类型声明注释原文："length 缺省 = 读到日志末尾"（2026-09-13 审查复核——方案最大的技术未知数坐实） |
| 11 | **替身会话 33dd6b21 已有 sidecar 缓存——修复前 state 就已 200（验收假绿源）** | 审查实测：带前缀 curl 当场返回 200，数据来自 `~/.dsh/plugins/dsh-turnbar/sessions/` 下该会话的 sidecar JSONL 而非持久化层；G1/G2 用它验收必须先清缓存 |
| 12 | npm 版本占用：已发 0.2.0–0.3.0；0.3.1、0.3.2 均空 | `npm view dsh-turnbar versions`（2026-09-13）；0.3.1 仅存在于本地生产 tarball |
| 13 | 404 在 8791 实时复现中 | 审查时点 curl 完整 ID → `{"error":"session not recorded"}`（注意：sessionId 必须带完整 `session-` 前缀，不带前缀会误得 404，手工验证易踩） |

**对用户的影响面**：仅"重启/冷启动后打开历史会话"这一条链。进行中的新会话、搜索、悬停卡、scrub 等全部不受影响（它们依赖 live 事件流或已渲染的 DOM）。

## 2 · 新旧 API 对照（速查）

| 旧（≤0.1.1-rc.x） | 新（0.1.5+） | 说明 |
|---|---|---|
| `sessionPersistence.inspect(id)` → `{events}` | `sessionPersistence.open(id,'read')` → 句柄 → `handle.read(0)` → `{events}` | 旧=一步全量；新=借阅证→翻阅（`read` 不传 length = 读到日志末尾，一次全量——契约原文，审查复核） |
| `sessionPersistence.readRaw(id)` → `{content}` 逐行裸读 | （无对应物，也不需要） | 新后端永不返回坏尾、fail-closed，裸读兜底失去意义 |
| 会话不存在：inspect 抛错 | `open` 抛 `SessionPersistenceNotFoundError` | 语义相同，都要吞掉降级 |
| — | `stat(id)` / `list()` | 本次不用（备用知识） |
| — | 句柄用完必须 `close()` | 释放资源；`close` 幂等 |

## 3 · 修复设计

### F1 · 数据回填链改造（核心，`src/index.ts`）

**改动范围：仅 `backfillFromPersistence()` 一个函数 + `MinimalCtx` 类型声明。fold / turn-store / merge / sidecar / UI 全部零改动。**

新链序（伪码，落实后约 30-40 行）：

```
backfillFromPersistence(sessionId):
  if seeded → null                        # 防重问语义不变：成功才记 seeded
  ① 新链（0.1.5+）：若 typeof sessionPersistence.open === 'function'
       handle = await open(sessionId, 'read')          # 抛错（NotFound 等）→ 落 ②
       try:
         slice = await handle.read(0)                  # 全量事件（契约：length 缺省=读到日志末尾，一次拿完无需翻页——审查复核）
         events = slice?.events
         若 Array 且非空：
           probe = 纯折叠探活（同现行 inspect 探活逻辑）
           若 probe.turns > 0 → backfillFrom(events)   # 成功
           否则 → console.warn('[dsh-turnbar] persistence probe folded 0 turns:', sessionId) → 落 ②
         （空数组/非数组 → 静默落 ②）
       catch → 落 ②                                    # Corruption/Unsupported 等
       finally → await handle.close()（吞异常；成功与失败路径都必须还证——close 失败绝不影响数据结果）
  ② 旧链（≤0.1.1-rc.x 原样保留，一字不动）：
       inspect → 探活 → backfillFrom
       → readRaw 裸读逐行解析 → backfillFrom
  ③ 全部落空 → null → 404（降级不崩溃，现状语义）
```

设计要点：

- **顺序即兼容**：同一 dsh 上新旧 API 互斥存在（新包已删旧函数），先探 `open` 再走旧链，两个版本的用户都不破。
- **探活逻辑复用**：新链与 inspect 共用"先纯折叠出轮次才算数"的半读防御（现有代码第 86-91 行的模式抽出来共用）。
- **`seeded` 语义不变**：只有成功才记，失败不锁死整进程（v0.3.1 教训保留）。
- **`close()` 必须调用**：句柄是"单主状态"（官方契约），读完就还；`close` 抛错吞掉。
- **错误全吞**：NotFound / Corruption / Unsupported 一律降级为 404，不在新版上找 readRaw 替代（契约上不可能给出，别做无用功）。
- **探活 0 轮打一行 warn（v2）**：静默 404 无法区分"接口没接通"与"新版事件格式让折叠机折出 0 轮"，一行日志让真机排查一眼定位。"异常吞没"针对抛错、不禁止日志——现行 ingest / 路由失败本就有 console.error 先例。

### F2 · 类型声明（同文件 `MinimalCtx.sessionPersistence`）

增加 `open?` 可选成员（句柄的 `read`/`close` 同为可选探测），保持"全部能力探测"的风格，不 import 任何官方包类型。

### F3 · 单元测试（`test/host-half.test.ts`，现有 93 个测试的模式上加 ~6 个）

| 用例 | 断言 |
|---|---|
| 新链成功 | fake `open→read→{events}` 回填出轮次；`close` 被调用 |
| `open` 抛 NotFound | 无 crash；同请求有旧 API 时落旧链回填成功 |
| `read` 抛 Corruption | 无 crash → 404；且**不记 seeded**（下次请求重试）；**close 仍被调用**（失败路径也必须还证，防句柄累积，v2） |
| `read` 返回折叠为 0 轮 | 弃用半读 → 404（对齐现行 inspect 半读用例） |
| `close` 抛错 | 回填结果照常返回 |
| `read` 返回空数组 / 结构不符 | 无 crash，静默落旧链 → 404（v2） |
| 旧 API 单独存在（旧版 dsh 用户） | 行为与现状完全一致（既有用例继续全绿即证明） |

### F4 · 验收脚本适配（`.usertest/`）

- `cdp-v023-verify.mjs` / `cdp-v03-verify.mjs`：开会话方式改为**直达配方为主**（脚本本就先写 `localStorage['dsh.sessions.current']`，把后面"侧栏搜索会话"的硬失败段降级为"可选兜底"——搜到就点，搜不到且已确认目标会话在开（校验 current key + 会话流 DOM）就继续）。断言与输出格式不变。
- 新增探针脚本已留存：`probe-v015-compat.mjs`（整体健康）、`probe-v015-net.mjs`（bundle 下发）、`probe-v015-recipe.mjs`（直达配方 + 错误捕获）。

### F5 · 复现会话 31ed62b0 的旧伤处理（**决策点，见 §6**）

- 病灶：seq 2161 处 `agent/inbox/spliced` 重放时消息 id 重复（新版 `dsh-agent-loop` 投影规则）。
- 治法：扩展 `~/dsh-session-repair.mjs` 增加 dup-splice 检测与修复（定位被拒的 spliced 事件 → 去重/剔除该条 → **重编号恢复 seq 连续** → 自动备份 → 双复验）。属"用户数据手术"，沿用既有"自动备份 + 修后复验"惯例。
- **v2 硬要求（审查升级）**：① 新版校验比旧版严——事件 seq 必须严格连续才肯读，剔除/去重后不重编号会把会话从"带伤可修"治成"整份拒读"，比修前更糟；② 复验必须双门：**官方应用打开该会话不再报"历史加载失败"**（原报错出自官方投影——state 200 只证明插件读得动，不代表官方侧修好）+ state 路由 200。
- **验收不强依赖它**：修复验收先用替身会话（见 §4），治好后补跑 canonical 全套。

## 4 · 验收计划（Gate 列表，按序执行）

| Gate | 内容 | 通过标准 |
|---|---|---|
| G0 | 静态 | vitest 全绿（93+新增）、`tsc --noEmit` 0 错、`pnpm build` 成功 |
| G1 | 数据面健康 | **前置（v2，堵假绿）**：删替身会话 sidecar 缓存 `~/.dsh/plugins/dsh-turnbar/sessions/session-33dd6b21-*.jsonl`（可再生缓存，删除无害——审查实测：不清的话修复前它就已 200，全靠 sidecar 抢答），且不在 UI 里先打开该会话（避免 live 流灌入抢答）；随后 curl state（sessionId 带完整 `session-` 前缀）返回 200 且 turns>0 |
| G2 | 回归 8 项（v023 脚本） | RESULT: PASS（fixture 见 §6 决策；若改用替身会话，同样先清其 sidecar，理由同 G1） |
| G3 | v0.3 专项 10 项（v03 脚本） | RESULT: PASS |
| G4 | **重启断链 gate（v0.3.1 教训，必做）** | 浏览器连着时 kill 8791 host → 重启 → 刷新 → 进度条全段、悬停有真实内容、首轮 index=1 |
| G5 | 生产镜像验收 | pack tarball → 干净 profile → turnbar-mirror 全家桶跑 G2-G4（发布 gate，按 acceptance-runbook） |
| G6 | 旧版兼容抽查 | 用 mock 旧 API 的单测证明旧链未破（有条件的话在 0.1.1-rc.2 上手测一轮） |

## 5 · 版本与发布

- **版本号：建议 0.3.2**。理由：本地生产在用 `0.3.1.tgz`，避免"同版本号不同内容"；npm 从 0.3.0 直接跳 0.3.2 完全合法。2026-09-13 审查 `npm view` 实测：npm 已发 0.2.0–0.3.0，0.3.1、0.3.2 均空。
- CHANGELOG 增补；README 兼容段更新为"实测 dsh 0.1.5-rc.1，兼容 0.1.1-rc.x（双接口自动探测）"。
- npm publish 仍由用户终端执行（账号 rexli178、2FA）；发布后生产升级命令不变（`dsh plugin --profile web add dsh-turnbar@0.3.2` 或继续 tarball）。

## 6 · 需要用户拍板的三个点

1. **版本号 0.3.2**（推荐）还是把修复并进尚未发布的 0.3.1？（审查意见：0.3.2——并入 0.3.1 发布会与生产本地 tarball"同号不同内容"；npm 占用已实测。）
2. **复现会话 31ed62b0**：推荐"治"（扩展修复工具，自动备份，治好补跑 canonical 全套）；若不想动数据，验收就用替身会话（断言按替身轮次表重排，#3 goal 轮/#11 等针对性用例降级为通用断言）。（审查意见：同意治，但按 F5 v2 的重编号 + 双复验硬要求执行。）
3. 8791 测试实例目前开着（0.1.5-rc.1），修好后直接在其上复验即可，无需重开。（审查实测确认在跑、404 复现中。）

## 7 · 风险与边界

| 风险 | 应对 |
|---|---|
| 个别老会话数据带伤（如 31ed62b0），新版 open/read 抛错 → 插件 404 | 契约即如此（fail-closed 防误读）；插件侧无解，用户层用修复工具治数据；AGENTS.md 已有此惯例 |
| 大日志 `read(0)` 全量内存 | 与旧 inspect 同量级；探活防半读；新契约下 torn tail 已被服务端挡住，风险净降 |
| 未来 dsh 再改接口 | 能力探测 + 双链结构让"再加一条新链"成本极低（本次的教训已消化进设计） |
| 新版 Web UI 再改版导致侧栏脚本失效 | 直达配方为主 + 侧栏降级为可选（本次已这样改） |
| 新版事件格式漂移 → 探活折 0 轮 → 静默 404，难与"接口没接通"区分 | 新链 0 轮探活 console.warn 一行诊断（F1，v2） |
| 修复工具动日志在新版严格校验下风险高于旧版 | 剔坏后必须重编号恢复 seq 连续 + 双复验（F5，v2） |

## 8 · 非目标（明确不做）

- 不动 `src/core/`（fold/turn-store/merge/first-line）、client 半区、CSS、搜索。
- 不为 readRaw 在新版找替代；不做 dsh 版本号检测与缓存；不引入官方包类型依赖。

## 9 · 工作量

代码 ~40 行 + 测试 ~100 行 + 脚本小改 + 全套验收半天内完成（F5 修复工具扩展另计 ~1 小时）。

---

# §10 · B 路线增补：跳转锚定适配 0.1.5（用户已拍板并入 0.3.2 发布）

**状态：待用户审查。确认后开工。**

## 10.0 · 一句话人话

新版 dsh 的网页把"每轮行清单"的官方索引接口删了，我们插件点进度条跳转时只能靠旧启发式猜位置——**轮次都能跳对，但落点有时停在这一轮的工具命令行，不在你的提问行**（8 项回归挂 2、冲突套件挂 1，全部同此根因）。取证发现新版页面的行标签（DOM key）里其实还藏着轮号，只是藏在几种不同记号里——**我们可以自己把每轮的行清单重新拼出来**，不依赖任何官方接口，新旧版 dsh 通用。

## 10.1 · 真机取证（2026-09-13，8791 实例，探针已留存 `/tmp/key-spike.mjs` 思路可复跑）

0.1.5 渲染顺序（每轮）：`[user 行] → [turn-process N] → [assistant-step N:x / tool-call …] → [turn-tail N]`。

| 行种类 | key 实样 | key 前缀 = 轮号？ |
|---|---|---|
| turn-process | `12:turn-process14` | ✅（三处样本全对齐） |
| assistant-step | `14:assistant-step13:1` | ✅（`N:x` = 轮N步x） |
| turn-tail | `9:turn-tail12` | ❌（但 `data-turn-tail` 属性即轮号） |
| **user** | `13:input-message<消息id>` | ❌ **不可靠**（前缀 13 出现在轮 13/14/15 三处） |
| tool-call | `9:tool-call call_00_…` | ❌（槽位号） |

其余实锤：`data-chat-flow-key`/`-kind` 照常渲染（96 项/user×6）；`data-time-hover-root` 已消失（0 个——`userRowOfTurn` 的用户行检测因此在 0.1.5 全灭，跳转全部落到"区间第一行"兜底）；`chat.locations.getTurn` 已从包里删除（grep 0 命中）。

## 10.2 · 修复设计（仅 client 半区两个文件 + 测试）

**核心 = 新增"DOM 分组"定位法，插进现有定位链的第二顺位，不动折叠机/store/host：**

```
locateRow（现行）: 权威索引 ?? 区间法
locateRow（改后）: 权威索引 ?? DOM分组法 ?? 区间法
                   （rc.7 索引在 → 走原路；0.1.5 索引无 → 新法接管；新法失手 → 旧行为兜底）
```

- **DOM 分组法**（`locate.ts` 加纯函数 + `index.ts` 加 DOM 适配，~70 行）：
  1. 一次扫描全部 `[data-chat-flow-key]`，给每行算"所属轮号"
     （**v3 审查修正**：轮号藏在**类型段的尾随数字**里，行首 `NN:` 是槽位号**不是轮号**——
     `12:turn-process14` 的轮号是 14 不是 12；index.ts:654 有真机烧出来的"前缀不可用"注释，
     §10.1 里 user 行前缀 13 横跨轮 13/14/15 同证。解析只取类型段尾数字，绝不取行首槽位号）：
     - turn-process / assistant-step → 类型段尾随数字（`12:turn-process14`→14、`14:assistant-step13:1`→13）；
     - turn-tail → 读 `data-turn-tail` 属性（key 里 `turn-tail12` 的 12 未经证实是轮号，不采信；
       属性缺失的壳行按"其余"向前归属）；
     - **user / context 行 → 归属它后面最近一条可解析行**的轮号（渲染顺序保证 user 行与
       goal 轮的 context 回显都恒在该轮 turn-process 之前——**v3 审查修正**：context 必须与
       user 同规则向后归属，否则 goal 回显行会被"向前归属"错扫进上一轮的组）；
     - 其余（tool-call 等）→ 归属它前面最近一条可解析行的轮号。
  2. 得 `Map<轮号, FlowEntry[]>` 后**复用现行 `pickTurnAnchor` 纯函数**选锚（首个 user 行优先、goal/纯工具轮锚该轮第一行——v0.2.3 的全部选锚智慧零改动继承）。
  3. 解析失败/轮未渲染 → 返回 null 落回区间法（现有翻页逻辑原样）。
- **盲区直接消解**：分组不依赖轮尾存在（aborted 无 closing 的轮 10 不再让 #11 溢进上一轮）；user 行检测不再依赖已死的 `data-time-hover-root`（#18/A 的根因）。
- **版本兼容**：rc.7 的 key 同为 `数字:类型` 格式，同一解析器天然兼容；解析不出 → 回落区间法 = 现状行为，旧版零风险。
- **顺带加固**：`userRowOfTurn`/`nthUserRow` 的 hover-root 检测补一个 kind="user" flowItem 的回退（搜索/⌘↑ 等共用路径同受益）。

## 10.3 · 测试与验收

- `test/locate.test.ts` 加分组解析用例（模拟 0.1.5 的 key/kind 序列：正常轮/user 前缀漂移/aborted 缺轮尾/goal 轮/解析失败回落，~5 个）。
- Gate 重跑（脚本全部就绪，带 TB_TOKEN）：G0 全绿 + **G2 的 A/F11 两项转绿**（8/8）+ G3 10/10 + G4 + 镜像冲突套件 #11 项转绿（9/9）。
- 硬规则：真机验证（8791 实例 + 复现会话），杜绝 DOM 时序回归。

## 10.4 · 工作量与版本

代码 ~70 行 + 测试 ~60 行；验收重跑半天内。**仍以 0.3.2 一个版本发布**（CHANGELOG 增补一段）；发布命令与生产升级步骤不变。
