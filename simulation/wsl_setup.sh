#!/usr/bin/env bash
# wsl_setup.sh — 准备 novaPhy 运行环境（WSL 与 Ubuntu/Debian 服务器通用）
# 要求：Ubuntu 24.04+（glibc >= 2.38）+ root
#
# 用法：
#   Windows(WSL)：wsl -l -v      # 先确认发行版名字
#                 wsl -d Ubuntu-24.04 -u root -- bash /mnt/<盘符>/.../simulation/wsl_setup.sh
#   Linux 服务器： sudo bash simulation/wsl_setup.sh
#   RHEL/Alibaba Cloud Linux 无 apt，请用 dnf 手工装（见 simulation/README.md 方式 A）
#
# novaPhy wheel 为第三方交付包，不在本仓库内。请先将其目录放到 simulation/ 下
# （simulation/novaphy-0.4.0-cpu-cp311-linux-x86_64/，详见 simulation/README.md）。
# 默认布局下 wheel 路径由本脚本所在目录自动推导，无需传参；放在别处时用 WHEEL 指定
# （WSL 的 /mnt/... 形式）：
#   wsl -d Ubuntu-24.04 -u root -- env WHEEL=/mnt/c/path/to/novaphy.whl bash .../wsl_setup.sh
set -euxo pipefail
export DEBIAN_FRONTEND=noninteractive
export PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple

echo "== [0/6] 预检：包管理器 / root / glibc =="
if ! command -v apt-get >/dev/null 2>&1; then
  echo "ERROR: 本脚本仅支持 Ubuntu/Debian 系（需要 apt-get）。"
  echo "       RHEL / Alibaba Cloud Linux 请用 dnf 手工装 python3.11，见 simulation/README.md 方式 A。"
  exit 1
fi
if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: 需要 root 权限。WSL 下用 'wsl -d <发行版> -u root -- bash ...'，服务器用 sudo。"
  exit 1
fi
GLIBC_VER="$(ldd --version 2>/dev/null | head -1 | grep -oE '[0-9]+\.[0-9]+$' || true)"
GLIBC_MAJ="${GLIBC_VER%%.*}"
GLIBC_MIN="${GLIBC_VER##*.}"
if [ -z "$GLIBC_VER" ] || [ "${GLIBC_MAJ:-0}" -lt 2 ] \
   || { [ "${GLIBC_MAJ:-0}" -eq 2 ] && [ "${GLIBC_MIN:-0}" -lt 38 ]; }; then
  echo "ERROR: 需要 glibc >= 2.38（检测到 ${GLIBC_VER:-未知}）。"
  echo "       Ubuntu 24.04 = 2.39 满足；Ubuntu 22.04 = 2.35 不满足，请升级发行版或改用 Docker。"
  exit 1
fi
echo "  glibc = $GLIBC_VER  OK"

echo "== [1/6] apt: python3.11 (deadsnakes) =="
apt-get update -y
apt-get install -y software-properties-common ca-certificates
add-apt-repository -y ppa:deadsnakes/ppa
apt-get update -y
apt-get install -y python3.11 python3.11-venv python3.11-dev build-essential

echo "== [2/6] apt: OpenGL/GLFW 系统库 (WSLg 显示) =="
apt-get install -y libgl1 libgl1-mesa-dri libegl1 libgles2 \
    libglfw3 libglfw3-dev libglvnd0 mesa-utils || true

echo "== [3/6] venv =="
python3.11 -m venv /opt/novaphy
/opt/novaphy/bin/pip install --upgrade pip -q

echo "== [4/6] pip: novaPhy CPU wheel + 运行依赖 =="
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_WHEEL="$SCRIPT_DIR/novaphy-0.4.0-cpu-cp311-linux-x86_64/novaphy-0.4.0-cp311-cp311-linux_x86_64.whl"
WHEEL="${WHEEL:-$DEFAULT_WHEEL}"
if [ ! -f "$WHEEL" ]; then
  echo "ERROR: 未找到 novaPhy wheel：$WHEEL"
  echo "请将交付包目录放到 simulation/ 下，或用 WHEEL 环境变量指定路径（用法见本脚本头部注释）。"
  exit 1
fi
# 必需：novaPhy + headless 出图/出视频依赖（失败即中断）
/opt/novaphy/bin/pip install "$WHEEL" numpy matplotlib Pillow imageio imageio-ffmpeg

# 可选：本机可视化查看器（WSLg 显示用；平台 headless 运行不需要，失败不中断）
/opt/novaphy/bin/pip install glfw PyOpenGL moderngl imgui imgui_bundle \
  || echo "WARN: viewer 依赖安装失败，headless 运行不受影响"

echo "== [5/6] 校验 =="
/opt/novaphy/bin/python -c "import novaphy; print('novaPhy    import OK')"
/opt/novaphy/bin/python -c "import numpy, matplotlib; print('headless   import OK')"
/opt/novaphy/bin/python -c "import imageio, imageio_ffmpeg; print('MP4 回放   import OK')"
/opt/novaphy/bin/python -c "import moderngl, glfw, imgui, OpenGL; print('viewer     import OK')" \
  || echo "WARN: viewer 依赖不可用（headless 运行不受影响）"
echo "ALL_DONE"
