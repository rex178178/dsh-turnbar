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

## 镜像即真相

生产 profile（web）当前 turnbar 还是 0.2.2——本方案验收通过后，生产更新为一条命令：
`dsh plugin --profile web update dsh-turnbar`（或 add 0.3.0），发布风险归零。