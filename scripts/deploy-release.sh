#!/usr/bin/env bash
# 原子切换单一 current 链接，使前后端始终来自同一发行版。仅运行于完成一次性配置的 Linux 主机。
set -euo pipefail
BRANCH="${1:-main}"
APP_DIR="${APP_DIR:-/opt/pbl-platform/repo}"
RELEASE_ROOT="${RELEASE_ROOT:-/opt/pbl-platform/releases}"
CURRENT_LINK="${CURRENT_LINK:-/opt/pbl-platform/current}"
ENV_FILE="${ENV_FILE:-/etc/pbl-platform/backend.env}"
SERVICE="${SERVICE:-pbl-backend}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/health}"
PYTHON="${PYTHON:-/usr/bin/python3.11}"
DATA_ROOT="${DATA_ROOT:-/var/lib/pbl-platform}"
export PYTHON npm_config_python="$PYTHON"
for command in git npm node tar curl sqlite3 flock; do command -v "$command" >/dev/null; done
"$PYTHON" -c 'import sys; assert sys.version_info >= (3, 9)'
git -C "$APP_DIR" check-ref-format --branch "$BRANCH" >/dev/null
APP_DIR=$(cd "$APP_DIR" && pwd -P)
if [ ! -f "$ENV_FILE" ]; then echo "环境文件不存在" >&2; exit 1; fi
case "$RELEASE_ROOT" in /*) ;; *) echo "发行目录必须为绝对路径" >&2; exit 1;; esac
if [ "$RELEASE_ROOT" = / ] || [ "$RELEASE_ROOT" = "$APP_DIR" ]; then echo "发行目录不安全" >&2; exit 1; fi
mkdir -p "$RELEASE_ROOT"
RELEASE_ROOT=$(cd "$RELEASE_ROOT" && pwd -P)
exec 9>"$RELEASE_ROOT/.deploy.lock"
flock -n 9 || { echo "已有部署正在进行" >&2; exit 1; }
if [ ! -L "$CURRENT_LINK" ]; then echo "请先按 docs/部署与恢复.md 配置 current 软链接与 systemd/Nginx" >&2; exit 1; fi
PREVIOUS=$(readlink -f "$CURRENT_LINK")
if [ ! -d "$PREVIOUS/backend" ]; then echo "当前发行版不存在" >&2; exit 1; fi
service_op() {
  if [ "${SYSTEMCTL_SUDO:-1}" = 1 ]; then sudo -n systemctl "$@"; else systemctl "$@"; fi
}
WORKING_DIR=$(service_op show "$SERVICE" --property=WorkingDirectory --value)
if [ "$WORKING_DIR" != "$CURRENT_LINK/backend" ]; then echo "systemd WorkingDirectory 尚未切换为 $CURRENT_LINK/backend" >&2; exit 1; fi
DATA_CONFIG=$(node --env-file="$ENV_FILE" -e 'for(const key of ["DB_PATH","UPLOAD_PATH","FEEDBACK_UPLOAD_PATH"]) { const p=process.env[key]; if(!p || !require("path").isAbsolute(p)) throw Error(key+" 必须为外置绝对路径"); console.log(p); }')
mapfile -t DATA_PATHS <<< "$DATA_CONFIG"
DATA_ROOT=$(cd "$DATA_ROOT" && pwd -P)
if [ "$DATA_ROOT" = / ]; then echo "数据目录不安全" >&2; exit 1; fi
for data in "${DATA_PATHS[@]}"; do
  data=$(readlink -f -- "$data")
  case "$data" in "$DATA_ROOT"/*) ;; *) echo "数据路径须在 $DATA_ROOT 下：$data" >&2; exit 1;; esac
done
if [ ! -f "${DATA_PATHS[0]}" ] || [ ! -d "${DATA_PATHS[1]}" ] || [ ! -d "${DATA_PATHS[2]}" ]; then echo "数据库或上传目录不存在，停止发布" >&2; exit 1; fi
git -C "$APP_DIR" fetch origin "$BRANCH"
SHA=$(git -C "$APP_DIR" rev-parse --verify "origin/$BRANCH^{commit}")
STAGE=$(mktemp -d "$RELEASE_ROOT/.staging.XXXXXX")
git -C "$APP_DIR" archive "$SHA" | tar -x -C "$STAGE"
printf '%s\n' "$SHA" > "$STAGE/.release-sha"
(
  cd "$STAGE/backend"
  npm_config_build_from_source=true npm ci
  # v13 仍可能优先加载包内的预编译文件；旧 glibc 主机必须验证实际加载结果。
  if ! node -e 'const D=require("better-sqlite3");const d=new D(":memory:");d.close()'; then
    NODE_GYP="${NODE_GYP:-$(npm root -g)/npm/node_modules/node-gyp/bin/node-gyp.js}"
    if [ ! -f "$NODE_GYP" ]; then echo "原生模块加载失败且找不到 node-gyp，请显式指定 NODE_GYP" >&2; exit 1; fi
    (
      cd node_modules/better-sqlite3
      node "$NODE_GYP" rebuild --release --force_build=1
      if [ -f prebuilds/linux-x64.node ]; then mv -- prebuilds/linux-x64.node prebuilds/linux-x64.node.incompatible; fi
    )
    node -e 'const D=require("better-sqlite3");const d=new D(":memory:");d.close()'
  fi
)
(cd "$STAGE/frontend" && npm ci && npm run lint && npm test && npm run build)
# 先在一致性数据库副本上执行迁移与完整性检查，不修改正在服务的数据库。
SMOKE_DB="$STAGE/backend/.deployment-smoke.db"
sqlite3 "${DATA_PATHS[0]}" ".backup '$SMOKE_DB'"
(cd "$STAGE/backend" && DB_PATH="$SMOKE_DB" node --env-file="$ENV_FILE" -e 'const d=require("./config/database");if(d.pragma("integrity_check",{simple:true})!=="ok" || d.pragma("foreign_key_check").length) process.exit(1); d.close()')
rm -f -- "$SMOKE_DB" "$SMOKE_DB-wal" "$SMOKE_DB-shm"
RELEASE="$RELEASE_ROOT/$SHA-$(date +%Y%m%d-%H%M%S)"
if [ -e "$RELEASE" ]; then echo "发行目录已存在，未进行切换" >&2; exit 1; fi
mv -- "$STAGE" "$RELEASE"
SWITCHED=0
STOPPED=0
switch_link() {
  local target="$1" link="$CURRENT_LINK.next.$$"
  if [ -e "$link" ] || [ -L "$link" ]; then echo "临时切换链接冲突" >&2; return 1; fi
  ln -s -- "$target" "$link" || return 1
  mv -Tf -- "$link" "$CURRENT_LINK" || return 1
}
rollback() {
  local status="${1:-1}"
  trap - ERR INT TERM
  local restored=1
  if [ "$SWITCHED" = 1 ]; then switch_link "$PREVIOUS" || restored=0; fi
  if [ "$restored" = 0 ]; then echo "旧链接恢复失败，保留停服状态，需人工处理" >&2;
  elif [ "$STOPPED" = 1 ]; then service_op restart "$SERVICE" || echo "回滚版本重启失败，需人工处理" >&2; fi
  echo "发布失败，旧版本链接已保留/恢复。未自动恢复数据库，以免覆盖用户新写入；检查 $RELEASE 与备份。" >&2
  exit "$status"
}
trap 'rollback $?' ERR
trap 'rollback 130' INT
trap 'rollback 143' TERM
STOPPED=1
service_op stop "$SERVICE"
(cd "$RELEASE" && ENV_FILE="$ENV_FILE" bash scripts/backup-db.sh && ENV_FILE="$ENV_FILE" bash scripts/backup-uploads.sh)
SWITCHED=1
switch_link "$RELEASE" || rollback 1
service_op start "$SERVICE"
HEALTHY=0
for ((attempt=0; attempt<30; attempt++)); do
  if body=$(curl --max-time 3 -fsS "$HEALTH_URL"); then
    if EXPECTED_SHA="$SHA" node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{try{const h=JSON.parse(s);if(h.status!=="ok" || h.database!=="ready" || h.release!==process.env.EXPECTED_SHA || h.schema_version<19)process.exit(1)}catch{process.exit(1)}})' <<< "$body"; then HEALTHY=1; break; fi
  fi
  sleep 1
done
if [ "$HEALTHY" != 1 ]; then echo "健康检查失败，开始回滚链接" >&2; false; fi
trap - ERR INT TERM
STOPPED=0
echo "发布成功：$SHA；前一版本：$PREVIOUS"
if ! node "$RELEASE/scripts/cleanup-files.js" "${DATA_PATHS[1]}"; then echo "警告：清理队列需检查" >&2; fi
echo "数据库及两类附件仍保留在 /var/lib/pbl-platform，发行目录不会自动清理。"
