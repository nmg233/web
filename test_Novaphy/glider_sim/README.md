# NovaPhy 气动滑翔机 3D 仿真（glider_sim）

在 **novaPhy** 物理引擎（`novaphy` wheel 0.4.0，CPU 版）上做一架**符合空气动力学**的
滑翔机 6 自由度仿真，并输出 **3D 展示**（追逐相机 GIF + PNG 图表 + 交互数据）。

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

## 1. 快速开始（Windows / 无 novaPhy）

```bash
cd glider_sim
python run_glider.py --maneuver circuit --seconds 60     # 自动用 reference 后端
python run_glider.py --maneuver straight --seconds 40
python run_glider.py --maneuver sine    --seconds 60
```

输出到 `glider_sim/output/`：
- `glider_flight.gif` —— 3D 追逐镜头动画（滑翔机盒体模型 + 航迹 + HUD）
- `trajectory3d.png` —— 世界系 3D 航迹（盘旋/蛇形一目了然）
- `flight_telemetry.png` —— 高度 / 空速 / 迎角 / 下沉率 / L/D 随时间变化
- `flight_telemetry.csv` —— 全量遥测（t、位置、姿态四元数、速度、CL/CD、舵面…）
- `summary.json` —— 参数与结果摘要

常用参数：`--seconds`、`--maneuver {straight|circuit|sine}`、`--bank-deg`、
`--alt`、`--V-ref`、`--gif-start/--gif-end/--gif-fps`、`--no-gif/--no-plot/--no-csv`。

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
python run_glider.py --backend novaphy --maneuver circuit --seconds 60
```

`--backend auto` 会先探测 novaPhy 是否可用，可用则优先用它，否则回退 reference。
若希望“交互式 3D 窗口”，可在 Linux 有显示的环境里把
`output/glider_flight.gif` 用图片查看器打开，或自行接入 novaPhy 自带 ViewerGL
（本项目 3D 展示使用跨平台的 matplotlib，保证 headless 也可出图）。

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
├─ render.py           # matplotlib 3D 追逐镜头 + GIF/帧 + HUD
├─ plot_flight.py      # 高度/空速/迎角/下沉/L-D 图表、3D 航迹图
├─ run_glider.py       # 命令行入口（出 GIF/图/CSV）
├─ glider_interactive.py  # ★ 交互教学：设高度/速度/重心/上反角，ViewerGL 实时动画+滑翔时长
├─ fix_wsl_gl.py       # WSL 下 ViewerGL/ImGui OpenGL 上下文修复（随附）
└─ output/             # 生成结果（gif/png/csv/json）
```

## 5. 常见问题

- **`--backend novaphy` 报“novaPhy 不可用”**：确认在 Linux x86_64 + CPython 3.11
  环境，且 `pip install` 成功；可先 `python -c "import novaphy"` 自检。
- **GIF 里的中文字体方块**：HUD 用英文避免 DejaVu 无 CJK 字形。
- **想改机型**：改 `aircraft.py` 的质量/惯量/翼面积/AC 位置即可（气动自动适配）。

---

## 6. 交互式滑翔教学（`glider_interactive.py`，ViewerGL 实时动画）

学 `study` 项目 `drone_mountain.py` 的交互风格：设置参数 → 弹窗实时观察滑翔 →
触地自动给出**滑翔时长**；按 `R` 重新投放，`Space` 暂停，`H` 面板，关窗退出。

可设置：起飞高度、初始速度、**重心**、**机翼上反角**。

| 参数 | 含义 | 物理效果 |
|---|---|---|
| `--alt` | 起飞高度 (m) | 越高滑翔越久 |
| `--speed` | 初始投放速度 (m/s) | 需高于失速(~20)，影响初始爬升/配平 |
| `--cg` | 重心沿机体前移量 (m) | `>0` 靠前→更稳但俯冲略快/时长↓；`<0` 靠后→接近失稳 |
| `--dihedral` | 机翼上反角 (°) | `>0` 增强横向静稳定（配合 `--no-autolevel` 对比最明显） |
| `--no-autolevel` | 关闭副翼自动回中 | 关闭后机翼水平完全交给被动气动（上反角作用凸显） |

在 WSL（已配 `/opt/novaphy`）里运行（注意用 `\` 换行粘贴多行示例）：

```bash
cd /mnt/d/html-source/PBLproject/jointproject/test_Novaphy/glider_sim
/opt/novaphy/bin/python glider_interactive.py --alt 100 --dihedral 3
# 对比重心：后移(易失控) vs 前移(快而稳)
/opt/novaphy/bin/python glider_interactive.py --alt 100 --cg -0.30
/opt/novaphy/bin/python glider_interactive.py --alt 100 --cg  0.30
# 对比上反角（关自动回平，看谁飞得稳）：0° vs 10°
/opt/novaphy/bin/python glider_interactive.py --alt 100 --dihedral 0 --no-autolevel
/opt/novaphy/bin/python glider_interactive.py --alt 100 --dihedral 10 --no-autolevel
```

无窗口快速试参（Windows 也能用 reference 后端）：

```bash
python glider_interactive.py --headless --alt 100 --cg -0.30
```

实测滑翔时长（alt=100，vref=31）：默认 50.4 s；`--cg 0.30`→44.8 s；`--cg -0.30`→56.5 s。
上反角在无自动回平时把初始横滚扰动压回（0° 时 bank 漂到 ~22°，10° 时 ~8°）。
