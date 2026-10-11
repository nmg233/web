#!/usr/bin/env bash
# backup-db.sh — 部署前数据库备份（.backup + 完整性校验）
# 用法：bash scripts/backup-db.sh [数据库路径]
# 默认从 ENV_FILE 的 DB_PATH 读取；备份到 <数据库同目录>/backups/
set -euo pipefail

ENV_FILE="${ENV_FILE:-/etc/pbl-platform/backend.env}"

if [ -n "${1:-}" ]; then
  DB_PATH_VAL="$1"
elif [ -f "$ENV_FILE" ]; then
  DB_PATH_VAL=$(sed -n 's/^DB_PATH=//p' "$ENV_FILE" | head -1)
else
  echo "用法：bash scripts/backup-db.sh <数据库路径>"
  exit 1
fi
DB_PATH_VAL="${DB_PATH_VAL%$'\r'}"
DB_PATH_VAL="${DB_PATH_VAL#\"}"; DB_PATH_VAL="${DB_PATH_VAL%\"}"
DB_PATH_VAL="${DB_PATH_VAL#\'}"; DB_PATH_VAL="${DB_PATH_VAL%\'}"
case "$DB_PATH_VAL" in /*) ;; *) DB_PATH_VAL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../backend" && pwd -P)/$DB_PATH_VAL";; esac

if [ -z "$DB_PATH_VAL" ] || [ ! -f "$DB_PATH_VAL" ]; then
  echo "❌ 数据库不存在：$DB_PATH_VAL"
  exit 1
fi

BACKUP_DIR="$(dirname "$DB_PATH_VAL")/backups"
mkdir -p "$BACKUP_DIR"
STAMP=$(date +%Y%m%d-%H%M%S)
TARGET="$BACKUP_DIR/pre-deploy-$STAMP.db"
if [ -e "$TARGET" ]; then echo "同一秒备份已存在：$TARGET" >&2; exit 1; fi
PARTIAL=$(mktemp "$BACKUP_DIR/.database-$STAMP.XXXXXX")
trap 'status=$?; rm -f -- "$PARTIAL"; exit "$status"' ERR

SQL_TARGET="${PARTIAL//\'/\'\'}"
sqlite3 "$DB_PATH_VAL" ".backup '$SQL_TARGET'"
CHECK=$(sqlite3 "$PARTIAL" "PRAGMA integrity_check;")
if [ "$CHECK" != "ok" ]; then
  echo "❌ 备份完整性校验失败：$CHECK"
  rm -f -- "$PARTIAL"
  exit 1
fi
mv -- "$PARTIAL" "$TARGET"

echo "✅ 备份完成：$TARGET"
echo "   完整性：$CHECK"
# 保留最近 7 份
mapfile -t backups < <(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'pre-deploy-????????-??????.db' -print | LC_ALL=C sort -r)
for ((i=7; i<${#backups[@]}; i++)); do rm -- "${backups[i]}"; done
