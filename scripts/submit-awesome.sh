#!/bin/bash
# 自动上架 awesome-dsh-plugin（= dshmarket 目录源）：
# 1. 每 15 分钟重试 fork（GitHub 风控 403 解除后成功；可交给朋友账号代跑）
# 2. fork 成功后 clone 到临时目录，复制提交文件
# 3. 等 dsh-turnbar 仓库满 1 天（2026-08-17T06:11:25Z）后运行生成脚本并提 PR
#
# 用当前 gh 登录账号提交（默认为本机账号；朋友代跑时设置 FORK_OWNER=朋友账号）：
#   FORK_OWNER=friendaccount bash scripts/submit-awesome.sh
set -u
LOG=/tmp/awesome-submit.log
FORK_OWNER="${FORK_OWNER:-rex178178}"
echo "[$(date -u +%FT%TZ)] start (fork owner: $FORK_OWNER)" >> "$LOG"

FORK_DIR=/tmp/awesome-dsh-plugin-fork
# YAML 与脚本同仓：按脚本自身位置解析，任何机器克隆后都能直接跑
YML="$(cd "$(dirname "$0")/.." && pwd)/docs/awesome-submission/rex178178__dsh-turnbar.yml"

# macOS/BSD 与 GNU date 兼容的"满 1 天"时间戳
if date -u -d '2026-08-17T06:11:25Z' +%s >/dev/null 2>&1; then
  ELIGIBLE_AT=$(date -u -d '2026-08-17T06:11:25Z' +%s)
else
  ELIGIBLE_AT=$(date -u -j -f '%Y-%m-%dT%H:%M:%SZ' '2026-08-17T06:11:25Z' +%s)
fi

# ── 阶段 1：重试 fork（风控 403 会持续几小时到一天） ──
FORKED=0
if gh repo view "$FORK_OWNER/awesome-dsh-plugin" >/dev/null 2>&1; then
  FORKED=1
  echo "[$(date -u +%FT%TZ)] fork already exists" >> "$LOG"
else
  for i in $(seq 1 400); do
    if gh repo fork awesome-dsh-plugin/awesome-dsh-plugin --clone=false >/dev/null 2>&1; then
      echo "[$(date -u +%FT%TZ)] fork OK (attempt $i)" >> "$LOG"
      FORKED=1
      break
    fi
    echo "[$(date -u +%FT%TZ)] fork 403, retry $i" >> "$LOG"
    sleep 900
  done
fi
if [ "$FORKED" -ne 1 ]; then
  echo "[$(date -u +%FT%TZ)] fork never succeeded — giving up" >> "$LOG"
  exit 1
fi

# ── 阶段 2：clone fork ──
rm -rf "$FORK_DIR"
if ! git clone --depth 1 "git@github.com:${FORK_OWNER}/awesome-dsh-plugin.git" "$FORK_DIR" >> "$LOG" 2>&1; then
  git clone --depth 1 "https://github.com/${FORK_OWNER}/awesome-dsh-plugin.git" "$FORK_DIR" >> "$LOG" 2>&1
fi
echo "[$(date -u +%FT%TZ)] fork cloned" >> "$LOG"

# ── 阶段 3：等仓库满 1 天 ──
NOW=$(date -u +%s)
if [ "$NOW" -lt "$ELIGIBLE_AT" ]; then
  WAIT=$((ELIGIBLE_AT - NOW + 120))
  echo "[$(date -u +%FT%TZ)] waiting ${WAIT}s until repo is 1 day old" >> "$LOG"
  sleep "$WAIT"
fi

# ── 阶段 4：加条目 + 生成 README + PR ──
cd "$FORK_DIR" || exit 1
git checkout main >> "$LOG" 2>&1 || git checkout -b main >> "$LOG" 2>&1
git pull --rebase origin main >> "$LOG" 2>&1 || true
cp "$YML" "data/plugins/rex178178__dsh-turnbar.yml"
# 生成脚本依赖 js-yaml/marked：fork 克隆无 node_modules，先装
pnpm install --no-frozen-lockfile >> "$LOG" 2>&1 || npm install >> "$LOG" 2>&1
node scripts/generate-readme.mjs >> "$LOG" 2>&1 || true
git checkout -b add-dsh-turnbar >> "$LOG" 2>&1 || git checkout add-dsh-turnbar >> "$LOG" 2>&1
git add -A
git -c user.name="$FORK_OWNER" -c user.email="$FORK_OWNER@users.noreply.github.com" \
  commit -m "Add dsh-turnbar — video-style turn navigation (progress bar, scrub, fuel gauge, chapters, trajectory jump)" >> "$LOG" 2>&1
git push -u origin add-dsh-turnbar >> "$LOG" 2>&1
gh pr create --repo awesome-dsh-plugin/awesome-dsh-plugin \
  --head "$FORK_OWNER:add-dsh-turnbar" --base main \
  --title "Add dsh-turnbar — video-style turn navigation" \
  --body "Adds [rex178178/dsh-turnbar](https://github.com/rex178178/dsh-turnbar) (npm: dsh-turnbar, v0.3.0).

Video-style in-session turn navigation: full-map progress bar, hover preview cards (tools/files/tokens), drag scrub, ⌘K search that lands on the bar, context-window fuel gauge, /goal chapter ticks, ⌘/Alt+click Trajectory-view jump, ⌘↑/⌘↓ stepping, Esc-return. Dual-half plugin on the official conversation.composer.dock slot, no patches. Tested on dsh 0.1.0-rc.5/6/7.

Entry: \`data/plugins/rex178178__dsh-turnbar.yml\` + regenerated READMEs." >> "$LOG" 2>&1
echo "[$(date -u +%FT%TZ)] PR created" >> "$LOG"
