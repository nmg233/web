#!/usr/bin/env bash
# health-check.sh — 四层健康检查（部署后验收）
# 用法：bash scripts/health-check.sh [站点根 URL，默认 http://127.0.0.1]
set -uo pipefail

BASE="${1:-http://127.0.0.1}"
FAIL=0

check() {
  local name="$1" url="$2" expect="$3"
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "$url" 2>/dev/null || echo 000)
  if [ "$code" = "$expect" ] || { [ "$expect" = "2xx" ] && [ "${code:0:1}" = "2" ]; }; then
    echo "  [ok] $name -> $code"
  else
    echo "  [FAIL] $name -> $code（期望 $expect）"
    FAIL=1
  fi
}

echo "== 健康检查：$BASE =="
check "后端直连 /api/health" "http://127.0.0.1:3000/api/health" "2xx"
check "nginx 反代 /api/health" "$BASE/api/health" "2xx"
check "前端首页" "$BASE/" "2xx"
check "SPA 回退 /login" "$BASE/login" "2xx"

if [ "$FAIL" -ne 0 ]; then
  echo "❌ 存在未通过项"
  exit 1
fi
echo "✅ 全部通过"
