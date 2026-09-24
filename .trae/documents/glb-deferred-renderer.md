# GLB 模型 + 延迟渲染渲染途径实施计划

## 1. 概要

为 `simulation/glider` 新增基于 moderngl 的**延迟渲染（deferred shading）途径**：

* 读取 **GLB 模型**渲染滑翔机（默认 `assets/airplane.glb`，缺失回退程序化盒体）

* **姿态严格对齐物理**：模型矩阵 = `T(pos)·R(quat)·R_conv·S`，与 mpl 路径 `R@v+pos` 同一约定，并提供姿态自检工具

* **G-buffer 多渲染目标 → 光照 pass → overlay pass** 三段式延迟管线

* **帧缓冲与呈现解耦**：`FrameSink` 接口，本次提供 VideoSink（MP4）/ PngSink（单帧预览）/ WindowSink（--gl-live 原生 glfw 实时窗口），未来可插流媒体等

* 不重复造轮子：矩阵/网格/相机/HUD/上下文创建等工具层从 git 历史 `613ba71` 恢复复用；GLB 解析交给 trimesh；视频编码交给 imageio-ffmpeg

* 默认仍为 matplotlib 渲染，`--renderer gl` 或 `GLIDER_RENDERER=gl` 启用，GL 不可用自动回退

* 后端 `gliderController.js` 一起接上 `GLIDER_RENDERER` 透传

## 2. 现状分析

### 2.1 git 状态（已探明）

* 提交 `613ba71`（本地 main 领先 origin/main 1 个，未推送）包含上一会话的**前向渲染** GL 途径：`gl_math.py`、`gl_mesh.py`、`render_gl.py`、`shaders/{aircraft,line}.{vert,frag}`、`assets/airplane.glb`、sim\_service/gliderController/README/requirements 改动

* 当前**工作树已将旧途径回退**（`D` 删除源码与着色器，`M` 回退若干文件），但回退未提交

* `assets/airplane.glb` 仍在磁盘（已验证可用）；另有疑似损坏副本 `assets/airplane.glbi`（untracked 垃圾）

* `output/` 留有旧 GL 冒烟产物（gl\_demo/gl\_check/gl\_chase\_demo）与 `_tmp_*.png` 临时文件

* backend 当前无任何 `GLIDER_RENDERER` 引用（grep 确认）

**处置**：`613ba71` 保留在历史中作参考与代码来源，不 revert；工作树回退状态保持，新实现直接叠加；git 提交时机由用户决定。

### 2.2 可复用资产（从 `613ba71` 恢复）

| 资产                                                                                                                        | 来源                                | 复用方式                            |
| ------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------- |
| mat4 数学（`mat4_from_pos_quat_scale(pos,quat,scale,corr)`、`mat4_look_at`、`mat4_mul`、`gl_bytes`）                             | gl\_math.py                       | 直接恢复                            |
| trimesh 网格加载 + 程序化盒体兜底 + **按 program 实际声明属性组装交错、缺位补 12x 占位**（既往 KeyError 教训的代码载体）                                         | gl\_mesh.py `resolve_mesh`        | 恢复并按 §3.2 强化                    |
| 上下文创建三后端（moderngl-window / 原生 glfw / EGL）+ `GLContextError`                                                               | render\_gl.py `create_context` 系列 | 恢复，供视频（standalone）与实时窗口（glfw）共用 |
| 相机（`fixed_camera`、`chase_camera`）、`frame_state`、`ground_grid/patch`、起终点标记（三向菱形 `set_markers`）、`_omega_world`（相邻帧四元数差分角速度） | render\_gl.py                     | 恢复进新渲染器                         |
| HUD（PIL 字体加载 + `draw_hud` 盖字，英文）                                                                                          | render\_gl.py                     | 直接复用                            |
| 模型姿态修正 `corr`/`model_rot`/`model_scale` 机制                                                                                | render\_gl.py / gl\_mesh.py       | 恢复并参数化为 §3.2 的轴约定接口             |

**需要重写**：渲染架构本体——旧 `GliderGLRenderer` 是前向渲染（aircraft + line 两个 program），新途径按延迟管线重构（§3.3）。

### 2.3 需对齐的现行 mpl 渲染惯例（render.py）

* `make_video(tele, glider, out_path, fps, start, end, cfg_view, progress, hud, camera, ...)` 签名风格，输出 `flight_replay.mp4`（H.264 / yuv420p / imageio-ffmpeg 自带二进制）

* 固定机位取景 `_flight_view_bounds`（走廊范围 + 18% 边距）；地面网格；轨迹拖尾 ≤5000 点；**起点绿 / 终点红**标记；HUD 英文（DejaVu 无 CJK）

* 世界系 Y-up，机体系 x 前 / y 上 / z 右翼；姿态消费 = `quat_to_matrix(quat)` 旋转后平移

### 2.4 姿态数据链（用户强调项的事实基础）

`tele["quat"][i]`（xyzw）由刚体积分产生（`integrate_rigid` 四元数指数映射步进）；渲染端只做**纯几何搬运**：`world = R(quat) @ (R_conv @ v_model * k) + pos`。姿态正确性风险点全在**模型侧约定**：GLB 内嵌节点变换未烘焙、机头朝向轴不明、单位/原点不明——§3.2 逐项处理。

### 2.5 依赖现状（重要）

当前 shell 探测 `python` 下 moderngl/trimesh/imageio/numpy 等全部不可见（解释器可能不对）。实现第一步必须核查：`where.exe python` 确认 Anaconda 优先（PATH 惯例），再补装缺失依赖。目标依赖：`moderngl>=5.10`、`trimesh>=4.0`，核验 `imageio`、`imageio-ffmpeg`、`Pillow`、`numpy`、`matplotlib`。

## 3. 改动方案

### 3.1 文件清单

| 文件                                        | 动作          | 内容                                                                         |
| ----------------------------------------- | ----------- | -------------------------------------------------------------------------- |
| `simulation/glider/gl_math.py`            | 恢复自 613ba71 | mat4 数学工具                                                                  |
| `simulation/glider/gl_mesh.py`            | 恢复 + 强化     | GLB 加载、归一化、轴转换、程序化盒体兜底                                                     |
| `simulation/glider/gldeferred.py`         | 新写（\~700 行） | 延迟管线 + FrameSink + 相机 + pose-check + make\_video\_gl                       |
| `simulation/glider/glshaders/`            | 新建 7 个      | `gbuffer.vert/frag`、`lighting.vert/frag`、`flat.vert/frag`、`blit.vert/frag` |
| `simulation/glider/sim_service.py`        | 修改          | `--renderer` 与 GL 参数、视频分支、probe 增补                                         |
| `simulation/glider/requirements.txt`      | 修改          | 追加 moderngl、trimesh                                                        |
| `simulation/glider/README.md`             | 修改          | 新章节「GLB 延迟渲染途径」                                                            |
| `simulation/README.md`                    | 修改          | 目录结构、GLIDER\_RENDERER 说明                                                   |
| `backend/controllers/gliderController.js` | 修改          | GLIDER\_RENDERER 透传                                                        |
| `backend/.env.example`                    | 修改          | 补注释项                                                                       |

### 3.2 GLB 加载与姿态处理（重点）

`gl_mesh.py::resolve_mesh` 强化为：

1. **节点变换烘焙**：`trimesh.load(path)` 得 Scene，用 `scene.dump()`（世界系烘焙）而非裸 geometry 顶点——GLB 内嵌 node 的 rotation/scale/translation 必须生效，这是姿态错误的常见根源
2. **多 geometry/材质**：逐 geometry 建 VAO；颜色优先级 `baseColorTexture`（PIL → moderngl 纹理，gbuffer.frag 按 u\_use\_tex 采样）> `baseColorFactor` > 顶点色 > 浅灰
3. **归一化**：`--gl-model-center bbox|origin`（默认 bbox：减包围盒中心，模型原点=COM）；`--gl-model-scale auto|<float>`（auto = 最长包围盒边 → 16 m 翼展量级）
4. **轴转换** **`R_conv`**：`--gl-model-fwd {+x,-x,+y,-y,+z,-z}`（默认取 airplane.glb 已验证朝向，实现时从 613ba71 的 corr 逻辑确认）、`--gl-model-up`（默认 +y）；正交基构造：`model_fwd→body+x`、`model_up→body+y`、`model_fwd×model_up→body+z`（双右手系，纯旋转无需镜像）
5. **微调**：`--gl-model-rot "yaw,pitch,roll"`（deg，叠加在 R\_conv 之后）
6. **模型矩阵**：`u_model = T(pos)·R(quat)·R_conv·S(k)`，由 `mat4_from_pos_quat_scale(pos, quat, k, corr)` 生成
7. **加载日志**（沿用惯例）：`loaded model: <名称> (<N> tris), fwd=<..> up=<..>, scale=<k>, center=<..>`
8. **兜底**：默认模型 `assets/airplane.glb` 缺失 → stderr 警告 + 程序化盒体（`aircraft.parts()`，尺寸与机身一致无需归一化）；**用户显式** **`--gl-model`** **的文件加载失败 → 报错退出**（不静默换模型）

**姿态验证三件套**（"一定要处理好姿态"的保险）：

* `--gl-pose-check`：纯 numpy 断言，不依赖 GL。对 level / pitch20° / bank30° / yaw90° 四个规范姿态，验证 `R(quat)@R_conv@model_fwd == quat_rotate(q, [1,0,0])`（机头）、up / 右翼同理，打印对比表，任一超差（1e-9）非零退出

* `--gl-preview [t] [--gl-pose-set level|pitch20|bank30|yaw90]`：单帧 PNG 目检（最快迭代环）

* 加载日志 + §2.2 的属性组装补位约定（防 GLSL 裁剪未用属性导致 KeyError）

### 3.3 延迟渲染管线（gldeferred.py）

GLSL 330，moderngl standalone / glfw 上下文皆可承载：

1. **G-buffer FBO（MRT）**：`position RGBA16F`（xyz 世界坐标，w=几何标志）、`normal RGBA16F`（xyz 世界法线，w=材质标志 0=飞行器 / 1=地面）、`albedo RGBA8` + 深度附件
2. **几何 pass**（gbuffer.vert/frag）：飞机网格（u\_model 含 R\_conv）+ 地面大四边形（按 `_flight_view_bounds` 范围 + 边距，法向 +y，材质标志 1）
3. **光照 pass**（lighting.vert/frag，全屏三角形）：读 3 张 G-buffer → 太阳方向光（Lambert + 弱 Blinn 高光）+ 半球环境光 + 距离雾（适配 2232 m 走廊尺度）+ **程序化地面网格**（材质标志=1 时按 25 m 间距、随距离淡出，替代网格几何）+ 天空渐变（几何标志=0）
4. **overlay pass**（flat.vert/frag，前向非光照，画入光照后 FBO）：轨迹拖尾 LINE\_STRIP（≤5000 点，`--gl-trail-state none|alt`：alt=高空暖橙→低空蓝渐变、none=恒定蓝，沿用惯例）、起点绿 / 终点红三向菱形（复用 set\_markers）
5. **不做**阴影 / SSAO / 后处理（保持成比例）

**相机**：`--gl-camera fixed|chase`。fixed 默认 1280×720，取景复用 bounds 逻辑，`--gl-vert`（默认 3.0）竖直增强**仅作用于视图矩阵**（模型矩阵保持物理正确）；chase 默认 1024×576 无增强；`--gl-size WxH` 覆盖。

### 3.4 帧缓冲与呈现解耦（架构要求）

```python
class FrameSink:            # 协议：只消费 renderer.lit_fbo，不触碰管线
    def open(self, w, h, fps): ...
    def submit(self, renderer, frame_state): ...
    def close(self): ...
```

* **VideoSink**：`fbo.read(components=3)` → 翻转 → PIL 盖 HUD（英文 t/alt/V/alpha/sink，复用 draw\_hud）→ imageio-ffmpeg H.264（参数对齐 mpl make\_video）

* **PngSink**：`--gl-preview` 单帧 PNG

* **WindowSink**：`--gl-live` 原生窗口；复用 `_ctx_raw_glfw` 创建带窗口上下文，渲染照常进离屏 FBO，经 `blit.vert/frag` 拷到默认帧缓冲 + swap，按 fps 实时节拍播放全程，ESC / 关窗退出

未来新增呈现方式（流媒体、截图序列等）只需新写 Sink，管线零改动。

### 3.5 CLI 集成与回退（sim\_service.py）

* `--renderer {mpl,gl}` 默认 mpl；优先级 arg > env `GLIDER_RENDERER` > 默认

* 透传参数：`--gl-model / --gl-model-fwd / --gl-model-up / --gl-model-rot / --gl-model-scale / --gl-model-center / --gl-camera / --gl-size / --gl-vert / --gl-trail-state / --gl-hud|--no-gl-hud / --gl-preview [t] / --gl-pose-set / --gl-live / --gl-pose-check`

* 视频分支：renderer=gl 时调 `gldeferred.make_video_gl(...)`（签名风格对齐 render.make\_video），输出文件名仍 `flight_replay.mp4`，结果 JSON 的 `files.video` 结构不变

* 回退：gl 被请求但导入失败 / 上下文创建失败（`GLContextError`）→ stderr 警告 + 回退 mpl（沿用惯例）

* `--probe` 增补字段：`moderngl` / `trimesh` / `gl_context`（尝试 standalone 上下文创建，guarded）/ `renderer`（生效值；`GLIDER_RENDERER=gl` 时返回 `"gl"`）

### 3.6 后端接线

* `gliderController.js`：新增常量 `GLIDER_RENDERER`（默认 `'mpl'`），为 `'gl'` 时在 spawn 参数推入 `--renderer gl`（对齐既有 `GLIDER_PYTHON` / `GLIDER_BACKEND` 三态配置模式）

* `backend/.env.example`：补 `# GLIDER_RENDERER=gl` 注释项

### 3.7 文档与依赖

* `requirements.txt` 追加：`moderngl>=5.10`、`trimesh>=4.0`（注释标明仅 `--renderer gl` 需要）

* `glider/README.md` 新章节：快速开始、完整参数表、**GLB 模型约定与姿态参数说明**（轴/缩放/居中/微调 + pose-check 用法）、**uniform 契约表**（沿用惯例）、FrameSink 架构图、回退行为

* `simulation/README.md`：目录结构补 gldeferred.py / glshaders/，GLIDER\_RENDERER 说明

## 4. 假设与决策

1. `613ba71` 留在历史作代码来源，不 revert、不改历史；工作树回退状态保持原样叠加开发
2. 着色器目录命名 `glshaders/`；渲染器入口 `gldeferred.py`（与已删的 render\_gl.py 区分，语义明确）
3. `--renderer gl` 复用旧槽位（旧实现已删，无冲突）；默认 mpl 不变，保证零回归
4. HUD 英文（DejaVu 无 CJK 字形，惯例）
5. 光照保持简单（太阳 + 半球 + 雾），不引入阴影 / SSAO
6. `--gl-vert` 竖直增强只影响视图矩阵，模型矩阵保持物理正确
7. airplane.glb 的默认机头朝向从 613ba71 已验证的 corr 逻辑中确认后固化，并可用 `--gl-model-fwd` 覆盖
8. git 提交时机由用户决定，本计划不包含提交动作
9. 收尾清理：删除 `assets/airplane.glbi`（疑似损坏副本）与 `output/_tmp_*.png`；旧 GL 冒烟产物（gl\_demo/gl\_check/gl\_chase\_demo）在新途径验证通过后清理，mpl\_run 保留至回归验证完成

## 5. 实施步骤

1. 环境核查与依赖安装（where.exe python → Anaconda 优先；pip 装 moderngl/trimesh，核验 imageio-ffmpeg）
2. `git show 613ba71:simulation/glider/{gl_math,gl_mesh}.py > ...` 恢复工具层并审查
3. gl\_mesh.py 按 §3.2 强化（节点变换烘焙、纹理/因子颜色、归一化、轴转换参数化、日志）
4. 编写 glshaders/ 7 个着色器
5. 编写 gldeferred.py（管线 + FrameSink 三实现 + 相机恢复 + HUD 复用 + pose-check）
6. sim\_service.py 集成 + probe 增补
7. 姿态验证：--gl-pose-check 断言 + --gl-preview 四姿势目检
8. 视频 / 追逐机位 / --gl-live 实时窗口验证
9. 回退路径与 mpl 回归验证
10. 后端接线 + .env.example
11. requirements / 两处 README 文档
12. 清理临时文件与旧产物

## 6. 验证清单

| #  | 验证项               | 通过标准                                                                                              |
| -- | ----------------- | ------------------------------------------------------------------------------------------------- |
| 1  | `--probe`         | moderngl/trimesh/gl\_context=true，renderer 字段正确；`GLIDER_RENDERER=gl --probe` 返回 `"renderer":"gl"` |
| 2  | `--gl-pose-check` | 四规范姿态机头/上/右翼向量断言全过（误差 <1e-9），退出码 0                                                                |
| 3  | `--gl-preview`    | 起飞/中段/落地三帧 + 四姿势 PNG：机头朝向、上反、坡度方向目检正确                                                             |
| 4  | 全程视频              | `--renderer gl --video --video-max 120`：MP4 覆盖到 landed，拖尾 alt 渐变、绿/红标记、HUD 正常                     |
| 5  | 追逐机位              | `--gl-camera chase` 视频正常（1024×576）                                                                |
| 6  | 实时窗口              | `--gl-live` 实时播放、ESC 退出、退出后无残留进程                                                                  |
| 7  | 回退                | GL 不可用（模拟卸载或 EGL 失败）→ stderr 警告 + mpl 产物正常生成                                                      |
| 8  | mpl 回归            | 不传 `--renderer` 与 `--renderer mpl` 产物与现状一致（summary 一致 + 目检）                                       |
| 9  | 模型兜底              | 临时移走 airplane.glb → 警告 + 盒体兜底成功；`--gl-model` 指向坏路径 → 明确报错退出                                       |
| 10 | 后端                | 设 `GLIDER_RENDERER=gl` 起后端提交仿真 → 平台产出的视频为 GL 渲染                                                   |

