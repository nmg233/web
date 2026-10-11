#!/usr/bin/env bash
# install-cron.sh — 幂等安装或卸载自动备份任务（当前用户 crontab）
set -euo pipefail

if [ $# -gt 1 ] || { [ $# -eq 1 ] && [ "$1" != --uninstall ]; }; then
  echo "用法：sudo bash scripts/install-cron.sh [--uninstall]" >&2
  exit 1
fi
if ! command -v crontab >/dev/null 2>&1; then
  echo "❌ crontab 不可用，请先安装 cron" >&2
  exit 1
fi

WORK_DIR=$(mktemp -d)
trap 'rm -rf -- "$WORK_DIR"' EXIT
if ! LC_ALL=C crontab -l > "$WORK_DIR/current" 2> "$WORK_DIR/error"; then
  # 没有 crontab 是正常首次安装；权限及其他错误必须报告。
  if ! LC_ALL=C grep -qi 'no crontab for' "$WORK_DIR/error"; then
    echo "❌ 无法读取当前用户 crontab：$(cat "$WORK_DIR/error")" >&2
    exit 1
  fi
fi

MARKER='# pbl-platform-backup:'
if [ "${1:-}" = --uninstall ]; then
  sed '/# pbl-platform-backup:/d' "$WORK_DIR/current" > "$WORK_DIR/next"
else
  APP_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
  # 原子布局必须保留 current 的逻辑路径，不能将任务永久固定到某个旧发行版。
  if [ -n "${BACKUP_APP_DIR:-}" ]; then
    case "$BACKUP_APP_DIR" in /*) ;; *) echo "BACKUP_APP_DIR 必须为绝对路径" >&2; exit 1;; esac
    if [ ! -d "$BACKUP_APP_DIR/backend" ]; then echo "备份应用目录不存在" >&2; exit 1; fi
    APP_DIR="$BACKUP_APP_DIR"
  fi
  # POSIX 单引号转义保护安装路径（包括空格及单引号）。
  APP_QUOTED="'${APP_DIR//\'/\'\\\'\'}'"
  cp "$WORK_DIR/current" "$WORK_DIR/next"
  # crontab 通常以换行结束；兼容没有末尾换行的现有内容。
  if [ -s "$WORK_DIR/next" ] && [ -n "$(tail -c 1 "$WORK_DIR/next")" ]; then
    printf '\n' >> "$WORK_DIR/next"
  fi
  SCHEDULES=('0 2 * * *' '0 3 * * *' '0 4 * * 0')
  IDS=(db uploads full)
  COMMANDS=('bash ../scripts/backup-db.sh' 'bash ../scripts/backup-uploads.sh' 'bash ../scripts/backup-db.sh && bash ../scripts/backup-uploads.sh')
  for i in 0 1 2; do
    COMMAND="cd $APP_QUOTED/backend && ${COMMANDS[i]}"
    COMMAND_QUOTED="'${COMMAND//\'/\'\\\'\'}'"
    JOB="${SCHEDULES[i]} /bin/bash -c $COMMAND_QUOTED >> /var/log/pbl-backup.log 2>&1 $MARKER${IDS[i]}"
    JOB="${JOB//%/\\%}"
    if grep -Fxq -- "$JOB" "$WORK_DIR/next"; then
      echo "ℹ️ 任务已存在，跳过：${IDS[i]}"
    else
      # 同一标记的旧路径或旧时间替换为当前配置。
      sed "/# pbl-platform-backup:${IDS[i]}$/d" "$WORK_DIR/next" > "$WORK_DIR/updated"
      mv "$WORK_DIR/updated" "$WORK_DIR/next"
      printf '%s\n' "$JOB" >> "$WORK_DIR/next"
      echo "准备安装任务：${IDS[i]}（${SCHEDULES[i]}）"
    fi
  done
fi
if cmp -s "$WORK_DIR/current" "$WORK_DIR/next"; then
  echo "✅ crontab 无需修改"
elif crontab "$WORK_DIR/next"; then
  if [ "${1:-}" = --uninstall ]; then
    echo "✅ 自动备份任务已卸载"
  else
    echo "✅ 自动备份任务已安装"
  fi
else
  echo "❌ 无法写入当前用户 crontab，请检查权限" >&2
  exit 1
fi
