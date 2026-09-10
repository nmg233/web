# 物理仿真运行时（`simulation/`）

本目录是 PBL 科创平台的物理仿真源码根，**自包含**：不依赖工作区之外的任何路径、也不依赖本仓库之外的任何文件即可跑通全部功能（前提是按下方说明放入 novaPhy 交付包）。

当前已落地板块：**飞机（滑翔机）**。规划中：火箭、月球车（见《物理引擎改进方案》）。

---

## 1. 目录结构

```
simulation/
├─ README.md                              本文件
├─ wsl_setup.sh                           在 WSL Ubuntu 24.04 里一键装好 novaPhy 运行环境
├─ docker/
│  ├─ Dockerfile                          Ubuntu 24.04 + CPython 3.11 + novaPhy CPU wheel 可复现镜像
│  └─ run_glider_docker.bat               一键构建镜像并在容器里跑一次试飞
│
├─ novaphy-0.4.0-cpu-cp311-linux-x86_64/  ⚠️ 需自行放入，见第 2 节（已 gitignore）
│
└─ glider/                                滑翔机气动仿真源码（唯一仿真源码根）
   ├─ aircraft.py          几何 / 质量 / 气动面参数 + 渲染部件
   ├─ aero.py              6DOF 气动模型（面元法、失速/诱导阻力/下洗）——与引擎无关
   ├─ spatial.py           刚体数学（xyzw 四元数 / 旋转 / 积分器）
   ├─ sim_core.py          控制器 + 飞行循环 + 遥测
   ├─ backend_novaphy.py   novaPhy 刚体求解后端（权威）
   ├─ backend_reference.py 纯 numpy 6DOF 参考后端（对拍影子 / 无 novaPhy 时兜底）
   ├─ sim_service.py       headless 服务入口（平台后端 spawn 的就是它）
   ├─ render.py            3D 体视渲染（PNG / GIF / MP4）
   ├─ plot_flight.py       2D 遥测曲线 + 3D 航迹图
   ├─ requirements.txt     reference 后端所需的 Python 依赖
   └─ output/              运行产物（已 gitignore）
```

**双后端设计**：`novaPhy` 只负责"刚体动力学积分"这一段，气动力由 `aero.py` / `sim_core.py`
计算后注入。两个后端走完全相同的气动与控制器代码，因此行为可比、可对拍。

---

## 2. ⚠️ 必须自行放入 novaPhy 交付包

**本仓库不包含 novaPhy。** 它是第三方交付的二进制包（约 160 MB），体积大且不适合进版本库，
`web/.gitignore` 已将其排除。首次使用前请把**交付包目录连同目录名原样**放到本目录下：

```
simulation/
└─ novaphy-0.4.0-cpu-cp311-linux-x86_64/
   ├─ novaphy-0.4.0-cp311-cp311-linux_x86_64.whl   ← 必需，唯一被安装的文件
   ├─ BUILD_INFO.json
   ├─ API_REFERENCE.md
   ├─ README.md
   ├─ LICENSE
   ├─ MANIFEST.txt
   ├─ SHA256SUMS
   ├─ scripts/
   └─ THIRD_PARTY_NOTICES/
```

> **目录名必须保持为 `novaphy-0.4.0-cpu-cp311-linux-x86_64`**，因为 `wsl_setup.sh` 与
> `docker/Dockerfile` 都按这个路径查找 wheel。若你把它放在别处，可用 `WHEEL` 环境变量
> 指定 wheel 的实际路径（见 `wsl_setup.sh` 头部注释）。

### 平台要求（wheel 标签 `cp311-cp311-linux_x86_64`，**非 manylinux**）

| 项 | 要求 | 说明 |
|---|---|---|
| 操作系统 | **Linux x86_64** | Windows / macOS 一律装不上，必须走 WSL 或 Docker |
| Python | **3.11**（cp311） | 3.12 / 3.13 不可用 |
| glibc | **≥ 2.38** | Ubuntu 24.04 (2.39) / Debian 13 满足 |

可选校验交付包完整性：

```bash
cd simulation/novaphy-0.4.0-cpu-cp311-linux-x86_64 && sha256sum -c SHA256SUMS
```

---

## 3. 三种运行方式

### 方式 A：Linux 原生 novaPhy（WSL 或 Ubuntu/Debian 服务器，推荐）

**前置**：Ubuntu **24.04+**（glibc ≥ 2.38；22.04 是 2.35，装不了），且第 2 步的交付包已就位。

```bash
# --- 在 Windows 上（经 WSL）---
wsl -l -v            # 先确认发行版名字，下文以 Ubuntu-24.04 为例
wsl -d Ubuntu-24.04 -u root -- bash /mnt/<盘符>/<...>/web/simulation/wsl_setup.sh

# --- 或在 Ubuntu/Debian 服务器上（原生）---
cd <项目根目录>
sudo bash simulation/wsl_setup.sh
```

脚本装到 `/opt/novaphy`，最后一行打印 `ALL_DONE`。

```ini
# backend/.env（服务器则写入 /etc/pbl-platform/backend.env）
GLIDER_PYTHON=wsl:Ubuntu-24.04:/opt/novaphy/bin/python   # WSL：带 wsl:<发行版>: 前缀
# GLIDER_PYTHON=/opt/novaphy/bin/python                  # 服务器：直接写绝对路径
GLIDER_BACKEND=auto
```

平台后端通过 `wsl.exe` 调用 WSL 内的解释器；Node 用 Windows 路径、Python 用 `/mnt/d`
路径读写同一块盘，天然互通。**这是 Windows 上唯一能跑真 novaPhy 的方式。**

> RHEL / Alibaba Cloud Linux 系服务器没有 `apt`，上述脚本不适用，请手工装：
>
> ```bash
> sudo dnf install -y python3.11 python3.11-devel gcc gcc-c++ make
> sudo python3.11 -m venv /opt/novaphy
> sudo /opt/novaphy/bin/pip install numpy matplotlib Pillow imageio imageio-ffmpeg
> sudo /opt/novaphy/bin/pip install simulation/novaphy-0.4.0-cpu-cp311-linux-x86_64/*.whl
> /opt/novaphy/bin/python -c "import novaphy; print('novaPhy OK')"
> ```

### 方式 B：Docker（跨平台 / 服务器）

> 需先完成第 2 步：`Dockerfile` 会从构建上下文 `COPY novaphy-0.4.0-cpu-cp311-linux-x86_64/…whl`，
> 交付包不在 `simulation/` 下时构建会**直接失败**。

```bat
cd simulation
docker\run_glider_docker.bat --dihedral 6 --cg 0.1 --speed 36 --video
```

`glider/` 会实时挂载进容器，改代码无需重建镜像；产物写在 `simulation/glider/output/`。

> 注意：该脚本目前用于**手动 / CI 跑通验证**。平台后端 spawn 的是解释器路径而非容器，
> 若要把它接进平台，需要额外做一个把 `sim_service.py` 参数转发进容器的包装脚本。

### 方式 C：无 novaPhy 兜底（纯 numpy 参考后端）

没有 WSL / 不想装 novaPhy 时，功能仍完整可用，只是**动力学积分**由 numpy 参考后端承担：

```bash
pip install -r simulation/glider/requirements.txt
```

```ini
GLIDER_PYTHON=python          # 本机解释器
GLIDER_BACKEND=reference      # 强制走参考后端
```

> ⚠️ 参考后端用于**开发与对拍**，教学/评分场景请用真 novaPhy（`GLIDER_BACKEND=auto` 或 `novaphy`）。

---

## 4. 环境变量

完整清单与注释见 `backend/.env.example` 的「滑翔机物理引擎」一节。

| 变量 | 默认 | 说明 |
|---|---|---|
| `GLIDER_PYTHON` | `python`(Win) / `python3`(Linux) | 解释器。`wsl:<发行版>:<路径>` 前缀表示经 `wsl.exe` 调用 |
| `GLIDER_BACKEND` | `auto` | `auto` / `novaphy` / `reference` |
| `GLIDER_MAX_ACTIVE` | `2` | 同时运行的模拟任务上限 |
| `GLIDER_TIMEOUT` | `100` | 单次最长仿真秒数（同时决定子进程预算） |
| `GLIDER_VIDEO` | `1` | `0` 关闭 MP4 回放生成 |
| `GLIDER_VIDEO_FPS` | `10` | 回放帧率 |
| `GLIDER_VIDEO_MAX` | `300` | 回放覆盖时长上限（秒） |
| `GLIDER_RETENTION_DAYS` | `0` | error 状态结果保留天数；`0` = 不自动清理 |
| `DISK_WARN_PERCENT` | `85` | `scripts/doctor.sh` 磁盘使用率告警阈值 |

---

## 5. 自检与验收

```bash
bash scripts/doctor.sh          # 部署前环境检查（含滑翔机引擎可用性）
```

不启平台也能单独验证引擎是否可用（在 WSL 中执行）：

```bash
/opt/novaphy/bin/python -c "import novaphy; print('novaPhy OK')"
cd /mnt/<盘符>/<...>/web/simulation/glider
/opt/novaphy/bin/python sim_service.py --backend novaphy --dihedral 6 --cg 0.1 \
    --speed 36 --alt 150 --video --outdir output/smoke
# 期望：stdout 打印一行 JSON，其中 "backend":"novaphy"、"reason":"landed"
```

---

## 6. 相关文档

- `glider/README.md` —— 气动模型、参数含义、纯 Python 用法
- 后端接入：`backend/routes/gliders.js`、`backend/controllers/gliderController.js`
- 前端页面：`frontend/src/pages/glider/Simulator.jsx`、`frontend/src/api/glider.js`
