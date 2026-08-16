#!/bin/bash
# 自动上架 awesome-dsh-plugin（= dshmarket 目录源）：
# 1. 每 15 分钟重试 fork（GitHub 风控 403 解除后成功）
# 2. fork 成功后 clone 到临时目录，复制提交文件
# 3. 等 dsh-turnbar 仓库满 1 天（2026-08-17T06:11:25Z）后运行生成脚本并提 PR
set -u
LOG=/tmp/awesome-submit.log
echo "[$(date -u +%FT%TZ)] start" >> "$LOG"

FORK_DIR=/tmp/awesome-dsh-plugin-fork
YML=/Users/rexli/DSH-pulgin/docs/awesome-submission/rex178178__dsh-turnbar.yml

# macOS/BSD 与 GNU date 兼容的"满 1 天"时间戳
if date -u -d '2026-08-17T06:11:25Z' +%s >/dev/null 2>&1; then
  ELIGIBLE_AT=$(date -u -d '2026-08-17T06:11:25Z' +%s)
else
  ELIGIBLE_AT=$(date -u -j -f '%Y-%m-%dT%H:%M:%SZ' '2026-08-17T06:11:25Z' +%s)
fi

# ── 阶段 1：重试 fork（风控 403 会持续几小时到一天） ──
FORKED=0
if gh repo view rex178178/awesome-dsh-plugin >/dev/null 2>&1; then
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
if ! git clone --depth 1 git@github.com:rex178178/awesome-dsh-plugin.git "$FORK_DIR" >> "$LOG" 2>&1; then
  git clone --depth 1 https://github.com/rex178178/awesome-dsh-plugin.git "$FORK_DIR" >> "$LOG" 2>&1
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
node scripts/generate-readme.mjs >> "$LOG" 2>&1 || true
git checkout -b add-dsh-turnbar >> "$LOG" 2>&1 || git checkout add-dsh-turnbar >> "$LOG" 2>&1
git add -A
git -c user.name=rex178178 -c user.email=rex178178@users.noreply.github.com \
  commit -m "Add dsh-turnbar — video-style turn navigation (progress bar, hover cards, scrub, search)" >> "$LOG" 2>&1
git push -u origin add-dsh-turnbar >> "$LOG" 2>&1
gh pr create --repo awesome-dsh-plugin/awesome-dsh-plugin \
  --head rex178178:add-dsh-turnbar --base main \
  --title "Add dsh-turnbar — video-style turn navigation" \
  --body "Adds [rex178178/dsh-turnbar](https://github.com/rex178178/dsh-turnbar) (npm: dsh-turnbar).

Full-map progress bar with hover preview cards (tools/files/tokens), drag scrub, ⌘K in-conversation search, ⌘↑/⌘↓ stepping, Esc-return. Dual-half plugin on the official conversation.composer.dock slot, no patches. Tested on dsh 0.1.0-rc.5/rc.6.

Entry: \`data/plugins/rex178178__dsh-turnbar.yml\` + regenerated READMEs." >> "$LOG" 2>&1
echo "[$(date -u +%FT%TZ)] PR created" >> "$LOG"
