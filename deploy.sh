#!/usr/bin/env bash
set -euo pipefail

# 一键部署脚本：默认部署 main 分支
# 用法：
#   ./deploy.sh [分支名]
#   RESET_DB=1 ./deploy.sh main   # 重置数据库并恢复默认测试账号
# 默认值对应当前 ECS 环境：前端目录 /var/www/pbl-platform，systemd 服务 pbl-backend.service。
# 可通过 NGINX_ROOT / SERVICE / SYNC_DELETE 等环境变量覆盖。
BRANCH="${BRANCH:-${1:-main}}"
APP_DIR="${APP_DIR:-$(pwd)}"
NGINX_ROOT="${NGINX_ROOT:-/var/www/pbl-platform}"
SERVICE="${SERVICE:-pbl-backend}"
RESET_DB="${RESET_DB:-0}"
SYNC_DELETE="${SYNC_DELETE:-0}"

cd "$APP_DIR"

# 部署前环境预检与数据库备份（失败即停止）
echo "== deploy: 环境预检 =="
bash scripts/doctor.sh
echo "== deploy: 数据库备份 =="
bash scripts/backup-db.sh || echo "[WARN] 数据库备份失败（本地开发可忽略），是否继续由 set -e 决定"

git fetch origin
git checkout "$BRANCH"
git pull origin "$BRANCH"

cd backend
npm ci
# better-sqlite3 v13 会优先加载 npm 包内的 linux-x64 prebuild，旧 glibc 测试机运行会失败。
# 因此部署时强制在本机编译 native addon，并将不兼容的 prebuild 移出加载路径。
BETTER_DIR="node_modules/better-sqlite3"
PYTHON_BIN="${PYTHON:-/usr/bin/python3.11}"
NODE_GYP="${NODE_GYP:-$(command -v node-gyp || true)}"
if [ -z "$NODE_GYP" ]; then
  NODE_GYP="/usr/lib/node_modules/npm/node_modules/node-gyp/bin/node-gyp.js"
fi

if [ ! -f "$NODE_GYP" ]; then
  echo "error: node-gyp not found at $NODE_GYP" >&2
  exit 1
fi

(
  cd "$BETTER_DIR"
  PYTHON="$PYTHON_BIN" node "$NODE_GYP" rebuild --release --force_build=1
  if [ -f prebuilds/linux-x64.node ]; then
    mv prebuilds/linux-x64.node prebuilds/linux-x64.node.incompatible
  fi
)

node -e "
const Database = require('better-sqlite3');
const db = new Database(':memory:');
db.close();
console.log('better-sqlite3 native binding OK');
"
if [ "$RESET_DB" = "1" ]; then
  npm run db:reset
fi

cd ../frontend
npm ci
npm run build
if [ "$SYNC_DELETE" = "1" ]; then
  rsync -a --delete dist/ "$NGINX_ROOT/"
else
  rsync -a dist/ "$NGINX_ROOT/"
fi

cd ../backend
if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files "$SERVICE.service" >/dev/null 2>&1; then
  systemctl restart "$SERVICE"
else
  pm2 restart "$SERVICE"
fi

sleep 2
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/health}"
curl -fsS "$HEALTH_URL"
echo
echo "deploy ok"
