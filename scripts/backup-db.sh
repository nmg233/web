#!/usr/bin/env bash
# backup-db.sh — 部署前数据库备份（.backup + 完整性校验）
# 用法：bash scripts/backup-db.sh [数据库路径]
# 默认从 ENV_FILE 的 DB_PATH 读取；备份到 <数据库同目录>/backups/
set -euo pipefail

ENV_FILE="${ENV_FILE:-/etc/pbl-platform/backend.env}"

if [ -n "${1:-}" ]; then
  DB_PATH_VAL="$1"
elif [ -f "$ENV_FILE" ]; then
  DB_PATH_VAL=$(grep -E '^DB_PATH=' "$ENV_FILE" | head -1 | cut -d= -f2-)
else
  echo "用法：bash scripts/backup-db.sh <数据库路径>"
  exit 1
fi

if [ -z "$DB_PATH_VAL" ] || [ ! -f "$DB_PATH_VAL" ]; then
  echo "❌ 数据库不存在：$DB_PATH_VAL"
  exit 1
fi

BACKUP_DIR="$(dirname "$DB_PATH_VAL")/backups"
mkdir -p "$BACKUP_DIR"
STAMP=$(date +%Y%m%d-%H%M%S)
TARGET="$BACKUP_DIR/pre-deploy-$STAMP.db"

sqlite3 "$DB_PATH_VAL" ".backup '$TARGET'"
CHECK=$(sqlite3 "$TARGET" "PRAGMA integrity_check;")
if [ "$CHECK" != "ok" ]; then
  echo "❌ 备份完整性校验失败：$CHECK"
  rm -f "$TARGET"
  exit 1
fi

echo "✅ 备份完成：$TARGET"
echo "   完整性：$CHECK"
# 保留最近 7 份
ls -1t "$BACKUP_DIR"/pre-deploy-*.db 2>/dev/null | tail -n +8 | xargs -r rm -f
