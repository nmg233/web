#!/usr/bin/env bash
# 分别备份公开上传与私有反馈附件；默认路径相对仓库 backend 解析。
set -euo pipefail
ENV_FILE="${ENV_FILE:-/etc/pbl-platform/backend.env}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
read_path() {
  local value=""
  if [ -f "$ENV_FILE" ]; then value=$(sed -n "s/^$1=//p" "$ENV_FILE" | head -1); fi
  value="${value%$'\r'}"; value="${value#\"}"; value="${value%\"}"
  value="${value#\'}"; value="${value%\'}"
  value="${value:-$2}"
  case "$value" in /*) ;; *) value="$REPO_ROOT/backend/$value";; esac
  printf '%s' "$value"
}
PUBLIC_ROOT=$(read_path UPLOAD_PATH uploads)
PRIVATE_ROOT=$(read_path FEEDBACK_UPLOAD_PATH private_uploads)
for source in "$PUBLIC_ROOT" "$PRIVATE_ROOT"; do
  if [ ! -d "$source" ]; then echo "上传目录不存在，未生成备份：$source" >&2; exit 1; fi
  resolved=$(cd "$source" && pwd -P)
  if [ "$resolved" = / ]; then echo "禁止备份根目录" >&2; exit 1; fi
done
PUBLIC_ROOT=$(cd "$PUBLIC_ROOT" && pwd -P)
PRIVATE_ROOT=$(cd "$PRIVATE_ROOT" && pwd -P)
BACKUP_DIR="${BACKUP_DIR:-$(dirname "$PUBLIC_ROOT")/backups}"
mkdir -p "$BACKUP_DIR"
STAMP=$(date +%Y%m%d-%H%M%S)
TARGET=""
trap 'status=$?; [ -z "$TARGET" ] || rm -f -- "$TARGET"; echo "上传备份失败，退出码 $status" >&2; exit "$status"' ERR
for kind in uploads feedback-uploads; do
  source="$PUBLIC_ROOT"; [ "$kind" != feedback-uploads ] || source="$PRIVATE_ROOT"
  final="$BACKUP_DIR/$kind-$STAMP.tar.gz"
  if [ -e "$final" ]; then echo "同一秒备份已存在：$final" >&2; exit 1; fi
  TARGET=$(mktemp "$BACKUP_DIR/.$kind-$STAMP.XXXXXX")
  tar -czf "$TARGET" -C "$source" .
  tar -tzf "$TARGET" >/dev/null
  mv -- "$TARGET" "$final"; TARGET=""
  echo "备份完成：$final（内容来自 $source，大小 $(du -h "$final" | cut -f1)）"
  mapfile -t backups < <(find "$BACKUP_DIR" -maxdepth 1 -type f -name "$kind-????????-??????.tar.gz" -print | LC_ALL=C sort -r)
  for ((i=7; i<${#backups[@]}; i++)); do rm -- "${backups[i]}"; done
done
