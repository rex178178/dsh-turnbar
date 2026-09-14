# 验收运行手册（发布前全场景 · v0.3 起）

**设计初衷**（用户 2026-08-18 提出）：功能/安装包验收一律在**发布前**用本地产物完成，
发布只是最后一个签名动作——消除"发了才验、验出新问题再发一次"的循环。

## 三条验收链（全绿才允许 publish）

| # | 链 | 产物 | 覆盖 |
|---|---|---|---|
| 1 | 单元/构建 | `pnpm test`（84）· `tsc --noEmit` · `pnpm build` | 逻辑、类型、产物 |
| 2 | **本地 tarball 安装** | `pnpm pack` → 干净 profile 装 tarball → 实例→ state 路由 200 | **打包完整性**（files/exports/patch/bundle），与发布上传同源 |
| 3 | **生产镜像全场景** | `turnbar-mirror` profile（同版本同源装齐生产插件）+ 本地 tarball | 插件全家桶共存、键位、DOM 锚点、dock 布局 |

## 链 3：turnbar-mirror（生产镜像）操作

```sh
# 1) 建 profile 并同源装齐生产插件（首次）
dsh plugin --profile turnbar-mirror add @linxin666/dsh-web-ui-all
dsh plugin --profile turnbar-mirror add dshmarket
dsh plugin --profile turnbar-mirror add github:vlln/dsh-navbar
dsh plugin --profile turnbar-mirror add github:GanyuanRan/Aegis
dsh plugin --profile turnbar-mirror add github:Ychris12138/dsh-usage-stats
dsh plugin --profile turnbar-mirror add ./dsh-turnbar-0.3.0.tgz   # 本地 tarball！

# 2) pnpm 拦截构建脚本时，在 profile 的 pnpm-workspace.yaml 里
#    allowBuilds 全部置 true（含 cloudflared/ssh2/cpu-features 与三个 github 源插件名）

# 3) 对齐生产 bundle 顺序（node 脚本改 package.json 的 dsh.profile.bundles）：
#    base, web-app, web-ui-all, dshmarket, aegis, dsh-usage-stats, navbar, turnbar

# 4) 启动
dsh --profile turnbar-mirror --port 8794        # 后台跑，查日志无 waiting-for-service

# 5) 跑三套验收（脚本已参数化，TB_PORT/TB_CDP 可覆盖）
TB_PORT=8794 TB_CDP=9346 node .usertest/cdp-v023-verify.mjs       # 回归 8 项
TB_PORT=8794 TB_CDP=9346 node .usertest/cdp-v03-verify.mjs        # v0.3 专项 10 项
TB_PORT=8794 TB_CDP=9353 node .usertest/cdp-v03-mirror-conflicts.mjs  # 全家桶冲突 9 项
```

脚本共用一个头 chrome，跑前 `pkill -f "Google Chrome"` 清残留。
headless 视口窄（约 756px）：dock/条宽度断言用**占比**而非绝对值。

## 2026-08-18 v0.3.0 验收结果（发布前，全在本地产物上完成）

| 链 | 结果 |
|---|---|
| 单测/tsc/build | **84/84 · 0 错误 · build OK** |
| 本地 tarball 安装（profile turnbar-tarball） | state 路由 200，18 轮/contextWindow/chapterBreaks/contextUsed 全字段 ✓ |
| 回归（v023，镜像上） | **8/8 PASS** |
| v0.3 专项（镜像上） | **10/10 PASS** |
| 全家桶冲突专项（镜像：navbar+web-ui-all+aegis+usage-stats+dshmarket+turnbar-0.3.0-tarball） | **9/9 PASS**：dock 100% 独占、navbar 13 个锚点共存、⌘K/⌘↑ 不互抢、点 #11 落同一 user 行、悬停卡正常、页面健康 |

> 排查记录：冲突专项曾误报——原因全是"headless 窄视口绝对宽度（usable=358px 其实是 dock 100% 占满）
> 与 CDP `returnByValue` 序列化 DOM 元素的 -32000 坑（scene 里带元素引用）、prompt 文本触发错误横幅正则；
> 非真实冲突。已改为占比断言 + JSON 字符串返回 + 去掉脆弱的正文正则。

## 时序盲区（2026-08-19 生产事故教训，必须对每个发版执行）

**事故**：生产"该轮已终止 + 历史轮次消失"。根因=**重启时序**：resume/fork 不重放
firehose，插件事进重启后**只收新事件**，旧逻辑把半截/空 live 当权威（遮蔽 sidecar、
save 还把 sidecar 冲掉）。镜像验收没拦住，因为它总是"先拉 state、后进事件"，恰好绕开
那条时序。

**从此每个发版必须加一条"重启断链"验收**（不只是装齐插件）：

1. 实例起 → 浏览器打开会话 → 进度条出现 N 段（基线）
2. **在浏览器仍连着时重启 host 进程**（kill + 同端口重启）
3. 浏览器刷新后断言：进度条**仍 ≥N 段**、悬停有真实内容（非「该轮已终止」）、
   侧车旧轮仍在（state 首轮 index 为 1）
4. 语义保证（v0.3.1 代码层）：合并 sidecar+live、完整性优先（半截 live 不冒充完整）、
   落盘前合并（历史不丢）、大日志半读落 readRaw 兜底、回填成功才 seeded。

v0.3.1 已含以上全部代码修复 + 4 条对应单测（93 全绿）+ 生产 21 轮回填实测。

## 镜像即真相

生产 profile（web）当前 turnbar 还是 0.2.2——本方案验收通过后，生产更新为一条命令：
`dsh plugin --profile web update dsh-turnbar`（或 add 0.3.0），发布风险归零。

## 2026-09-13 v0.3.2 验收记录（dsh 0.1.5-rc.1 环境）

| Gate | 结果 |
|---|---|
| G0 单测/tsc/build | **99/99 · 0 错误 · build OK**（新增 6 个句柄链用例） |
| G1 数据面（清 sidecar 防假绿后） | state 200 · 7 轮，数据只能来自新句柄链 ✓ |
| G2 回归 8 项 | **6/8**（A/F11 挂——见下"0.1.5 UI 移除"） |
| G3 v0.3 专项 10 项 | **10/10 PASS** |
| G4 重启断链 | **PASS**（18 段保住/悬停真实内容/首轮 index=1） |
| G5 镜像（tarball 0.3.2） | v023 6/8 · v03 10/10 · 冲突 **7/9**（见下） |
| F5 dup-splice 数据手术 | 31ed62b0 剔 1 条被拒 splice → **双复验双门过**（应用打开无报错+97 行渲染+18 段；state 200） |

**0.1.5 两处 UI 移除（全部挂项的唯一根因，与 0.3.2 修复正交）**：
1. `chat.locations.getTurn` 权威轮次索引被删 → 跳转落区间法盲区：轮次正确但锚在
   工具行（A/F11/#11 冲突项）。修法属 client 半区（已拍板并入 0.3.2，见 PLAN-V032.md §10）。
2. 聊天行不再渲染 `data-time-hover-root` → 冲突套件的"navbar 存活"计数断言失效
   （计数对象是 dsh 聊天行标记，0 个）。

### 同日 §10 B 路线（跳转锚定 DOM 分组）实施后复验——全绿

| Gate | 结果 |
|---|---|
| G0 单测/tsc/build | **117/117 · 0 错误 · build OK**（新增 18 个分组/锚选择用例） |
| G2 回归 8 项（8791 link） | **8/8 PASS**（A/F11 转绿：A 落 user 行 205ms、F11 落"我换Pro模型推进吧"） |
| G3 v0.3 专项 10 项 | **10/10 PASS** |
| G4 重启断链 | **PASS**（18 段保住/悬停真实内容/首轮 index=1） |
| G5 镜像（重打包 tarball 0.3.2 重装） | v023 **8/8** · v03 **10/10** · 冲突 **9/9 全 PASS** |

**§10 实施追加的三条真机实证（8791，已消化进代码与用例）**：
1. `data-turn-tail` 属性长在 flowItem **内部**的轮尾元素上（`userRowOfTurn` 的
   closest 上溯同证），flowItem 本身没有——分组适配层必须 `querySelector` 向内查。
2. aborted 轮（如轮 10）掏空到只剩 user 行 + 无属性轮尾壳：壳 key 形如
   `9:turn-tail10` 但**不带轮号信息**。壳会被向后归属扫进下轮组、恰好卡在
   漏入 user 与触发 user 中间——两个修正：归属的 prev 只跟随携带轮号的行；
   `pickGroupAnchor` 对壳跳过不收网（否则 lastUser 停在漏入行，F11 锚"我还Pro"）。
3. **分组闸门 `groupPendingFor`**：翻完最后一页后 React 分批提交有 1-2 帧窗口
   （user 行先落组、process 锚行后到），窗口内区间法必错锚漏入行——权威索引在
   rc.7 上瞬时命中掩盖过此竞态，0.1.5 无索引必须显式关门（真值时禁区间法答）。
   另：冲突套件"navbar 存活"计数基已从 hover-root 切到 kind=user 聊天行（两代通用）。

**镜像 profile 0.1.5 适配记录**：web-ui-all（含 0.3.6 latest）与 dshmarket 在
0.1.5-rc.1 上**起不来**（`dsh-settings.settingsNamespace/installSettingsSection`
与 `dsh-host-apiproxy` 被删）——第三方生态滞后，非 turnbar 问题。镜像现以
navbar+aegis+usage-stats+turnbar 四家共存跑冲突套件。另：**0.1.5 web 服务新增
`?token=` 鉴权**，验收脚本一律走 `TB_TOKEN`（token 见实例启动日志）。
生产升级警告：若生产 profile 含 web-ui-all/dshmarket，重启到 0.1.5 后这两个插件
将加载失败（先于 turnbar 存在的问题）。