# NovaPhy 气动滑翔机 3D 仿真（glider_sim）

> 📦 **运行环境（WSL / Docker / 无 novaPhy 兜底）与 novaPhy 交付包的放置方式，见上级
> [`simulation/README.md`](../README.md)。本文件只讲气动模型与纯 Python 用法。**

在 **novaPhy** 物理引擎（`novaphy` wheel 0.4.0，CPU 版）上做一架**符合空气动力学**的
滑翔机 6 自由度仿真。`sim_service.py` 为无界面服务入口，供 **PBL 科创平台**后端调用：
输出 3D 航迹图、遥测曲线图、遥测 CSV、`summary.json` 与**固定机位 MP4 飞行回放**。

> ⚠️ **本机运行限制**：交付的 `novaphy-0.4.0-cp311-cp311-linux_x86_64.whl` 是
> **Linux x86_64 + CPython 3.11 专用**。当前开发机是 Windows + Python 3.13，
> 无法加载该 wheel。因此工程采用 **双后端** 设计：
>
> - `backend_novaphy.py` —— 真正的 novaPhy 物理后端（目标 Linux 环境运行）；
> - `backend_reference.py` —— 纯 numpy 6DOF 参考后端（Windows / 无 novaPhy 时自动使用）。
>
> 两个后端走**完全相同**的气动与控制器代码（`aero.py` / `sim_core.py`），
> 只替换“刚体动力学积分”这一段，因此本机看到的参考后端结果可代表 novaPhy 后端的行为。

---

## 1. 快速开始（headless 服务）

直接用 `sim_service.py`（供 PBL 平台调用，也可命令行独立运行；无 novaPhy 时自动回退纯 numpy 参考后端）：

```bash
python sim_service.py --dihedral 6 --cg 0.1 --speed 36 --alt 150 --outdir output/sim1
# 加 --video 生成固定机位 MP4 飞行回放
python sim_service.py --dihedral 6 --cg 0.1 --speed 36 --video --video-fps 10 --outdir output/sim2
```

输出到 `--outdir`：
- `trajectory3d.png` —— 世界系 3D 航迹
- `flight_telemetry.png` —— 高度 / 空速 / 迎角 / 下沉率 / L/D 随时间变化
- `flight_telemetry.csv` —— 全量遥测
- `summary.json` —— 参数与结果摘要（reason / glide_time / distance 等）
- `flight_replay.mp4` —— 固定机位飞行回放（`--video` 时生成）

常用参数：`--dihedral`、`--cg`、`--speed`、`--alt`、`--timeout`、`--backend`、
`--video/--video-fps/--video-max`。

---

## 2. 在 Linux（x86_64 + Python 3.11）上使用真正的 novaPhy 后端

```bash
# 1) 准备干净虚拟环境
python3.11 -m venv .venv && source .venv/bin/activate
python -m pip install --upgrade pip

# 2) 安装交付的 novaPhy wheel（路径按实际解压位置）
python -m pip install ./novaphy-0.4.0-cp311-cp311-linux_x86_64.whl

# 3) 安装本 demo 的绘图依赖
python -m pip install numpy matplotlib

# 4) 运行（-–backend novaphy 显式指定）
python sim_service.py --dihedral 6 --cg 0.1 --speed 36 --video --backend novaphy --outdir output/sim_novaphy
```

`--backend auto` 会先探测 novaPhy 是否可用，可用则优先用它，否则回退 reference。
本项目 3D / 图表 / 回放全部用跨平台 matplotlib 生成，headless 即可出图（无显示环境也可用）。

---

## 3. 气动模型（`aero.py`）——“符合空气动力学”体现在哪

滑翔机整机为**一个自由刚体**（质心在体原点，显式质量/惯量），气动面：
左右主机翼半面、平尾(+升降舵)、垂尾(+方向舵)、机身阻力。

每个面在气动中心 **AC** 处用“局部来流”计算：

$$
V_{\text{air,AC}} = V_{\text{body}} + \omega \times r_{AC} - V_{\text{wind}}
,\qquad q = \tfrac12 \rho V^2
$$

- **升力**：$L = qS\, C_L(\alpha)\,\hat l$，$\hat l$ 为与来流垂直的升力方向；
- **阻力**：$D = qS\, C_D(\alpha)\,\hat a$，$\hat a$ 为来流方向；
- **升力线斜率**（三维机翼）：$a_0 = \dfrac{2\pi\,AR}{AR+2}$；
- **失速**：线性 $C_L=a_0\alpha$ 至 $\alpha_{stall}$，之后衰减（分离）；
- **诱导阻力**：$C_{D,i}= \dfrac{C_L^2}{\pi e\,AR}$，加上 $C_{D0}$ 与失速平板阻力；
- **下洗**（平尾）：$\varepsilon \approx \dfrac{2 C_{L,w}}{\pi AR}$，修正平尾迎角；
- 迎角/侧滑由机体速度分量给出：$\alpha=\arctan2(-v,u)$，$\beta=\arcsin(w/V)$，
  机体轴：x 前、y 上、z 右翼；世界系 Y 向上（与 novaPhy 一致，四元数 xyzw）。

控制器（`sim_core.py`）：升降舵空速保持、副翼机翼水平/协调坡度、方向舵去侧滑+偏航阻尼，
可执行 直飞 / 持续盘旋 / 蛇形 机动。

默认参数（`aircraft.py`）为一架 ~420 kg、翼展 16 m 的中型滑翔机，仿真结果稳定：
稳态迎角 ≈ 4°、空速恒定、**L/D ≈ 15~21、下沉率 ≈ 1.5~2.0 m/s**，与真实滑翔机同量级。

---

## 4. 目录

```
glider_sim/
├─ aircraft.py         # 滑翔机参数与渲染部件
├─ aero.py             # 6DOF 气动模型（面元法 + 失速/诱导阻力/下洗）
├─ spatial.py          # 6DOF 刚体数学（xyzw 四元数、旋转、参考积分器）
├─ sim_core.py         # 后端无关的飞行循环、控制器、遥测
├─ backend_novaphy.py  # ★ novaPhy 后端（ModelBuilder+SolverSemiImplicit）
├─ backend_reference.py# 纯 numpy 参考后端（本地验证）
├─ render.py           # matplotlib 渲染：固定机位/追逐镜头 + MP4/GIF 帧 + HUD
├─ plot_flight.py      # 高度/空速/迎角/下沉/L-D 图表、3D 航迹图
├─ sim_service.py      # ★ PBL 平台入口：headless 模拟 → 图/CSV/summary/MP4 回放
├─ requirements.txt    # Python 依赖清单（numpy/matplotlib 等）
└─ output/             # 生成结果（png/csv/json/mp4）
```

## 5. 常见问题

- **`--backend novaphy` 报“novaPhy 不可用”**：确认在 Linux x86_64 + CPython 3.11
  环境，且 `pip install` 成功；可先 `python -c "import novaphy"` 自检。
- **HUD/图表里的中文字体方块**：文本用英文避免 DejaVu 无 CJK 字形。
- **想改机型**：改 `aircraft.py` 的质量/惯量/翼面积/AC 位置即可（气动自动适配）。
- **想看交互式 ViewerGL 窗口**：原交互脚本（`glider_interactive.py` 等）已从本仓库移除，
  平台统一使用 headless 的 `sim_service.py`（matplotlib 出图/回放）。