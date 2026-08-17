# Fix: v0.2.2 首末轮跳转失效 + goal 轮用户句丢失 + flash 裁切 + scrub 高亮偏移

复现实例：本项目会话「继续」（session-31ed62b0，18 轮，全部 aborted）。

## 根因（4 个）

1. **末轮跳转误翻页**：`userRowOfTurn` 以「存在 `data-turn-tail > turn`」为窗口下界，
   末轮永远没有 → 返回 null → jump 循环把整段历史翻页加载完 + 空等 2s 才落到
   `turnAnchorRow` 兜底。22k 行会话点末段 = 数秒无响应。
2. **首轮（goal 轮）落错**：`/goal X` 输入被 dsh 记为 `source.kind='goal'` 的
   `<goal_round>` 回显，DOM 渲染为 ContextInjectionRow（无 `data-time-hover-root`/
   bubble）→ 首轮区间内没有用户行；且 aborted 无 closing 时 turn-1 连轮尾都不渲染
   （vendor TurnTailNodeView：`closing === null` 不落 `data-turn-tail`）→
   `firstTurn !== 1` guard 永假 → 走 `nthUserRow(0)` 落到第 2 轮用户行。
   同时 fold 把 goal 回显与 plugin/skill-catalog 一起过滤 → 卡片与 ⌘K 搜索
   丢失「Objective: "…"」这句真实用户输入。
3. **flash 选中超出视口被裁切**：`jumpToRow` 把目标行贴齐滚动容器顶缘，
   outline(2px)+offset(2px) 画在行外侧 → 顶缘被滚动容器裁掉；高行（粘贴/工具爆发）
   的 outline 包整行 → 超出视口部分被裁。
4. **scrub 高亮偏移一格**：`setScrubHighlight` 用 `bar.children[segmentIndex]`，
   children[0] 是 playhead div → 高亮落在目标段左侧一段（showCardFor 已修过同款，
   此处漏网）。

## 修复方案

- fold/first-line：`goalObjective()` 从 `<goal_round>` 提取 `Objective: "…"`；
  fold 对 `source.kind==='goal'` 且提取成功者按真实用户消息归轮（首句填充/steering/
  排队），其余非 user 回显维持过滤。
- client 定位：
  - `userRowOfTurn` 下界 = 自身轮尾 ?? 下一个更大轮尾 ?? **流底**（末轮不再翻页）；
    自身轮尾存在时区间不得越过它（无用户行的轮不再错取下一轮触发消息）。
  - `turnAnchorRow` 统一锚定「区间第一行」（前一轮尾的下一个 flowItem；无上界且
    真·到顶时锚流顶第一个内容行）。
  - `intervalBounded` 同步新语义（有前一轮尾即可信；无上界时要求真到顶）。
  - `jumpToRow` 顶部留白 16px；flash 改 inset 内描边（永不画到行外 → 不被滚动
    容器裁切）。
  - scrub 高亮改用 `[data-turnbar-seg]` 列表（与 showCardFor 同源）。
- 版本 0.2.2 → 0.2.3。

## 验收标准

- [ ] 单测：goalObjective 提取（含中文/多行/无引号兜底）；fold 把 goal 回显记为
      首句、重复 goal 轮记 steering、plugin/skill-catalog 回显仍被过滤。
- [ ] `pnpm test` 全绿（≥44）+ `tsc --noEmit` + `pnpm build` 通过。
- [ ] 真机（8791 + 「继续」18 轮会话，CDP）：
  - [ ] 点第 1 段：落到轮 1 区间首行（goal 上下文行），flash 元素完全在滚动容器
        可视区内（top ≥ scroller.top），无 outline 裁切。
  - [ ] 点第 18 段（末段）：2s 内完成跳转（不再全量翻页空等），flash 落在轮 18
        用户行。
  - [ ] 中段轮（如 #7）跳转不回归。
  - [ ] 悬停卡 #1 显示「测试一下我们刚做的这个Turn Bar…」用户首句。
  - [ ] scrub 拖动时高亮段 = 指针所在段（无偏移）。

## 追加（同日第二轮）：#3 / #11 落错轮——区间法盲区，权威索引定位

用户复检发现 #3（goal 轮）落 tool 行、#11 落 turn 10 的触发行。根因：DOM 区间
启发式对两种形态失明——① 前一轮 aborted 无 closing → vendor 只渲染无
`data-turn-tail` 属性的壳 → #11 的区间 (tail-9, tail-11] 含 turn 10 的触发行；
② goal 轮触发消息渲染为 context 行（无用户气泡）→ #3 区间内无用户行。

修复：改用 store 权威轮次索引 `chat.locations.getTurn(N)`（有序节点 key）与
flowItem 的 `data-chat-flow-key`/`data-chat-flow-kind` 对位（`src/client/locate.ts`
的 `pickTurnAnchor` 纯函数选锚：首个 user 行优先，goal 轮/纯工具轮锚该轮首行；
第 1 轮非 user 锚回落流顶首行——会话开头的 command/context 注入行不在索引内）。
索引未命中（旧版 dsh/未加载）回落原区间法。jump 里 `locateRow = 索引 ?? 区间`。

- [x] 单测：pickTurnAnchor 7 例（常规/context 前置/goal 轮/纯工具轮/steering
      不抢锚/空表/运行中单行）。
- [x] 真机：#3 flash 落「上下文注入goal」行（fullyVisible、上方仅 turn 2 用户行）；
      #11 落 turn 11 触发行「我换Pro模型推进吧」；A–E 全回归通过（8/8）。

## 追加（第三轮）：rc.7 历史会话 404——损坏日志 + 严格校验，readRaw 兜底

真机复现：换新进程后历史会话进度条不渲染；`/plugins/dsh-turnbar/state` 404。
深挖（调试插件直调 sessionPersistence）：
- inspect 对**干净**会话正常（33dd6b21 OK），对 31ed62b0 报
  "complete frame contains a torn JSONL record"——误导性错误，真实病灶是
  尾部 **seq 重复**（end-seed 与第一条 spliced 同为 338224）：扫描器在缺口
  处停止推进 committedBytes → 尾巴全算"未提交" → 报 torn；
- e5706b74 是同族病（seq gap 57715→57711，dsh 已隔离+备份）。

修复两层：
1. **数据修复**（本机 31ed62b0）：备份 → 逐帧解码 → 尾部两 spliced 顺延
   338225/338226 → 重编码（113 帧、checksum）→ inspect 恢复 OK（338227 事件）。
   已验证 state 路由 200 + 全套 8 项 PASS。
2. **插件韧性**（host 半区，v0.2.4）：stateOf 回填链加 readRaw 兜底——
   inspect 抛错/为空时裸读日志文本，逐行 JSON 解析、坏行跳过，fold 不依赖
   seq 连续 → 损坏日志照样出全量轮次图。新增 2 测试（torn 行恢复 / 纯垃圾
   仍 404）。注意：seq 缺口对 fold 无影响（只认 turn/start|end 等类型）。

**Output when complete:** `<promise>DONE</promise>`
