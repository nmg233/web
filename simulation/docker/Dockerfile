# novaPhy 滑翔机运行镜像
# 基础：Ubuntu 24.04 (glibc 2.39，满足 novaPhy CPU wheel 的 GLIBC_2.38 要求)
# Python：deadsnakes PPA 安装 CPython 3.11（wheel 为 cp311-cp311）
# 构建上下文：simulation 根目录（内含 wheel 交付包与 glider/）

FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive \
    PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple

# 1) 基础工具 + Python 3.11
RUN apt-get update \
 && apt-get install -y --no-install-recommends software-properties-common ca-certificates \
 && add-apt-repository -y ppa:deadsnakes/ppa \
 && apt-get update \
 && apt-get install -y --no-install-recommends python3.11 python3.11-venv python3.11-dev \
 && rm -rf /var/lib/apt/lists/*

# 2) 虚拟环境
RUN python3.11 -m venv /opt/venv
ENV PATH=/opt/venv/bin:$PATH

# 3) novaPhy CPU wheel + 绘图/数值依赖（numpy/matplotlib 走清华 PyPI 源）
COPY novaphy-0.4.0-cpu-cp311-linux-x86_64/novaphy-0.4.0-cp311-cp311-linux_x86_64.whl /tmp/
RUN python -m pip install --upgrade pip \
 && python -m pip install /tmp/novaphy-0.4.0-cp311-cp311-linux_x86_64.whl numpy matplotlib Pillow imageio imageio-ffmpeg \
 && rm -f /tmp/novaphy-*.whl

# 4) 工程代码
WORKDIR /glider_sim
COPY glider /glider_sim

# 5) 默认：novaPhy 后端 headless 试飞 + 固定机位 MP4 回放（结果写 /glider_sim/output）
CMD ["python", "sim_service.py", "--dihedral", "6", "--cg", "0.1", "--speed", "36", "--video", "--backend", "novaphy"]
