# COMPAT-PLAN.md · dsh-turnbar 多插件共存兼容性改造（v0.2.2）

**状态：已实施并验收 · 2026-08-16（实施 commit 1932788 / 1aad9d7）· 本文件是兼容性改造的完整规格与决策记录。**

## 0. 执行者须知（fresh agent 必读）

- 仓库根目录：`/Users/rexli/DSH-pulgin`（dsh-turnbar 插件仓库）。
- 硬规则见 `AGENTS.md`：改敏感区域前读 PLAN.md / SPIKE.md；`pnpm test` 必须全绿；`./node_modules/.bin/tsc --noEmit` 必须通过；每版必须真机验证。
- 不要重启/干扰用户正在运行的 3080 端口 GUI。真机验证用独立测试实例（端口 8791）。
- 完成信号：所有验收标准（§5）逐条验证并留证据后，输出 `<promise>DONE</promise>`。

## 1. 背景与两个问题

1. **布局挤压（真 bug）**：安装 dsh-web-ui-all（聚合包，内含 dsh-live-stats、dsh-aionui-panel 等）后，TurnBar 被挤到 ~82px 宽（实测），几乎不可用。
2. **部分对话不显示**：已澄清——**不是 bug**。单轮（<2 turns）会话被组件有意隐藏（`src/client/index.ts` 中 `if (turns.length < 2) return null`）。用户认可现状，但决定：单轮会话也显示进度条（1 段），消除"插件不见了"的困惑；0 轮新会话仍隐藏。

## 2. 根因分析（已实证，勿凭旧知识重猜）

### 2.1 挤压根因

官方 `conversation.composer.dock` 是 **list 槽**，渲染器把全部条目包在
`div[data-slot="conversation.composer.dock"]`（内联 `style="display: contents"`）里，
该包装层是 InputBar `.root`（flex column、align-items:center、无 gap）的直接子元素。
官方 StatsLine 注册 order=0，dsh-turnbar order=1，dsh-live-stats 的 TPS 条目 order=100。

dsh-live-stats 的 `MERGE_CSS`（安装包 `@linxin666/dsh-live-stats/lib/client.js` 内，
注释为证）用 `div[data-slot="conversation.composer.dock"]:has(> [data-dsh-live-tps])`
把包装层强制改为 `display:flex; flex-direction:row; flex-wrap:nowrap`。于是
[StatsLine, TurnBar, TPS] 三人挤一行；TurnBar `width:100%` 与 StatsLine
`width:100%` 各按 shrink 均分，TurnBar 被压到最小内容宽（22 段×2px+按钮≈82px，实测 82px）。

**额外陷阱（本机重现时发现）**：live-stats 的兄弟选择器
`… > *:not([role="tooltip"]):has(+ [data-dsh-live-tps]) { width:auto; max-width:620px; padding:4px 0 0; flex:0 1 auto }`
按 **DOM 相邻**匹配——真实 DOM 序是 [stats, turnbar, TPS]，所以它误中 **TurnBar**：
即使外部强行 wrap，TurnBar 仍被限宽 620px 且 padding 被剥。任何修复必须同时打赢这条规则。

### 2.2 同类插件的既有做法（我们照抄其模式并升级）

- dsh-live-stats（生态内唯一同槽共存先例）：`:has()` 锚定包装层 + `!important` +
  兄弟选择器，把自己的条目变成紧凑行内单元。**教训**：它只考虑了自己和官方条目，
  没考虑第三个同槽插件——这就是我们必须做通用共存层的原因。
- 其他导航竞品（navbar / chat-timeline / scroll-timeline 等，见 FINDINGS.md）：
  全部走 DOM 注入或侧栏/抽屉，不占 composer.dock——**没有**可抄的"导航条同槽共存"先例。
- 结论：TurnBar 是唯一需要"独占整行"的同槽插件，必须自带一条
  **共存 CSS 层**，用更高特异性 + `!important` 同时压过：包装层 display/flex-wrap
  （live-stats 规则）与兄弟限宽规则（live-stats 误伤规则）。

### 2.3 为什么必须特异性取胜而不是注入顺序

双方都用 `!important` 时，CSS 按「特异性 → 源码顺序」决胜。插件加载顺序不可控，
所以我们的选择器必须在**特异性上**绝对占优（比 live-stats 的 (0,2,1)/(0,3,1) 高），
具体做法：包装层选择器把 `[data-slot]` 写两遍（(0,3,1)），TurnBar 选择器把
`[data-turnbar]` 写两遍（(0,4,1)）。这是无 JS、无 MutationObserver、无循环重挂风险的
确定性方案。

## 3. 改造内容

### 3.1 共存 CSS 层（src/client/index.ts 的 CSS 常量内追加）

在现有 CSS 之后追加以下规则（已在本机 CDP 重现台验证，见 `.usertest/cdp-measure.mjs`）：

```css
/* ── 共存层：TurnBar 在多插件 dock 中独占整行 ──
   包装层默认 display:contents（官方）；live-stats 等插件会把它改成 flex row。
   我们无条件把包装层定义为「横向、可换行」，TurnBar 以 100% 独占一行，
   其余条目（官方 StatsLine / TPS / 任意第三方）共享第一行（超过 2 个非
   turnbar 条目时各自限宽 620px，避免把官方统计行挤没）。
   特异性：包装层 (0,3,1) > live-stats (0,2,1)；bar 规则 (0,4,1) > live-stats
   兄弟误伤规则 (0,3,1)。全部用 !important 压过内联/插件样式。 */
div[data-slot="conversation.composer.dock"][data-slot="conversation.composer.dock"]:has(> [data-turnbar]) {
  display: flex !important;
  flex-direction: row !important;
  flex-wrap: wrap !important;
  align-items: center;
  justify-content: center;
  width: 100% !important;
  box-sizing: border-box;
}
div[data-slot="conversation.composer.dock"][data-slot="conversation.composer.dock"] > [data-turnbar][data-turnbar] {
  flex: 0 0 100% !important;
  order: 1000;
  width: 100% !important;
  max-width: none !important;
  min-width: 0 !important;
  margin: 0 !important;
  padding: 3px 8px !important;
  box-sizing: border-box;
}
div[data-slot="conversation.composer.dock"][data-slot="conversation.composer.dock"]:has(> [data-turnbar]):has(> *:not([role="tooltip"]):nth-child(3)) > *:not([data-turnbar]):not([role="tooltip"]) {
  flex: 0 1 auto;
  max-width: 620px;
  min-width: 0;
}
```

要点：
- 第三条第 3 条规则只在「turnbar + ≥2 个其他条目」时触发（`:has(> *:not([role="tooltip"]):nth-child(3))`），
  单装 turnbar 时官方 StatsLine 外观**完全不变**（重现台场景 C 已验证）。
- `order: 1000` 使 TurnBar 视觉上永远排在最后一行（任意第三方条目之后）。

### 3.2 单轮会话也显示进度条（src/client/index.ts）

- 把 `if (turns.length < 2) return null` 改为阈值判断：`turns.length < 1` 才返回 null。
- 阈值判定抽成纯函数放进 `src/client/grouping.ts`（可单测）：

```ts
/** 进度条可见阈值：≥1 轮显示（单轮会话也显示 1 段，0 轮新会话隐藏）。 */
export const MIN_VISIBLE_TURNS = 1
export function shouldShowTurnbar(turnCount: number): boolean {
  return turnCount >= MIN_VISIBLE_TURNS
}
```

- 硬规则校验：所有 hooks 仍在条件 return 之前（现结构已满足，**不要**在 hooks 区新增任何条件 return）。
- `planSegments` 已支持 n=1（单段）；playhead/scrub/点击对单段自洽（跳转到第 1 轮=当前位置，无副作用）。

### 3.3 版本与文档

- `package.json` version `0.2.1` → `0.2.2`。
- `README.md` / `README.zh-CN.md`：新增「兼容性 / Compatibility」小节（3–5 行）：
  与 dsh-web-ui-all / dsh-live-stats 同槽共存的机制说明 + 单轮会话也显示进度条。
- `PLAN.md` 追加决策记录小节（§兼容性改造 2026-08-16，含根因与验收结论）。
- `FINDINGS.md` 追加一行 D8 记录（web-ui-all 同槽冲突实证 + live-stats 模式借鉴）。

### 3.4 测试

- `test/grouping.test.ts`：新增 `shouldShowTurnbar` / `MIN_VISIBLE_TURNS` 用例
  （0→false，1→true，22→true，边界值）与 `planSegments` n=1 用例（1 段、label `#1`）。
- 现有 40 个测试必须保持全绿。

## 4. 前端展示方案（视觉规格）

### 4.1 展示原则（3 条）

1. **TurnBar 永远独占 composer 卡片底部一整行**：宽度恒等于输入卡宽度，高度恒定 14px
   （8px 段高 + 上下 3px 内边距），不随插件数量变矮变窄。
2. **其他 dock 条目（官方 StatsLine / TPS / 任意第三方）永远排在 TurnBar 上一行**：
   居中、各自 ≤620px，放不下自动换行。
3. **单装 turnbar 时官方界面分毫不动**；插件越多 TurnBar 越稳——被压缩的永远是
   其他条目的行，不是进度条。

### 4.2 三种典型场景的最终画面

**场景 A：只装 dsh-turnbar（官方样式原样，与改造前一致）**

```
┌──────────────────────────────────────────┐
│      22 轮 · 6,432 tokens · 4 文件        │  ← 官方统计行，原样居中
│  ██████████████████████████████▏      ⌕  │  ← TurnBar 整行
└──────────────────────────────────────────┘
```

**场景 B：装了 dsh-web-ui-all（live-stats 共存）——本改造修复的核心场景**

```
改造前（被挤小）：
│  22 轮 · 6,432 tokens ██▏ · 12.3 tok/s   │  ← 三样东西挤一行，TurnBar 只剩 82px

改造后：
│  22 轮 · 6,432 tokens · 12.3 tok/s       │  ← 第一行：统计行 + TPS 并排居中
│  ██████████████████████████████▏      ⌕  │  ← 第二行：TurnBar 独占整行（100%）
```

**场景 C：再装更多同槽插件（任意 N 个第三方）**

```
│  [统计行] [TPS] [插件C] [插件D] …        │  ← 第一行共享，每个 ≤620px，放不下换行
│  ██████████████████████████████▏      ⌕  │  ← TurnBar 永远最后一行、100% 宽
```

### 4.3 进度条内部呈现（改造未变动的部分）

- 结构：左侧轮次段（每段 ≥2px、弹性均分整行）+ 右侧 24px ⌕ 搜索按钮。
- 段状态：普通轮 = 半透明灰；含用户消息的轮 = 深一档；正在生成 = 品牌蓝 + 呼吸脉冲；
  幽灵轮（被终止的空轮）= 更浅灰、不可点。
- 悬停 120ms 弹 320px 固定定位预览卡（锚定段正上方）：用户首句 / 助手首段 /
  工具数 / token 等元信息。
- 拖动 scrub：按住横拖实时跟随，松手跳转 + 目标行高亮。
- playhead：随滚动实时覆盖视口中央所在轮（品牌蓝半透明盖 + 底部实线）。

### 4.4 轮数边界的呈现

| 会话状态 | 展示 |
|---|---|
| ≥2 轮 | 完整进度条（正常模式） |
| 1 轮（v0.2.2 新增） | 1 个满宽段（生成中带脉冲）；⌕ 搜索可用；点段 = 回到本轮 |
| 0 轮（新建会话） | 不渲染，dock 中只有官方统计行 |

### 4.5 设计取舍（为什么长这样）

- 放在**统计行下方**而非上方：TurnBar 注册 order=1、视觉 order=1000，天然是 dock
  最后一项，符合官方「统计行 + 附庸条目」的层级习惯，不抢占官方内容视觉优先级。
- 其他条目限宽 **620px**：沿用 live-stats 给统计行定的合并上限，第三方条目挤不垮
  第一行，也挤不走 TurnBar。
- 纯 CSS（`!important` + 高特异性）实现：**零 JS、零轮询、零 MutationObserver**，
  展示规则由 CSS 一次性敲定，任何插件加载顺序下结果一致。

## 5. 验收标准（逐条可测，全部满足才算 DONE）

### A. 静态质量门
1. `pnpm test` 全绿（含新增用例）。
2. `./node_modules/.bin/tsc --noEmit` 零错误。
3. `pnpm build` 成功，且 `grep -c 'data-slot="conversation.composer.dock"' lib/client.js`
   与 `grep -c 'flex: 0 0 100%' lib/client.js` 均 ≥ 1（共存层进入产物）。

### B. 布局兼容（确定性重现台，`.usertest/cdp-measure.mjs`）
4. 场景 B（live-stats 合并 + 共存层）：`fullWidth === true`（bar 宽 == 包装层宽）。
5. 场景 C（无 live-stats，仅官方 stats + turnbar）：`fullWidth === true` **且** stats
   宽度保持 720（官方样式未被改动）。
6. 场景 D（敌意第三方 260px 条目 + 共存层）：`fullWidth === true`。
7. 场景 A 基线保持可复现挤压（barW ≤ 100）——作为回归参考，不要求通过。

### C. 真机验证（独立测试实例，禁止动 3080 实例）
8. 创建 profile `turnbar-compat`（`~/.dsh/profiles/turnbar-compat/`）：
   bundles = `["@deepseek-ai/dsh-base","@deepseek-ai/dsh-web-app","@linxin666/dsh-web-ui-all","dsh-turnbar"]`，
   dependencies 里 `dsh-turnbar` 用 `link:/Users/rexli/DSH-pulgin`（先 `pnpm build`）。
   启动：`DSH=/Users/rexli/.npm/_npx/1e7f6d9597241db0/node_modules/.bin/dsh $DSH --profile turnbar-compat --port 8791`
   （后台运行，记录 job id）。
9. 打开 ≥2 轮会话（辅助脚本 `.usertest/cdp-open-and-measure.mjs <port> <标题片段>`）：
   `[data-turnbar]` 存在，且 bar 宽 == 其父（`[data-slot="conversation.composer.dock"]`）宽
   （允许 ±1px）；段数 ≥2；无 pageerror/console error（含 `[dsh-turnbar]` 前缀的除外）。
10. 打开 1 轮会话：`[data-turnbar]` 存在且段数 == 1（v0.2.2 新行为）。
11. 打开 0 轮新会话：`[data-turnbar]` 不存在（保持隐藏）。
12. 交互冒烟（同一测试实例，CDP 派发事件）：悬停出卡、点击段跳转、⌘K 开搜索、
    ⌘↑/⌘↓ 逐轮、Esc 返回 toast——任一失败即不通过。

### D. 交付卫生
13. `git status` 只含本次改造相关变更；提交信息说明兼容层与单轮行为（提交由执行者完成）。
14. 不修改 `lib/` 之外的任何已发布产物逻辑；不 touch `~/.dsh/profiles/web`（用户正在用的实例）。

## 6. 参考证据（执行者可在仓库内查阅）

- `.usertest/cdp-measure.mjs` + `.usertest/layout-repro.html`：确定性布局重现台（先跑场景 A 看 82px 挤压，再跑 B/C/D）。
- `.usertest/cdp-session.mjs`、`.usertest/cdp-explore.mjs`：CDP 驱动真实 GUI 的先例脚本。
- `vendor/deepseek-harness/packages/client/ui-conversation/src/client/`：官方 dock/InputBar/StatsLine 源码（行号见 SPIKE.md）。
- `~/.dsh/profiles/web/node_modules/@linxin666/dsh-live-stats/lib/client.js`：MERGE_CSS 原文（680–790 行附近）。
