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
git fetch origin
git checkout "$BRANCH"
git pull origin "$BRANCH"

cd backend
npm ci
# better-sqlite3 预编译包可能不兼容服务器 glibc，统一在服务器本地编译
npm rebuild better-sqlite3 --build-from-source
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
