#!/usr/bin/env bash
# backup-uploads.sh — 上传目录备份，保留最近 7 份
# 默认从 ENV_FILE 读取 UPLOAD_PATH；相对路径以当前工作目录为基准
set -euo pipefail

ENV_FILE="${ENV_FILE:-/etc/pbl-platform/backend.env}"
TARGET=""
trap 'status=$?; echo "❌ 上传备份失败（退出码 $status），请检查上述错误" >&2; [ -z "$TARGET" ] || rm -f -- "$TARGET"; exit "$status"' ERR

UPLOAD_PATH_VAL="uploads"
if [ -f "$ENV_FILE" ]; then
  VALUE=$(sed -n 's/^UPLOAD_PATH=//p' "$ENV_FILE" | head -1)
  VALUE="${VALUE%$'\r'}"
  # 支持 env 文件中常见的单引号或双引号路径，不执行文件内容。
  VALUE="${VALUE#\"}"; VALUE="${VALUE%\"}"
  VALUE="${VALUE#\'}"; VALUE="${VALUE%\'}"
  UPLOAD_PATH_VAL="${VALUE:-uploads}"
fi

if [ ! -d "$UPLOAD_PATH_VAL" ]; then
  echo "❌ 上传目录不存在：$UPLOAD_PATH_VAL" >&2
  exit 1
fi

UPLOAD_PATH_VAL=$(cd "$UPLOAD_PATH_VAL" && pwd -P)
if [ "$UPLOAD_PATH_VAL" = / ]; then
  echo "❌ 上传目录不能是根目录" >&2
  exit 1
fi
BACKUP_DIR="$(dirname "$UPLOAD_PATH_VAL")/backups"
mkdir -p "$BACKUP_DIR"
STAMP=$(date +%Y%m%d-%H%M%S)
FINAL_TARGET="$BACKUP_DIR/uploads-$STAMP.tar.gz"
if [ -e "$FINAL_TARGET" ]; then
  echo "❌ 同一秒的备份已存在：$FINAL_TARGET" >&2
  exit 1
fi
TARGET=$(mktemp "$BACKUP_DIR/.uploads-$STAMP.XXXXXX")
tar -czf "$TARGET" -C "$(dirname "$UPLOAD_PATH_VAL")" -- "$(basename "$UPLOAD_PATH_VAL")"
mv -- "$TARGET" "$FINAL_TARGET"
TARGET=""
# 按时间戳文件名降序排列；逐行删除，兼容路径中的空格。
mapfile -t BACKUPS < <(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'uploads-????????-??????.tar.gz' -print | LC_ALL=C sort -r)
for ((i=7; i<${#BACKUPS[@]}; i++)); do
  rm -- "${BACKUPS[i]}"
done
SIZE=$(du -h "$FINAL_TARGET" | cut -f1)
echo "✅ 上传备份完成：$FINAL_TARGET"
echo "   大小：$SIZE"
