# dsh-turnbar 完整用户测试报告

**日期**：2026-08-16（下午）
**被测版本**：仓库 `main` @ `0d77ece`（npm 0.2.0 同源代码）
**测试实例**：`dsh --profile turnbar-test --port 8791`（link 安装本仓库；node half 与 lib 产物 md5 一致，client bundle rev 校验一致）
**测试会话**：`session-e40715b8`「修复股市信号看板」（22 轮 / 5.9MB，含 2 个纯工具轮 #4/#6）+ 新建 live 会话「收到」（3 轮真实消息）+ 路由拦截合成会话（160 轮 / 404）
**方法**：Playwright 1.62 + 系统 Chrome 驱动真实 Web UI（指针/键盘全部走真实事件），host 路由用 curl 直测，合成场景用 `page.route` 拦截。脚本与逐项结果在 `.usertest/`（`results.json` 93 项，可重放）。

---

## 一、总结论

插件核心链路（双半区数据桥、折叠机、翻页跳转、悬停卡、scrub、⌘K 搜索、⌘↑↓、playhead、Esc 返回、分组模式、降级、live 轮次）**全部可用**，静态检查（40 单测 + tsc + build）全绿，真机 11 个批次无控制台报错。

但完整用户测试发现了 **4 个 P1 功能级 bug + 7 个 P2 观感/一致性问题**，其中 3 个 P1 是既有测试轮次从未覆盖到的交互组合路径：

| # | 级别 | 问题 | 复现率 |
|---|---|---|---|
| 1 | P1 | 跨分页跳转竞态：搜索跳 #3 落在轮 1，flash 高亮轮 1，toast 却写「已定位 #3」 | 搜索路径 6/6 |
| 2 | P1 | 搜索面板关闭后焦点滞留隐藏输入框 → ⌘↑/⌘↓ 与 toast 的 Esc 返回全部失效 | 100%（确定性） |
| 3 | P1 | Esc 双动作：面板开着 + toast 可见 + 焦点不在输入框 → 一次 Esc 同时关面板并触发返回滚动 | 确定性 |
| 4 | P1 | 悬停卡片锚点 off-by-one：卡片锚在目标段左一格；第 1 段锚到 playhead（实测偏差 +944px） | 100%（确定性） |
| 5 | P2 | 纯工具轮跳转：toast 说「#4」但 flash 高亮 #5 的用户行 | 确定性 |
| 6 | P2 | 主题 token 全部不存在 → 浅色主题下卡片/toast/搜索面板是深色孤岛 | 确定性 |
| 7 | P2 | 组卡片占位文案过期：「精确搜索（即将上线）」——搜索已上线 | 确定性 |
| 8 | P2 | node half `export const version = '0.1.0'` ≠ package.json 0.2.0 | 确定性 |
| 9 | P2 | 段按钮 `title` 原生 tooltip 与自定义悬停卡双提示叠加 | 代码可见 |
| 10 | P2 | 5s 状态轮询无条件 `setMetaTurns(新数组)` → 每 5s 全条重渲染 | 代码可见（实测无抖动） |
| 11 | P2 | `loadEarlierVisible` 只取 flow 内第一个 `<button>` 且正则不含「加载中…」状态（bug 1 的根因之一） | 确定性 |

---

## 二、P1 问题详情（含根因与修复建议）

### 1. 跨分页跳转竞态 —— 跳到 #3 落在轮 1（搜索路径 6/6 复现）

**现象**：全新打开 22 轮会话（初始窗口只加载 #19–22），⌘K 搜「看板」→ ↓ → Enter 选 #3 → 翻页完成后视图停在**轮 1**（scrollTop=56），flash 高亮「你好」（轮 1 用户行），但 toast 显示「已定位 #3」。

**证据**：
- 滚动轨迹（diag2）：翻页正常（scrollH 7169→65567，每页 ~240ms），最后一步 `scrollTop 64743 → 56`——落在流顶而非轮 3 行（flow-y≈6491）。
- flash 归属（diag3）：`afterTail=1`，被高亮行文本 =「你好 8月14日 21:04」。
- 复现率：搜索路径 6/6 错位（diag×2 + batch3 + batch5×4）；点击路径 4/4 正确（batch4 + batch9）——**同一竞态窗口，两路径时序不同**。

**根因链**（diagdom 高频采样证实）：
1. `loadEarlierVisible()` 只读 `flow.querySelector('button')`（flow 内**第一个**按钮）并对文案跑 `/earlier|加载更早|更早/i`——按钮处于「加载中…」状态时正则不匹配 → 返回 false。
2. 翻页循环 `loadOnePage()` 后只等 60ms 就做 `userRowOfTurn()` 区间定位。最后一页体积大，React 局部提交窗口 ~950ms：用户行先渲染、`[data-turn-tail]` 后渲染、且「加载更早」按钮消失（hasMore=false）。
3. 此时 `userRowOfTurn(3)`：`next`=tail-5 存在，`prev`（tail<3）尚未渲染 = undefined，而 `loadEarlierVisible()` 又返回 false（按钮已消失或显示「加载中…」）→ 区间无下界判定失效 → 走查从 tail-5 一路溢到流顶 → 返回最顶用户行（轮 1）→ 循环退出、跳转、flash 全错。

**修复建议**（任选或组合）：
- `loadEarlierVisible` 改为：存在「加载更早/加载中…/更早」任一状态的顶部按钮即视为仍有历史；且应扫描 flow 内**所有** button 而非第一个。
- 翻页循环退出条件收紧：`prev` 边界缺失时视为「未就绪」继续等待/翻页（目标轮 >1 时要求 prev tail 存在；目标轮 =1 时要求无「更早」按钮）；或对 tails 集合做双 rAF 稳定性复检后再信任走查结果。

### 2. 搜索面板关闭后焦点滞留隐藏输入框 —— ⌘↑/⌘↓、Esc 返回全部失效

**现象**：⌘K 搜索 → Esc（或 Enter 跳转）关面板后，`document.activeElement` 仍是**隐藏的搜索 input**。此后：
- `⌘↑/⌘↓` 被 `editable` 判定吞掉（实测 scrollTop 不动、无 toast）；
- 跳转 toast 的「Esc 返回原位」被 `isEditable` 拦截（实测无效）。

**证据**：diag1 逐快照：`after-esc-close → activeEl=INPUT(SEARCH-INPUT)`；`⌘↑` 前后 scrollTop 恒 56；把焦点 blur 到 body 后 toast 文本仍不变（且当时已在原位）。batch3 同款复现。

**代码矛盾**：`src/client/index.ts` L423 注释写着「Esc 关闭后焦点归位」，但 `closeSearchPanel()` 从未恢复焦点。

**修复建议**：`toggleSearch()` 打开时记录 `document.activeElement`；`closeSearchPanel()` 时归还焦点（`previous?.focus?.()`）。另在 `pick()` 路径同样归还。

### 3. Esc 双动作：关面板的同时触发 toast 返回滚动

**现象**：跳转后 toast 可见 → ⌘K 打开搜索面板 → 焦点不在输入框时按 Esc（意图：关面板）→ **面板关闭 + 视图滚回跳转前位置**两个动作同时发生。

**证据**：batch5：`posA=6345 → 跳 #11 posB=49985 → Esc posC=37063`（toast onReturn 的 6345 写入被在途 loadOlder 锚定调整成 37063——无论如何 Esc 产生了返回滚动）。两次 Esc 监听器都是 window capture，`preventDefault` 不阻断对方；搜索面板 onKey 与 toast handleKey 都会响应。

**修复建议**：搜索面板 Esc 分支里 `stopImmediatePropagation()`（面板 z-index 更高，应独占 Esc）；或 toast 的 handleKey 先检查搜索面板可见性，可见时让位。

### 4. 悬停卡片锚点 off-by-one（含 playhead 特例）

**现象**：卡片定位锚 `bar.children[segmentIndex]`，但 `children[0]` 是 playhead div → 所有段的卡片都锚到**目标段左边一格**；第 1 段（index 0）直接锚到 playhead 元素——而 playhead 有 `translateX` 位移，实测卡片被拉到最右侧。

**证据**（diagcard，22 段会话）：
- `seg[0]`：段中心 328，卡片中心 1272，**偏差 +944px**
- `seg[5]`：偏差 -51px；`seg[11]`：-50px；`seg[21]`：-112px（含右缘 clamp）

**修复建议**：`showCardFor` 中改取 `bar.querySelectorAll('[data-turnbar-seg]')[segmentIndex]`（或 `bar.children[segmentIndex + 1]`），锚点即目标段自身。

---

## 三、P2 问题详情

5. **纯工具轮跳转错位**：轮 #4 无用户行，`userRowOfTurn` 恒 null，fallback `nthUserRow(段序)` 落在轮 5 的用户行——toast「已定位 #4」、flash 高亮 #5 的行（B4 实测 `afterTail=5`）。建议：纯工具轮目标直接滚到区间内第一个可见行（如轮尾/工具行），或 toast 文案标注实际锚点。
6. **主题 token 全不存在**：`--dsw-hovercard-bg`、`--dsw-shadow-lv3`、`--dsw-alias-text-1`、`--dsw-alias-text-accent`、`--dsw-alias-label-secondary/tertiary` 在 dsh 主题中实测全为空（真实 token 是 `--dsw-alias-bg-layer-*`/`--dsw-alias-label-primary` 等）→ 卡片/toast/搜索面板永远用暗色 fallback（#2C2C2E/#eee）；浅色主题（本机 `ui-theme: light`）下是深色孤岛。修：换真实 token 名。
7. **组卡片文案过期**：`buildGroupCardModel` 助手行写死「拖动经过或在 ⌘K 中精确搜索（即将上线）」——搜索 v0.2 已上线。
8. **版本号不一致**：`src/index.ts` `export const version = '0.1.0'`，package.json 是 0.2.0（插件清单/设置页显示错版）。
9. **双 tooltip**：段按钮带 `title` 属性（原生 tooltip ~1s 出现）+ 120ms 自定义卡片 → 悬停稍久两者叠加。建议去掉 `title` 或换 `aria-label` only。
10. **5s 轮询全量重渲染**：`setInterval(load, 5000)` 每次 `setMetaTurns(新数组)` → React 整条重渲染（实测 22 段会话无可见抖动，属性能小问题；live 期间脉冲依赖该轮询，属正常频率）。
11. **`loadEarlierVisible` 脆弱**：只查 flow 第一个 button + 正则不含「加载中…」——是 bug 1 的直接成因；另外若 flow 顶部第一个按钮不是翻页按钮（如内容里先出现复制按钮），判定即失效。

---

## 四、验证通过清单（证据）

### 4.1 静态与单测
- `pnpm test` 40/40 绿；`tsc --noEmit` 干净；`pnpm build` 双产物成功（lib/index.mjs 16.2kB / lib/client.js 39.5kB）。

### 4.2 host 数据路由（curl 直测）
- `/state`：22 轮会话回填正确（title/model/首尾轮内容、chapterBreaks=10）；未知会话 404；live 会话 live store 优先（3 轮）。
- `/search`：中文命中 12 条、结果按轮号升序、大小写不敏感（THE/the 各 4 条）、缺 q/空白 q → 400、未知会话 → 404、snippet 含上下文片段。

### 4.3 真机 UI（Playwright 真实事件）
- **渲染**：22 段、label #1–#22、aria「jump to turn #N」、历史会话无 running 脉冲、空会话无条、⌘K 空会话 no-op。
- **悬停卡**：120ms 延迟出卡、内容为真实文本（#12 · 22 小时前 + 用户首句 + 助手首段 + 🔧/📄/~tok/+N 补充）、已可见零延迟切换、移出 100ms 宽限隐藏、视口 clamp 不越界。
- **点击跳转**：点 #1 跨分页 3.1s 完成 + flash + toast「已定位 #1」+ scrollTop 大幅变化；Esc 精确复位（6345→56→6345，diff=0）；toast 点击同样复位；跳 #10 toast 正确。
- **scrub**：按住 >4px 进入、卡片实时跟随（中途显示 #10）、scrub-target 高亮、松手跳 #15、卡片/高亮清理干净。
- **⌘K 搜索**：Meta+K 开面板并聚焦输入框、150ms 防抖、12 结果行（#2 起按轮号）、↑↓ 换行（0→1 实测）、Enter 选中跳转并关面板、无结果文案「没有匹配的轮次」、Esc 关面板。
- **键盘导航**：⌘↑/⌘↓ 正常逐轮（焦点在 composer 时不劫持实测通过）；边界钳制（轮 1 处 ⌘↑ 不越界、轮 22 处 ⌘↓ 不越界）。
- **playhead**：初始 97.7%（最后段），跳 #1 后 2.3%（首段），opacity=1。
- **轮询稳定性**：6.5s 跨两个轮询周期段数不变、无重复渲染。
- **分组模式**（route 拦截 160 轮）：40 段、组 label #1–#4、组卡片「#1–#4 · 4 轮 + 前 3 条用户句」。
- **降级**（route 拦截 state 404）：store 窗口路径渲染 4 段。
- **live 会话**（真实 2+1 条消息）：1 轮无条 → 第 2 轮条出现（2 段）→ 生成期间末段 running 脉冲（304ms 即亮，diagpulse 实测 running=1）→ 轮次增长 2→3 段 → 结束脉冲消失；sidecar 落盘（3 轮、token/工具计数正确）；卡片显示 live 轮内容（「#2 · 刚刚 … 好的 ~84 tok」）。
- **全批次控制台零 error / 零 pageerror**。

### 4.4 测试过程中的脚本勘误（非产品问题，已重测澄清）
- S2「↑↓ 换行」断言先按后读导致误报 → diag1 实测 0→1 正确。
- B8 边界断言用 `/#1\b/`（「1」与「Esc」之间无词边界）→ B10 修正后通过。
- L4 脉冲检查窗口（4s）晚于 flash 模型完成时间 → diagpulse 300ms 采样证实脉冲正常。
- B3 纯工具轮 flash 检查（4s）晚于 2.5s flash 过期 → B4 早期轮询测得 afterTail=5。

---

## 五、回归建议

1. 修 bug 1 后，重跑：搜索跳 #3/#10/首个非首段（各 5 次）+ 点击同款（各 3 次），断言 flash 归属轮 = 目标轮。
2. 修 bug 2/3 后，重跑：搜索 Esc 关闭 → ⌘↑↓ 可用 + toast Esc 可用 + 面板 Esc 不再联动返回。
3. 修 bug 4 后，重跑 diagcard（各段卡片中心 delta ≤ 半个段宽）。
4. 版本号、组卡片文案、token 名替换后，`pnpm build` + 浅色/深色主题各拍一张卡片截图。

---

## 六、修复记录（2026-08-16 晚间，全部修复并真机回归通过）

| # | 修复内容（文件） | 根因 | 验证 |
|---|---|---|---|
| 1 | 行定位重写（`src/client/index.ts` `userRowOfTurn`/`turnAnchorRow`/`loadEarlierButton`/`loadOnePage`/`intervalBounded`） | **真正的根因**：dsh DOM 已把每行包进 flowItem（`[data-chat-flow-key]`），旧代码在轮尾元素上直接 `previousElementSibling` 走查，只在 slot 内空转 → `userRowOfTurn` 恒 null → 全部落入兜底；搜索路径的 `segments.indexOf(segment)` 对新 `planSegments()` 对象返回 -1 → `nthUserRow(0)` 错取第 1 轮。叠加修复：`loadEarlierVisible` 全量扫描按钮并识别「加载中…」、翻页循环在按钮消失后轮询等待提交稳定（2s 上限）、区间无下界时首个轮尾非 1 即视为未就绪 | 搜索跳 #3 落在轮 3（V1 ×3 + B5 竞态 4/4）；点击跳 #3 4/4；无轮尾轮 #4/#6 精确落在自己的用户行（V5） |
| 2 | 焦点归还（`src/client/search.ts` `toggleSearch`/`closeSearchPanel`） | 关闭面板后焦点滞留隐藏输入框，`editable` 判定吞掉 ⌘↑/⌘↓ 与 toast Esc | V2a/b/c：焦点回到打开前元素；搜索后 Esc 返回（6491→6345）与 ⌘↑（#3→#2）全部可用 |
| 3 | Esc 让位（`src/client/toast.ts` `handleKey`） | 面板（z 930）与 toast（z 920）都是 window capture 监听，Esc 同时触发两者 | V3/B4/B5：面板可见时 Esc 只关面板，滚动不动（posB=posC） |
| 4 | 卡片锚点（`src/client/index.ts` `showCardFor`） | `bar.children[segmentIndex]` 把 playhead（child[0]）算进偏移；段 0 直接锚到 playhead 的 transform 位置 | V4：段 0/5/11 delta ≤1px；末段为视口 clamp（112px，正确行为） |
| 5 | 纯工具轮/无轮尾轮跳转（`turnAnchorRow` + fallback 轮号化） | 无轮尾轮没有用户行时 nthUserRow 落在下一轮用户行；fallback 索引依赖 segment 对象身份 | V5/B3/B4：turn 4/6 精确落在自己的用户行（「先做 A 组…」「继续完成b组…」） |
| 6 | 主题 token（`src/client/index.ts` CSS） | 插件用了不存在的 `--dsw-hovercard-bg`/`--dsw-alias-text-1`/`--dsw-alias-text-accent`，永远走暗色 fallback | V6：卡片/toast 背景 = `--dsw-alias-bg-overlay`（浅色 rgb(233,236,242)）、文字 = `--dsw-alias-label-primary`；accent 换真实品牌蓝 token |
| 7 | 组卡片文案（`src/client/card.ts` `buildGroupCardModel`） | 占位文案「即将上线」已过期 | V7：显示「拖动经过逐轮预览，或在 ⌘K 中精确搜索」 |
| 8 | 版本号（`src/index.ts`） | `export const version = '0.1.0'` ≠ package.json 0.2.0 | lib 导入实测 `version === '0.2.0'` |
| 9 | 双 tooltip（`src/client/index.ts` 段按钮） | `title` 原生 tooltip（~1s）与 120ms 自定义悬停卡叠加 | V9：无 title 属性；aria-label 保留（T2/T2-aria 通过） |
| 10 | 轮询去抖（`useTurnbarData` metaSigRef） | 每 5s 无条件 `setMetaTurns(新数组)` → 整条重渲染 | V10：跨轮询周期段节点同一引用；live 轮次增长/脉冲正常（diagpulse 305ms 亮起） |
| 11 | `loadEarlierVisible` 健壮化 | 只查 flow 内第一个按钮 + 单状态正则（bug 1 诱因） | 并入 bug 1 修复链 |

**额外修复（回归中发现）**：playhead 基准重写——旧「最近轮尾」语义在轮内容前半段偏上一轮（⌘↑ 从 #3 跳到 #1 而非 #2）；改为「中央下方第一个轮尾的轮号」后 ⌘↑/⌘↓ 逐轮精确（batch2 S3）。另：空编辑器不再视为输入语境（`isTypingContext`），搜索关闭后焦点回空 composer 时 Esc 返回/⌘↑↓ 仍可用，有内容时保持不劫持。

**回归结果（修复后全量重跑）**：
- 单测 40/40、`tsc --noEmit` 干净、build 双产物成功
- `verify-fixes.mjs` 20/20（11 个 bug 的验收断言，先红后绿）
- 真机批次 1–10：全部绿（batch7 live 仅 2 项为已知时序假象，脉冲已用长轮单独复核 305ms 亮起）
- 竞态复现率：搜索路径 0/4 → **4/4 正确**；点击路径 4/4 正确
- 全程零控制台 error / pageerror

---

## 七、v0.2.1 体验改进轮（用户反馈驱动）

**用户反馈的三个问题与处理**：

1. **playhead"方块中间一条蓝线"难看** → 改为**段高亮**（方案 A）：阅读位置段整段半透明
   accent 填充 + 底部 2px 实色条，宽=单段宽、左对齐段边界（V12：width 48px、transform
   精确对齐）。与 hover 放大、running 脉冲形成三层视觉，不再有竖线插在段中间。
2. **搜索只有快捷键、没有前端入口** → 进度条右端新增**放大镜按钮**（⌘K 依然可用；
   <2 轮的短会话无条即无按钮）。V13 验证：按钮存在、点击开面板、自动聚焦输入框。
3. **第 8 轮"幽灵轮"bug**（事件流实勘：goal 自动继续轮，用户中止，无任何输入输出）→
   按用户方案**保留并置灰**：段背景降为 0.14 透明度（普通段 0.6）、不可点击、hover 卡片
   注明「该轮已终止，无对话内容」、aria 标注"（已终止，无内容）"、⌘↑/⌘↓ 自动跳过。
   从第 7 到第 9 之间的空轮因此有了合理解释，不再是 bug。V11 全套验证通过。

**附加体验项**：
- 4a 中止徽标：fold 修复 `endReason` 解析（turn/end 的 reason 是对象 `{kind:'aborted'}`，
  旧代码只认字符串 → endReason 从未生效）；真实中止轮卡片 meta 显示「⏹ 已中止」（V14）。
- 4b 搜索结果计数（"N 条结果"）+ ↑↓ 选择时高亮行自动滚入视野。
- 4d hover/playhead 视觉统一（同 accent token 色板）。

**本轮验收**：单测 44/44（新增 endReason 对象解析×2、ghost×2）；verify-fixes V1–V14 全绿；
batch1 21/21、batch2 全绿（含新语义：有内容的编辑器不劫持、空编辑器允许导航）；
fast-regression 8/8（toast 自动隐藏、边界钳制、scrub、160 轮分组 40 段、state 404 降级、空会话）。

**发布侧检查**：安装命令 `dsh plugin --profile <profile> add dsh-turnbar` 官方语法实测有效
（新 profile 只带 dsh-base、需补 @deepseek-ai/dsh-web-app——README 已写明）；GitHub topics
已含 dsh-plugin 等 6 个；README 截图改 raw.githubusercontent 直链（jsdelivr 缓存层避开）；
致谢段补上 @vlln（dsh-navbar）与 @YesSanSan（dsh-conversation-outline）与官方团队。
