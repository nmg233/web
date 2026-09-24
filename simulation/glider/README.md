# NovaPhy 气动滑翔机 3D 仿真（glider\_sim）

> 📦 **运行环境（WSL / Docker / 无 novaPhy 兜底）与 novaPhy 交付包的放置方式，见上级
> [`simulation/README.md`](../README.md)。本文件只讲气动模型与纯 Python 用法。**

在 **novaPhy** 物理引擎（`novaphy` wheel 0.4.0，CPU 版）上做一架**符合空气动力学**的
滑翔机 6 自由度仿真。`sim_service.py` 为无界面服务入口，供 **PBL 科创平台**后端调用：
输出 3D 航迹图、遥测曲线图、遥测 CSV、`summary.json` 与**固定机位 MP4 飞行回放**
（默认 matplotlib 渲染；`--renderer gl` 可切换 **GLB 模型 + OpenGL 延迟渲染**，见第 5 节）。

> ⚠️ **本机运行限制**：交付的 `novaphy-0.4.0-cp311-cp311-linux_x86_64.whl` 是
> **Linux x86\_64 + CPython 3.11 专用**。当前开发机是 Windows + Python 3.13，
> 无法加载该 wheel。因此工程采用 **双后端** 设计：
>
> * `backend_novaphy.py` —— 真正的 novaPhy 物理后端（目标 Linux 环境运行）；
>
> * `backend_reference.py` —— 纯 numpy 6DOF 参考后端（Windows / 无 novaPhy 时自动使用）。
>
> 两个后端走**完全相同**的气动与控制器代码（`aero.py` / `sim_core.py`），
> 只替换“刚体动力学积分”这一段，因此本机看到的参考后端结果可代表 novaPhy 后端的行为。

***

## 1. 快速开始（headless 服务）

直接用 `sim_service.py`（供 PBL 平台调用，也可命令行独立运行；无 novaPhy 时自动回退纯 numpy 参考后端）：

```bash
python sim_service.py --dihedral 6 --cg 0.1 --speed 36 --alt 150 --outdir output/sim1
# 加 --video 生成固定机位 MP4 飞行回放
python sim_service.py --dihedral 6 --cg 0.1 --speed 36 --video --video-fps 10 --outdir output/sim2
```

输出到 `--outdir`：

* `trajectory3d.png` —— 世界系 3D 航迹（竖直轴 = 高度、地面在下方；长航程时竖直方向按显示比例拉伸并在图内注明）

* `flight_telemetry.png` —— 高度 / 空速 / 迎角 / 下沉率 / L/D 随时间变化

* `flight_telemetry.csv` —— 全量遥测

* `summary.json` —— 参数与结果摘要（reason / glide\_time / distance 等）

* `flight_replay.mp4` —— 固定机位飞行回放（`--video` 时生成）

常用参数：`--dihedral`、`--cg`、`--speed`、`--alt`、`--timeout`、`--backend`、
`--video/--video-fps/--video-max`；渲染途径 `--renderer mpl|gl`（GL 参数表见第 5 节）。

***

## 2. 在 Linux（x86\_64 + Python 3.11）上使用真正的 novaPhy 后端

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

***

## 3. 气动模型（`aero.py`）——“符合空气动力学”体现在哪

滑翔机整机为**一个自由刚体**（质心在体原点，显式质量/惯量），气动面：
左右主机翼半面、平尾(+升降舵)、垂尾(+方向舵)、机身阻力。

每个面在气动中心 **AC** 处用“局部来流”计算：

$$
V\_{\text{air,AC}} = V\_{\text{body}} + \omega \times r\_{AC} - V\_{\text{wind}}
,\qquad q = \tfrac12 \rho V^2
$$

* **升力**：$L = qS, C\_L(\alpha),\hat l$，$\hat l$ 为与来流垂直的升力方向；

* **阻力**：$D = qS, C\_D(\alpha),\hat a$，$\hat a$ 为来流方向；

* **升力线斜率**（三维机翼）：$a\_0 = \dfrac{2\pi,AR}{AR+2}$；

* **失速**：线性 $C\_L=a\_0\alpha$ 至 $\alpha\_{stall}$，之后衰减（分离）；

* **诱导阻力**：$C\_{D,i}= \dfrac{C\_L^2}{\pi e,AR}$，加上 $C\_{D0}$ 与失速平板阻力；

* **下洗**（平尾）：$\varepsilon \approx \dfrac{2 C\_{L,w}}{\pi AR}$，修正平尾迎角；

* 迎角/侧滑由机体速度分量给出：$\alpha=\arctan2(-v,u)$，$\beta=\arcsin(w/V)$，
  机体轴：x 前、y 上、z 右翼；世界系 Y 向上（与 novaPhy 一致，四元数 xyzw）。

控制器（`sim_core.py`）：升降舵空速保持、副翼机翼水平/协调坡度、方向舵去侧滑+偏航阻尼，
可执行 直飞 / 持续盘旋 / 蛇形 机动。

默认参数（`aircraft.py`）为一架 ~~420 kg、翼展 16 m 的中型滑翔机，仿真结果稳定：
稳态迎角 ≈ 4°、空速恒定、\*\*L/D ≈ 15~~21、下沉率 ≈ 1.5\~2.0 m/s\*\*，与真实滑翔机同量级。

***

## 4. 目录

```
glider_sim/
├─ aircraft.py         # 滑翔机参数与渲染部件
├─ aero.py             # 6DOF 气动模型（面元法 + 失速/诱导阻力/下洗）
├─ spatial.py          # 6DOF 刚体数学（xyzw 四元数、旋转、参考积分器）
├─ sim_core.py         # 后端无关的飞行循环、控制器、遥测
├─ backend_novaphy.py  # ★ novaPhy 后端（ModelBuilder+SolverSemiImplicit）
├─ backend_reference.py# 纯 numpy 参考后端（本地验证）
├─ render.py           # matplotlib 渲染（默认）：固定机位/追逐镜头 + MP4 帧 + HUD
├─ gldeferred.py       # ★ OpenGL 延迟渲染（--renderer gl）：GLB 模型 + G-buffer + FrameSink
├─ gl_math.py          # 渲染数学薄适配层（内部全用 pyGLM，不手写线性代数）
├─ gl_mesh.py          # GLB/OBJ 网格加载：节点变换烘焙、颜色、归一化、轴转换
├─ glshaders/          # 延迟管线着色器（gbuffer / lighting / flat / blit）
├─ assets/airplane.glb # 默认 GLB 模型（缺失时自动回退程序化盒体）
├─ plot_flight.py      # 高度/空速/迎角/下沉/L-D 图表、3D 航迹图
├─ sim_service.py      # ★ PBL 平台入口：headless 模拟 → 图/CSV/summary/MP4 回放
├─ requirements.txt    # Python 依赖清单（numpy/matplotlib 等）
└─ output/             # 生成结果（png/csv/json/mp4）
```

## 5. OpenGL 延迟渲染途径（`--renderer gl`）

除默认 matplotlib 渲染外，另有基于 **OpenGL 延迟渲染** 的回放途径：加载 **GLB 模型**
（默认 `assets/airplane.glb`），几何 pass 写 G-buffer（位置/法线/反照率 MRT），
光照 pass 全屏三角形着色（太阳 + 半球环境光 + Blinn 高光 + 雾 + 程序化地面网格 + 天空渐变），
overlay pass 画拖尾丝带与起/终点标记。

**帧缓冲与呈现解耦**：渲染结果始终进离屏 FBO，由 `FrameSink` 协议负责呈现——
`VideoSink`（MP4）/ `PngSink`（单帧 PNG）/ `WindowSink`（`--gl-live` 原生 glfw 实时窗口），
未来新增呈现方式（流媒体等）只需新写 Sink，管线零改动。

### 快速开始

```bash
# 姿态链路自检（纯数学，不跑仿真、不建 GL 上下文；退出码非 0 = 姿态有误）
python sim_service.py --gl-pose-check

# GL 渲染 MP4 回放（GL 依赖/上下文不可用时自动回退 mpl 并在 stderr 告警）
python sim_service.py --dihedral 6 --cg 0.1 --speed 28 --renderer gl --video --outdir output/sim_gl

# 单帧 PNG 预览（最快迭代环；t 秒可选，缺省 0）
python sim_service.py --speed 28 --gl-preview 8 --outdir output/sim_prev

# 用规范静态姿态目检（level / pitch20 / bank30 / yaw90）
python sim_service.py --speed 28 --gl-preview --gl-pose-set bank30 --gl-camera chase

# 实时调试窗口（chase 机位默认，ESC / 关窗退出）
python sim_service.py --speed 28 --timeout 20 --gl-live
```

### GL 参数表（`sim_service.py`）

| 参数                                           | 默认                    | 说明                                                         |
| -------------------------------------------- | --------------------- | ---------------------------------------------------------- |
| `--renderer {mpl,gl}`                        | mpl                   | 渲染途径；优先级 **arg > 环境变量** **`GLIDER_RENDERER`** **> 默认 mpl** |
| `--gl-model PATH`                            | airplane.glb          | GLB/OBJ 模型；默认模型缺失/失败自动回退程序化盒体；**显式指定失败直接报错**（不静默换模型）       |
| `--gl-model-fwd {+x,-x,+y,-y,+z,-z}`         | -x                    | 模型机头轴（airplane.glb 实测：垂尾在 +x 端、机头在 -x）                     |
| `--gl-model-up {+x,-x,+y,-y,+z,-z}`          | +y                    | 模型上轴                                                       |
| `--gl-model-rot YAW,PITCH,ROLL`              | 0,0,0                 | 模型姿态微调（度，叠加在轴转换之后）                                         |
| `--gl-model-scale F\|0`                      | 0                     | 模型缩放；0 = auto（最长包围盒边归一到机身长度）                               |
| `--gl-model-center {bbox,origin}`            | bbox                  | 居中方式：bbox 减包围盒中心（模型原点=COM），origin 保留原点                     |
| `--gl-camera {fixed,chase,chase2}`           | fixed                 | 机位：fixed 走廊全景（1280×720）/ chase 后上方跟随（1024×576）/ chase2 低空平视跟随（视线近水平平行于地面，1024×576） |
| `--gl-size WxH`                              | 按机位                   | 渲染分辨率覆盖                                                    |
| `--gl-vert K`                                | fixed 3.0 / chase 1.0 | 场景竖直增强系数；**只作用于视图矩阵，模型姿态保持物理正确**                           |
| `--gl-trail-state {alt,none}`                | alt                   | 拖尾着色：alt = 高空暖橙 → 低空亮绿渐变，none = 恒定蓝                         |
| `--gl-trail-width PX`                        | 4                     | 拖尾屏幕像素宽度；0 = 关闭拖尾                                          |
| `--gl-skybox / --no-gl-skybox`               | 开                     | 使用等距柱状环境贴图（assets/skyview.jpg）作为天空；关闭退回渐变天空                       |
| `--gl-hud / --no-gl-hud`                     | 开                     | 回放叠加飞行数据 HUD                                               |
| `--gl-preview [T]`                           | -                     | 仿真后输出 t=T 秒单帧 PNG 到 `<outdir>/gl_preview.png`              |
| `--gl-pose-set {level,pitch20,bank30,yaw90}` | -                     | 配合 `--gl-preview`：用规范静态姿态替代该时刻真实姿态                         |
| `--gl-live`                                  | -                     | 仿真后在原生 glfw 窗口实时播放（默认 chase 机位）                            |
| `--gl-pose-check`                            | -                     | 姿态链路端到端自检后退出（详见下节）                                         |

### GLB 模型约定与姿态处理

模型从文件到画面经过四步，全部在 `gl_mesh.py` 的 `fit_parts` 中**烘焙进顶点**；
之后的模型矩阵 `T(pos)·R(quat)·S(scale)` 是纯物理量，不含任何隐藏旋转：

1. **轴转换 R\_conv**（`--gl-model-fwd/--gl-model-up`）：把"模型自身的前/上"对齐到
   机体 x 前 / y 上（右手系，`model_fwd×model_up → body +z`），解决不同建模软件
   朝向不一的问题；
2. **微调**（`--gl-model-rot`）：轴对齐后的小角度修正（度）；
3. **联合归一化**（`--gl-model-scale/--gl-model-center`）：多部件整体包围盒居中、
   最长边缩放到 `aircraft.Glider.length` 量级（多部件一起变换，防止散架）；
4. **逐帧姿态**：物理仿真输出的四元数 `tele["quat"]`（xyzw）经 pyGLM `mat4_cast`
   生成旋转；法线用 `mat3(u_model)` 变换后归一化。

**`--gl-pose-check`** **姿态保险栓**：对 level / pitch20° / bank30° / yaw90° 四个规范姿态
× 三轴（机头/上/右翼），断言渲染链
`T(pos)·R_glm(quat)·S(k)·(R_total @ model_axis)` 与物理链
`pos + k·quat_rotate(quat, R_total @ model_axis)` 逐项一致（float64，容差 1e-9；
`quat_rotate` 与物理积分同源）。任何轴约定漂移都会在此暴露，退出码非 0。

### 回退行为

* `--renderer gl` 但 **依赖缺失 / GL 上下文创建失败** → stderr 告警 + 回退 mpl 出片；

* **默认模型** `airplane.glb` 缺失/损坏 → stderr 告警 + 程序化盒体（尺寸与机身一致）；

* **显式** **`--gl-model`** 加载失败 → 直接报错（不静默换模型，姿态问题要显式暴露）；

* 不装 GL 依赖（moderngl/trimesh/pyglm）时默认 mpl 路径完全不受影响。

***

## 6. 常见问题

* **`--backend novaphy`** **报“novaPhy 不可用”**：确认在 Linux x86\_64 + CPython 3.11
  环境，且 `pip install` 成功；可先 `python -c "import novaphy"` 自检。

* **HUD/图表里的中文字体方块**：文本用英文避免 DejaVu 无 CJK 字形。

* **想改机型**：改 `aircraft.py` 的质量/惯量/翼面积/AC 位置即可（气动自动适配）。

* **想看交互式 ViewerGL 窗口**：原交互脚本（`glider_interactive.py` 等）已从本仓库移除，
  平台统一使用 headless 的 `sim_service.py`（matplotlib 出图/回放）。

