#!/usr/bin/env bash
# doctor.sh — 部署前环境检查（测试/生产通用）
# 用法：bash scripts/doctor.sh   （可在 deploy.sh 前单独执行）
set -uo pipefail

ENV_FILE="${ENV_FILE:-/etc/pbl-platform/backend.env}"
FAIL=0

check_bin() {
  if command -v "$1" >/dev/null 2>&1; then
    echo "  [ok] $1 ($(command -v "$1"))"
  else
    echo "  [FAIL] 缺少命令：$1"
    FAIL=1
  fi
}

echo "== 1/6 基础命令 =="
check_bin node
check_bin npm
check_bin git
check_bin sqlite3
check_bin curl
check_bin rsync
check_bin gcc
check_bin g++

echo "== 2/6 Node 版本 =="
NODE_MAJOR=$(node -v 2>/dev/null | sed 's/v\([0-9]*\).*/\1/')
if [ -n "${NODE_MAJOR:-}" ] && [ "$NODE_MAJOR" -ge 22 ]; then
  echo "  [ok] node $(node -v)（要求 >=22）"
else
  echo "  [WARN] node 版本 $(node -v 2>/dev/null || echo 未知)，建议 22 LTS"
fi

echo "== 3/6 滑翔机引擎（可选） =="
check_bin python3
if [ -n "${GLIDER_PYTHON:-}" ]; then
  echo "  [info] GLIDER_PYTHON=$GLIDER_PYTHON"
else
  echo "  [WARN] 未设置 GLIDER_PYTHON：Linux 将默认使用 python3（reference 后端仍需 numpy/matplotlib）"
fi

echo "== 4/6 环境文件 =="
if [ -f "$ENV_FILE" ]; then
  echo "  [ok] $ENV_FILE 存在"
  for KEY in DB_PATH UPLOAD_PATH JWT_SECRET; do
    if grep -q "^${KEY}=" "$ENV_FILE" 2>/dev/null; then
      echo "  [ok] 已配置 $KEY"
    else
      echo "  [FAIL] 缺少 $KEY（生产必须显式设置）"
      FAIL=1
    fi
  done
else
  echo "  [WARN] 未找到 $ENV_FILE（本地开发可忽略）"
fi

echo "== 5/6 数据目录 =="
if [ -f "$ENV_FILE" ]; then
  DB_PATH_VAL=$(grep -E '^DB_PATH=' "$ENV_FILE" | head -1 | cut -d= -f2-)
  UP_PATH_VAL=$(grep -E '^UPLOAD_PATH=' "$ENV_FILE" | head -1 | cut -d= -f2-)
  [ -n "$DB_PATH_VAL" ] && { [ -f "$DB_PATH_VAL" ] && echo "  [ok] 数据库存在：$DB_PATH_VAL" || echo "  [WARN] 数据库不存在（首次部署需 db:provision）：$DB_PATH_VAL"; }
  [ -n "$UP_PATH_VAL" ] && { [ -d "$UP_PATH_VAL" ] && echo "  [ok] 上传目录存在：$UP_PATH_VAL" || echo "  [WARN] 上传目录不存在（将由应用创建）：$UP_PATH_VAL"; }
fi

echo "== 6/6 磁盘空间 =="
df -h . 2>/dev/null | tail -1 | awk '{print "  [info] 当前分区可用：" $4 " / 总 " $2}'

if [ "$FAIL" -ne 0 ]; then
  echo
  echo "❌ doctor 检查未通过，请先解决上述 FAIL 项再部署。"
  exit 1
fi
echo
echo "✅ doctor 检查通过"
