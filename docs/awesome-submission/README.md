# awesome / 目录站 / 生态渠道 提交运行手册（M0 曝光补课 · v0.3）

> 状态：2026-08-18。**awesome-dsh-plugin 补丁已生成**（`awesome-dsh-plugin.patch`），
> 提交被 GitHub fork 风控（HTTP 403）拦截——账号 rex178178 的 fork 权限暂时冻结，
> 停止硬重试等自动解除（历史经验：数小时）。解除后一键提交：`./scripts/submit-awesome.sh --go`。

## 1. awesome-dsh-plugin（主渠道：喂 in-harness 市场 + 官方目录站）

仓库：`awesome-dsh-plugin/awesome-dsh-plugin`（数据 `data/plugins/*.yml`，README 由脚本生成）。

- 待提交文件：`data/plugins/rex178178__dsh-turnbar.yml`（= `docs/awesome-submission/rex178178__dsh-turnbar.yml`）
- 生成后 diff：`docs/awesome-submission/awesome-dsh-plugin.patch`（README.md + README.zh.md 各 +1 行，1343 条目场景验证过，排在 renat3u 与 Ricketts-Guo 之间）
- 提交命令（fork 解除后）：

```sh
gh repo fork awesome-dsh-plugin/awesome-dsh-plugin --clone --fork-name awesome-add-turnbar
cd awesome-add-turnbar
cp /Users/rexli/DSH-pulgin/docs/awesome-submission/rex178178__dsh-turnbar.yml data/plugins/
pnpm install --no-frozen-lockfile
node scripts/generate-readme.mjs          # 应与 patch 一致
git add data/plugins/rex178178__dsh-turnbar.yml README.md README.zh.md
git commit -m "Add rex178178/dsh-turnbar (ui)"
git push -u origin main
gh pr create --repo awesome-dsh-plugin/awesome-dsh-plugin \
  --title "Add rex178178/dsh-turnbar" \
  --body "Adds dsh-turnbar to the ui category. Video-style turn navigation: full-map progress bar, hover previews, drag scrub, ⌘K search landing on the bar, context fuel gauge, /goal chapter ticks, ⌘/Alt+click trajectory jump. v0.3.0, MIT, official composer.dock slot, no patches."
```

验收：PR 合并后 README 出现条目 + repo 可挂官方 badge
`[![awesome · DSH plugin](https://awesome-dsh-plugin.com/badge.svg)](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)`。

## 2. 六个目录站（长尾搜索入口）

> 多数为网页表单/独立站点，agent 侧无法代填。以下为每个站的提交口径，逐站粘贴对应区块即可。
> 提交前先搜站内是否已有 dsh-turnbar 条目（08-18 时点均无）。

统一素材：

- 名称：`dsh-turnbar`
- 链接：`https://github.com/rex178178/dsh-turnbar` · 包：`https://www.npmjs.com/package/dsh-turnbar`
- 安装：`dsh plugin --profile web add dsh-turnbar`
- 描述（en）：`Video-style progress bar for DeepSeek Harness conversations: full-map turn navigation, hover preview cards, drag scrub, ⌘K search that lands on the bar, context-window fuel gauge, /goal chapter ticks, and ⌘/Alt+click trajectory jump. MIT, official slot, no patches.`
- 描述（zh）：`给 DeepSeek Harness 会话装视频进度条：全景轮次导航、悬停预览、拖动 scrub、结果落在进度条上的 ⌘K 搜索、上下文余量仪表、/goal 章节刻度、⌘/Alt 点击直达轨迹视图。`
- 标签：`dsh-plugin, navigation, progress-bar, timeline, context-window, search, trajectory`
- 截图：https://github.com/rex178178/dsh-turnbar（README 首屏三张 + 新 `docs/demo-scrub.gif`）

| 站点 | 提交渠道 | 备注 |
|---|---|---|
| dshplugins.cc | 网页表单 https://www.dshplugins.cc/en/submit（推测） | 英文描述 |
| dshplugin.dev | 网页表单 | 英文描述 + 截图 URL |
| dshbase.com | 网页表单 https://dshbase.com/plugins/_submit | 英文或中文均可 |
| dsh-plugins.org | GitHub PR（仓库 dsh-plugins-org/plugins）——待核实，若可 PR 用第 1 节同款流程 | 中文列表 |
| dshplugin.app | 网页表单 | 附 GitHub 链接 |
| dshget.com | 网页表单 | 描述 + 安装命令 |
| dshplugin.store | 网页提交 | 英文 |

提交顺序建议：主渠道（awesome）收腹后 24h 内把 6 站补齐，逐站留痕（记录提交时间/账号）。

## 3. vlln/plugin-registry（★54 生态入口）

形态是「浏览器控制台 + make-dsh-plugin skill」，以官方仓库插件为索引源——非独立收录列表，
无需单独提交。其在 awesome 的条目已含导航类（dsh-navbar），不影响我们。

## 4. 收尾检查清单

- [ ] awesome PR 合并 → README 可见 + 挂 badge
- [ ] 6 目录站条目可搜到
- [ ] README 首屏换 `docs/demo-scrub.gif`（v0.3 动图）
- [ ] CHANGELOG/发布帖更新提交状态