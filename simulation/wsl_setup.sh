#!/usr/bin/env bash
# wsl_setup.sh — 在 WSL Ubuntu 24.04 里准备 novaPhy 运行环境
# 用法(Windows):  wsl -d Ubuntu-24.04 -u root -- bash /mnt/<盘符>/.../simulation/wsl_setup.sh
#
# novaPhy wheel 为第三方交付包，不在本仓库内。请先将其目录放到 simulation/ 下
# （如 simulation/novaphy-0.4.0-cpu-cp311-linux-x86_64/），或用 WHEEL 环境变量
# 指定 wheel 的 WSL 路径（/mnt/... 形式）：
#   wsl -d Ubuntu-24.04 -u root -- env WHEEL=/mnt/c/path/to/novaphy.whl bash .../wsl_setup.sh
set -euxo pipefail
export DEBIAN_FRONTEND=noninteractive
export PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple

echo "== [1/5] apt: python3.11 (deadsnakes) =="
apt-get update -y
apt-get install -y software-properties-common ca-certificates
add-apt-repository -y ppa:deadsnakes/ppa
apt-get update -y
apt-get install -y python3.11 python3.11-venv python3.11-dev build-essential

echo "== [2/5] apt: OpenGL/GLFW 系统库 (WSLg 显示) =="
apt-get install -y libgl1 libgl1-mesa-dri libegl1 libgles2 \
    libglfw3 libglfw3-dev libglvnd0 mesa-utils || true

echo "== [3/5] venv =="
python3.11 -m venv /opt/novaphy
/opt/novaphy/bin/pip install --upgrade pip -q

echo "== [4/5] pip: novaPhy CPU wheel + 运行/查看器依赖 =="
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_WHEEL="$SCRIPT_DIR/novaphy-0.4.0-cpu-cp311-linux-x86_64/novaphy-0.4.0-cp311-cp311-linux_x86_64.whl"
WHEEL="${WHEEL:-$DEFAULT_WHEEL}"
if [ ! -f "$WHEEL" ]; then
  echo "ERROR: 未找到 novaPhy wheel：$WHEEL"
  echo "请将交付包目录放到 simulation/ 下，或用 WHEEL 环境变量指定路径（用法见本脚本头部注释）。"
  exit 1
fi
/opt/novaphy/bin/pip install "$WHEEL" numpy matplotlib Pillow glfw PyOpenGL moderngl imgui imgui_bundle

echo "== [5/5] 校验 =="
/opt/novaphy/bin/python -c "import novaphy; print('novaPhy  import OK')"
/opt/novaphy/bin/python -c "import moderngl, glfw, imgui, OpenGL; print('viewer deps import OK')"
echo "ALL_DONE"
