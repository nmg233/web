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

# novaPhy 交付包不在仓库内，需自行放入 simulation/ 下（见 simulation/README.md）
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WHEEL_DIR="$REPO_ROOT/simulation/novaphy-0.4.0-cpu-cp311-linux-x86_64"
if [ -f "$WHEEL_DIR/novaphy-0.4.0-cp311-cp311-linux_x86_64.whl" ]; then
  echo "  [ok] novaPhy 交付包已就位：$WHEEL_DIR"
else
  echo "  [WARN] 缺少 novaPhy 交付包：$WHEEL_DIR"
  echo "         仅能使用 reference 后端；真 novaPhy 需自行放入，见 simulation/README.md"
fi

# 引擎可用性：GLIDER_PYTHON 指向的解释器能否 import novaphy（wsl: 前缀无法在此直接探测）
if [ -n "${GLIDER_PYTHON:-}" ] && [ "${GLIDER_PYTHON#wsl:}" = "$GLIDER_PYTHON" ]; then
  if "$GLIDER_PYTHON" -c "import novaphy" >/dev/null 2>&1; then
    echo "  [ok] $GLIDER_PYTHON 可 import novaphy（真 novaPhy 后端可用）"
  elif [ "${GLIDER_BACKEND:-auto}" = "novaphy" ]; then
    echo "  [FAIL] GLIDER_BACKEND=novaphy，但 $GLIDER_PYTHON 无法 import novaphy"
    FAIL=1
  else
    echo "  [WARN] $GLIDER_PYTHON 无法 import novaphy：将回退 reference 纯 numpy 后端"
  fi
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
DISK_WARN_PERCENT="${DISK_WARN_PERCENT:-85}"
USED_PCT=$(df -P . 2>/dev/null | tail -1 | awk '{print $5}' | tr -d '%')
df -h . 2>/dev/null | tail -1 | awk '{print "  [info] 当前分区可用：" $4 " / 总 " $2}'
if [ -n "$USED_PCT" ] && [ "$USED_PCT" -ge "$DISK_WARN_PERCENT" ] 2>/dev/null; then
  echo "  [WARN] 磁盘使用率 ${USED_PCT}% 已达告警阈值 ${DISK_WARN_PERCENT}%（滑翔机视频等大文件建议及时归档）"
fi

if [ "$FAIL" -ne 0 ]; then
  echo
  echo "❌ doctor 检查未通过，请先解决上述 FAIL 项再部署。"
  exit 1
fi
echo
echo "✅ doctor 检查通过"
