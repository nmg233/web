"""gldeferred.py — GLB 模型 + 延迟渲染（deferred shading）渲染途径。

与 :mod:`render`（matplotlib 路径）并列，产出同一种 ``flight_replay.mp4``；
``sim_service.py --renderer gl|mpl`` 切换，matplotlib 保留为兜底与对拍。

管线与解耦架构
--------------
::

    几何 pass            光照 pass             overlay pass
    (gbuffer.vert/frag)  (lighting.vert/frag)  (flat.vert/frag)
    飞机部件      ──►  G-buffer(MRT)    ──►  拖尾丝带 + 起/终点标记
          │               太阳+半球环境光+雾        │
          ▼               解析无限地面+网格+天空    ▼
      G-buffer FBO ──►  lit FBO(共享深度)  ──►  FrameSink（呈现解耦）
                                                ├─ VideoSink  → MP4（默认）
                                                ├─ PngSink    → --gl-preview 单帧
                                                └─ WindowSink → --gl-live 实时窗口
                                                      (blit.vert/frag 拷屏)

坐标与姿态约定（本项目最关键的部分）
------------------------------------
- 世界系 Y-up；机体系 x 前 / y 上 / z 右翼（与 ``aircraft.py`` / ``render.py`` 一致）；
- 姿态是纯几何搬运：``world = T(pos)·R(quat)·S(k) @ v_fit``，四元数直接取
  ``tele["quat"][i]``（xyzw，物理积分产生），渲染端不做任何姿态计算；
- 模型轴转换 ``R_conv`` 在 ``gl_mesh.fit_parts`` 阶段**烘焙进顶点**，因此模型矩阵
  不含任何隐藏旋转——用 :func:`pose_check` 可端到端断言渲染姿态 == 物理姿态（<1e-9）。

不重复造轮子：矩阵运算走 pyGLM（经 :mod:`gl_math` 适配），GLB 解析走 trimesh
（经 :mod:`gl_mesh`），视频编码走 imageio-ffmpeg，HUD 字体走 matplotlib 自带
DejaVuSansMono。相机/取景算法沿用 matplotlib 路径的已验证实现。
"""

from __future__ import annotations

import os
from dataclasses import dataclass

import numpy as np

from gl_math import (gl_bytes, mat4_from_pos_quat_scale, mat4_invert, mat4_look_at,
                     mat4_mul, mat4_perspective, transform_points)
from gl_mesh import Mesh, axis_conv, fit_parts, load_glb_parts, load_obj, procedural_mesh
from render import _flight_view_bounds, _hud_text
from spatial import quat_from_axis_angle, quat_rotate, quat_to_matrix

_MODULE_DIR = os.path.dirname(os.path.abspath(__file__))
GLSHADER_DIR = os.path.join(_MODULE_DIR, "glshaders")
DEFAULT_MODEL_GLB = os.path.join(_MODULE_DIR, "assets", "airplane.glb")

# ---- 颜色 / 光照（世界系，Y-up）----
LIGHT_DIR = (0.30, 0.80, -0.52)          # 指向光源（归一化）
LIGHT_COLOR = (0.95, 0.95, 0.92)
AMBIENT_UP = (0.42, 0.45, 0.50)          # 半球环境光：朝上（天光）
AMBIENT_DOWN = (0.30, 0.28, 0.26)        # 朝下（地面反照）
SKY_TOP = (0.32, 0.52, 0.82)
SKY_HORIZON = (0.80, 0.87, 0.95)
FOG_COLOR = (0.78, 0.85, 0.93)
FOG_DENSITY = 3.0e-4                     # exp 雾：~2300 m 处约 50%
GROUND_ALBEDO = (0.2, 0.2, 0.2)       # 与 mpl 路径地面色一致

# ---- overlay（拖尾 / 标记）----
TRAIL_WARM = (0.95, 0.55, 0.20, 0.95)    # --gl-trail-state alt：高空
TRAIL_GREEN = (0.30, 0.95, 0.25, 0.95)   # alt 渐变：低空（末端）亮绿
TRAIL_BLUE = (0.18, 0.42, 0.86, 0.95)    # none 恒定蓝
MARK_START = (0.10, 0.62, 0.22, 1.0)     # 投放点（绿）
MARK_END = (0.86, 0.20, 0.20, 1.0)       # 落点（红）

# ---- pose-check / --gl-pose-set 的规范姿态（机体轴四元数，xyzw）----
POSE_SETS = {
    "level":   np.array([0.0, 0.0, 0.0, 1.0]),
    "pitch20": quat_from_axis_angle(np.array([0.0, 0.0, 1.0]), np.radians(20.0)),
    "bank30":  quat_from_axis_angle(np.array([1.0, 0.0, 0.0]), np.radians(30.0)),
    "yaw90":   quat_from_axis_angle(np.array([0.0, 1.0, 0.0]), np.radians(90.0)),
}

MAX_TRAIL_POINTS = 5000


class GLContextError(RuntimeError):
    """无法创建 OpenGL 上下文（无 GPU / 无显示 / 驱动缺失）时抛出。"""


# ---------------------------------------------------------------------------
# GL 上下文（glfw 隐藏/可见窗口 -> EGL 离屏降级；GLIDER_GL_CONTEXT 可覆盖）
# ---------------------------------------------------------------------------

class _ContextHandle:
    """GL 上下文 + 关闭钩子 + 原生窗口句柄（live 窗口用）的薄封装。"""

    def __init__(self, ctx, closer, kind: str, info: str, win=None, glfw_mod=None):
        self.ctx = ctx
        self.kind = kind
        self.info = info
        self.win = win
        self.glfw = glfw_mod
        self._closer = closer

    def close(self):
        if self._closer is None:
            return
        closer, self._closer = self._closer, None
        try:
            closer()
        except Exception:  # noqa: BLE001 关闭失败不应影响主流程
            pass


def _ctx_raw_glfw(width: int, height: int, visible: bool) -> _ContextHandle:
    import glfw
    import moderngl

    if not glfw.init():
        raise RuntimeError("glfw.init() 失败（无可用的显示/窗口系统）")
    try:
        glfw.window_hint(glfw.VISIBLE, glfw.TRUE if visible else glfw.FALSE)
        glfw.window_hint(glfw.CONTEXT_VERSION_MAJOR, 3)
        glfw.window_hint(glfw.CONTEXT_VERSION_MINOR, 3)
        glfw.window_hint(glfw.OPENGL_PROFILE, glfw.OPENGL_CORE_PROFILE)
        win = glfw.create_window(width, height, "glider-gl", None, None)
        if not win:
            raise RuntimeError("glfw.create_window() 返回空（无法创建 GL 3.3 上下文）")
        glfw.make_context_current(win)
        ctx = moderngl.create_context()      # 包装当前线程的 glfw 上下文
    except Exception:
        glfw.terminate()
        raise

    def _close():
        glfw.destroy_window(win)
        glfw.terminate()

    info = f"{ctx.info.get('GL_VERSION', '?')} | {ctx.info.get('GL_RENDERER', '?')}"
    return _ContextHandle(ctx, _close, "glfw(window)" if visible else "glfw(hidden)",
                          info, win=win, glfw_mod=glfw)


def _ctx_egl(width: int, height: int) -> _ContextHandle:
    import moderngl

    ctx = moderngl.create_context(standalone=True, backend="egl")
    info = f"{ctx.info.get('GL_VERSION', '?')} | {ctx.info.get('GL_RENDERER', '?')}"
    return _ContextHandle(ctx, None, "egl(standalone)", info)


def create_context(width: int, height: int, backend: str | None = None,
                   visible: bool = False) -> _ContextHandle:
    """创建 GL 上下文：``glfw -> egl`` 降级，``GLIDER_GL_CONTEXT`` 环境变量可覆盖。

    ``visible=True``（--gl-live 实时窗口）只允许 glfw（窗口呈现需要原生窗口）。
    全部失败时抛 :class:`GLContextError`（调用方据此回退 matplotlib）。
    """
    want = (backend or os.environ.get("GLIDER_GL_CONTEXT") or "auto").strip().lower()
    if visible:
        if want not in ("auto", "", "glfw"):
            raise GLContextError(f"实时窗口（--gl-live）需要 glfw 后端，当前指定 {want!r}")
        order = ["glfw"]
    else:
        order = ["glfw", "egl"] if want in ("auto", "") else [want]
    makers = {"glfw": lambda w, h: _ctx_raw_glfw(w, h, visible), "egl": _ctx_egl}

    errors = []
    for name in order:
        try:
            return makers[name](width, height)
        except Exception as exc:  # noqa: BLE001 逐个降级尝试
            errors.append(f"{name}: {exc}")
    raise GLContextError("无法创建 OpenGL 上下文（" + "; ".join(errors) + "）")


# ---------------------------------------------------------------------------
# VAO 组装（按程序实际声明的属性，缺位补 padding —— 既往 GLSL 属性裁剪教训）
# ---------------------------------------------------------------------------

_GBUF_LAYOUT = (("in_position", "3f", 12), ("in_normal", "3f", 12),
                ("in_color", "3f", 12), ("in_uv", "2f", 8))       # 44 B/顶点
_FLAT_LAYOUT = (("in_position", "3f", 12), ("in_color", "4f", 16))  # 28 B/顶点
_FS_LAYOUT = (("in_position", "2f", 8), ("in_uv", "2f", 8))         # 全屏三角形


def _make_vao(ctx, program, vbo, layout, ibo=None):
    """自定义着色器可以只声明部分顶点属性（GLSL 会裁掉未用属性，moderngl 取名抛
    KeyError），因此按程序实际声明组装交错格式，缺位补 padding 字节，保证偏移与
    :meth:`Mesh.interleave_uv` 的布局一致。"""
    fmt, names = [], []
    for name, f, pad in layout:
        if program.get(name, None) is not None:
            fmt.append(f)
            names.append(name)
        elif names:
            fmt.append(f"{pad}x")
    if "in_position" not in names:
        raise RuntimeError("着色器必须声明顶点属性 in_position")
    return ctx.vertex_array(program, [(vbo, " ".join(fmt), *names)], ibo)


# ---------------------------------------------------------------------------
# 延迟渲染器
# ---------------------------------------------------------------------------

class DeferredRenderer:
    """三段式延迟管线：几何 pass（MRT）-> 光照 pass -> overlay pass。

    帧缓冲与呈现解耦：本类只把最终画面写进 ``lit FBO``，怎么呈现（视频/截图/
    实时窗口）由 :class:`FrameSink` 的实现决定，管线零感知。
    """

    def __init__(self, width: int, height: int, parts: list[Mesh], *,
                 shader_dir: str | None = None, gl_backend: str | None = None,
                 visible: bool = False, trail_width: float = 4.0,
                 skybox: bool = True):
        import moderngl

        self.moderngl = moderngl
        self.width, self.height = int(width), int(height)
        self.parts = list(parts)
        self.trail_width = float(trail_width)

        self.handle = create_context(self.width, self.height, gl_backend, visible=visible)
        self.ctx = self.handle.ctx
        self.info = self.handle.info
        self._missing: set = set()

        sd = shader_dir or GLSHADER_DIR
        self.prog_gbuf = self._program("gbuffer", sd)
        self.prog_light = self._program("lighting", sd)
        self.prog_flat = self._program("flat", sd)
        self.prog_blit = self._program("blit", sd)

        w, h = self.width, self.height
        # ---- G-buffer（MRT 三附件 + 深度）与 lit FBO（深度共享，免拷贝）----
        self.tex_pos = self.ctx.texture((w, h), 4, dtype="f2")
        self.tex_nrm = self.ctx.texture((w, h), 4, dtype="f2")
        self.tex_alb = self.ctx.texture((w, h), 4)
        self.tex_depth = self.ctx.depth_texture((w, h))
        for t in (self.tex_pos, self.tex_nrm, self.tex_alb):
            t.filter = (moderngl.NEAREST, moderngl.NEAREST)
        self.fbo_gbuf = self.ctx.framebuffer(
            [self.tex_pos, self.tex_nrm, self.tex_alb], self.tex_depth)

        self.tex_lit = self.ctx.texture((w, h), 4)
        self.tex_lit.filter = (moderngl.NEAREST, moderngl.NEAREST)
        self.fbo_lit = self.ctx.framebuffer([self.tex_lit], self.tex_depth)

        # ---- 全屏大三角形（lighting / blit 共用）----
        self.vbo_fs = self.ctx.buffer(np.array([
            -1.0, -1.0, 0.0, 0.0,
            3.0, -1.0, 2.0, 0.0,
            -1.0, 3.0, 0.0, 2.0], dtype=np.float32).tobytes())
        self.vao_light = _make_vao(self.ctx, self.prog_light, self.vbo_fs, _FS_LAYOUT)
        self.vao_blit = _make_vao(self.ctx, self.prog_blit, self.vbo_fs, _FS_LAYOUT)

        # ---- 飞机部件（per-part VAO + 可选贴图）----
        self.tex_white = self.ctx.texture((1, 1), 3, np.full((1, 1, 3), 255, np.uint8).tobytes())
        self.part_vaos, self.part_textures = [], []
        for p in self.parts:
            vbo = self.ctx.buffer(p.interleave_uv())
            ibo = self.ctx.buffer(np.ascontiguousarray(p.indices, dtype=np.uint32).tobytes())
            self.part_vaos.append(_make_vao(self.ctx, self.prog_gbuf, vbo, _GBUF_LAYOUT, ibo))
            self.part_textures.append(self._texture_from_pil(p.texture))

        # 地面不再入 G-buffer：光照 pass 由视线射线与无限平面 y=0 解析渲染
        # （无载体四边形，不存在远处裁剪边）。
        self._set(self.prog_light, "u_ground_albedo", GROUND_ALBEDO)

        # ---- overlay 几何（拖尾丝带 TRIANGLE_STRIP / 标记 LINE_STRIP）----
        self.vbo_trail = self.ctx.buffer(reserve=2 * MAX_TRAIL_POINTS * 28)
        self.vao_trail = _make_vao(self.ctx, self.prog_flat, self.vbo_trail, _FLAT_LAYOUT)
        self.trail_vertices = 0
        self.vbo_markers = self.ctx.buffer(reserve=2 * 15 * 28)
        self.vao_markers = _make_vao(self.ctx, self.prog_flat, self.vbo_markers, _FLAT_LAYOUT)
        self._marker_count = 0

        # ---- 相机 / 模型矩阵状态 ----
        self.view = np.eye(4, dtype=np.float32)
        self.proj = np.eye(4, dtype=np.float32)
        self.vp = np.eye(4, dtype=np.float32)
        self.inv_vp = np.eye(4, dtype=np.float32)
        self.model = np.eye(4, dtype=np.float32)
        self.cam_eye = np.zeros(3, dtype=np.float64)
        self.fovy = float(np.radians(45.0))

        # ---- 光照常量（一次性）----
        for name, val in (("u_g_position", 0), ("u_g_normal", 1), ("u_g_albedo", 2),
                          ("u_light_dir", LIGHT_DIR), ("u_light_color", LIGHT_COLOR),
                          ("u_ambient_up", AMBIENT_UP), ("u_ambient_down", AMBIENT_DOWN),
                          ("u_sky_top", SKY_TOP), ("u_sky_horizon", SKY_HORIZON),
                          ("u_fog_color", FOG_COLOR), ("u_fog_density", FOG_DENSITY)):
            self._set(self.prog_light, name, val)
        self._set(self.prog_blit, "u_tex", 0)

        # ---- 天空全景贴图（assets/skyview.jpg，等距柱状投影）----
        # 存在则绑定到纹理单元 3 并供 lighting.frag 的天空分支采样；
        # 缺失/加载失败则退回渐变天空（u_sky_top / u_sky_horizon）。
        self.skybox_tex, self._use_skybox = self._load_skybox() if skybox else (None, False)
        self._set(self.prog_light, "u_skybox", 3)
        self._set(self.prog_light, "u_use_skybox", 1.0 if self._use_skybox else 0.0)

        self.set_grid()

    # ---- 构建 / uniform ----

    def _program(self, stem: str, shader_dir: str):
        vpath = os.path.join(shader_dir, f"{stem}.vert")
        fpath = os.path.join(shader_dir, f"{stem}.frag")
        for p in (vpath, fpath):
            if not os.path.isfile(p):
                raise RuntimeError(f"着色器文件缺失：{p}")
        try:
            with open(vpath, "r", encoding="utf-8") as fh:
                vert = fh.read()
            with open(fpath, "r", encoding="utf-8") as fh:
                frag = fh.read()
            return self.ctx.program(vertex_shader=vert, fragment_shader=frag)
        except Exception as exc:  # noqa: BLE001 编译错误必须显式暴露（不静默兜底）
            raise RuntimeError(f"{stem} 着色器编译失败（{shader_dir}）：{exc}") from exc

    def _texture_from_pil(self, img):
        if img is None:
            return None
        img = img if img.mode in ("RGB", "RGBA") else img.convert("RGBA")
        comps = 4 if img.mode == "RGBA" else 3
        tex = self.ctx.texture(img.size, comps, img.tobytes())
        tex.filter = (self.moderngl.LINEAR, self.moderngl.LINEAR)
        return tex

    def _load_skybox(self):
        """加载等距柱状天空贴图 ``assets/skyview.jpg``。

        ``None`` 路径（无图）与解码失败均返回 ``(None, False)``，光照 pass
        据此退回渐变天空。等距柱状全景在顶点着色器侧不需要立方体贴图，
        由 lighting.frag 用视线方向直接做经纬映射采样。
        """
        path = os.path.join(_MODULE_DIR, "assets", "skyview.jpg")
        if not os.path.isfile(path):
            return None, False
        try:
            from PIL import Image
            img = Image.open(path)
            tex = self._texture_from_pil(img)
            if tex is None:
                return None, False
            # 环境贴图不重复、各向异性过滤
            tex.repeat_x, tex.repeat_y = False, False
            return tex, True
        except Exception as exc:  # noqa: BLE001 坏图/解码失败静默回退
            print(f"[gl] 天空贴图加载失败（回退渐变天空）：{exc}")
            return None, False

    def _set(self, program, name, value):
        """写入 uniform；着色器未声明该名字时静默跳过并缓存（GLSL 会裁掉未用
        uniform，取不到名字属正常情况）。``bytes`` 走 ``write()``（矩阵专用）。"""
        key = (id(program), name)
        if key in self._missing:
            return
        try:
            slot = program[name]
        except KeyError:
            self._missing.add(key)
            return
        try:
            if isinstance(value, (bytes, bytearray, memoryview)):
                slot.write(bytes(value))
            else:
                slot.value = value
        except Exception as exc:  # noqa: BLE001 类型不符时给出一次明确提示
            self._missing.add(key)
            print(f"[gl] uniform {name} 写入失败（已跳过）：{exc}")

    # ---- 逐帧状态 ----

    def set_camera(self, eye, target, up=(0.0, 1.0, 0.0), fovy=float(np.radians(45.0)),
                   near=1.0, far=5000.0):
        self.cam_eye = np.asarray(eye, dtype=np.float64).reshape(3)
        self.fovy = float(fovy)
        self.view = mat4_look_at(eye, target, up)
        self.proj = mat4_perspective(fovy, self.width / float(self.height), near, far)
        self.vp = mat4_mul(self.proj, self.view)
        self.inv_vp = mat4_invert(self.vp)
        self._set(self.prog_light, "u_inv_view_proj", gl_bytes(self.inv_vp))
        self._set(self.prog_light, "u_cam_eye", tuple(float(v) for v in self.cam_eye))
        self._set(self.prog_flat, "u_mvp", gl_bytes(self.vp))

    def set_aircraft(self, pos, quat, scale: float = 1.0):
        """模型矩阵 = ``T(pos)·R(quat)·S(scale)``：纯物理姿态，无隐藏旋转
        （轴转换已在 :func:`gl_mesh.fit_parts` 烘焙进顶点）。"""
        self.model = mat4_from_pos_quat_scale(pos, quat, scale, None)

    def set_grid(self, spacing: float = 25.0, fade_dist: float = 1500.0):
        """解析地面网格参数（间距 / 淡出距离，作用于无限平面 y=0）。"""
        self._set(self.prog_light, "u_grid_spacing", float(spacing))
        self._set(self.prog_light, "u_grid_fade_dist", float(fade_dist))

    def set_trail(self, points, colors=None):
        """上传拖尾 billboard 丝带（宽度按相机距离缩放，屏幕像素恒定）。"""
        pts = np.asarray(points, dtype=np.float64).reshape(-1, 3)
        if len(pts) < 2:
            self.trail_vertices = 0
            return
        if len(pts) > MAX_TRAIL_POINTS:
            pts = pts[-MAX_TRAIL_POINTS:]
            colors = colors[-MAX_TRAIL_POINTS:] if colors is not None else None
        view_dir = self.cam_eye[None, :] - pts                      # 指向相机
        right = np.cross(np.array([0.0, 1.0, 0.0]), view_dir)       # 水平右向量
        ln = np.linalg.norm(right, axis=1, keepdims=True)
        right = np.divide(right, np.where(ln < 1e-9, 1.0, ln))
        right[ln[:, 0] < 1e-9] = (1.0, 0.0, 0.0)
        dist = np.linalg.norm(view_dir, axis=1)
        half_w = np.maximum(self.trail_width * np.tan(self.fovy * 0.5) * dist
                            / self.height, 0.05)
        off = right * half_w[:, None]
        if colors is None:
            colors = np.tile(np.array(TRAIL_BLUE, dtype=np.float32), (len(pts), 1))
        colors = np.asarray(colors, dtype=np.float32).reshape(-1, 4)
        verts = np.empty((2 * len(pts), 7), dtype=np.float32)
        verts[0::2, :3] = pts + off
        verts[1::2, :3] = pts - off
        verts[0::2, 3:] = colors
        verts[1::2, 3:] = colors
        self.vbo_trail.orphan()
        self.vbo_trail.write(verts.tobytes())
        self.trail_vertices = 2 * len(pts)

    def set_markers(self, markers, scale: float = 1.0):
        """投放点(绿) / 落点(红)：三向菱形（与 mpl 路径起止点标记对应）。"""
        blocks = []
        s = 6.0 * float(scale)
        for p, col in ((np.asarray(markers[0], dtype=np.float64), MARK_START),
                       (np.asarray(markers[1], dtype=np.float64), MARK_END)):
            pts = np.array([
                [0, s, 0], [s, 0, 0], [0, -s, 0], [-s, 0, 0], [0, s, 0],   # x-y 菱形
                [s, 0, 0], [0, 0, s], [-s, 0, 0], [0, 0, -s], [s, 0, 0],   # x-z 菱形
                [0, s, 0], [0, 0, s], [0, -s, 0], [0, 0, -s], [0, s, 0],   # y-z 菱形
            ], dtype=np.float64) + p
            v = np.concatenate([pts, np.tile(np.array(col, dtype=np.float32), (15, 1))], axis=1)
            blocks.append(v.astype(np.float32))
        self.vbo_markers.orphan()
        self.vbo_markers.write(np.concatenate(blocks).tobytes())
        self._marker_count = 15

    # ---- 渲染 ----

    def render_frame(self):
        """执行三段 pass，最终画面落在 lit FBO（呈现交给 FrameSink）。"""
        mg = self.moderngl
        ctx = self.ctx
        ctx.viewport = (0, 0, self.width, self.height)

        # 1) 几何 pass：飞机部件 -> G-buffer（MRT）+ 深度
        #    地面不入 G-buffer，由光照 pass 对背景像素解析渲染（无限平面 + 天空）
        self.fbo_gbuf.use()
        ctx.enable(mg.DEPTH_TEST)
        ctx.disable(mg.CULL_FACE)          # 薄部件 / 双面几何更安全
        self.fbo_gbuf.clear(0.0, 0.0, 0.0, 0.0)   # w=0 -> 光照 pass 解析背景
        self._set(self.prog_gbuf, "u_view", gl_bytes(self.view))
        self._set(self.prog_gbuf, "u_proj", gl_bytes(self.proj))
        self._set(self.prog_gbuf, "u_model", gl_bytes(self.model))
        self._set(self.prog_gbuf, "u_use_tex", 0.0)
        for vao, tex in zip(self.part_vaos, self.part_textures):
            if tex is not None:
                tex.use(0)
                self._set(self.prog_gbuf, "u_use_tex", 1.0)
            else:
                self.tex_white.use(0)
                self._set(self.prog_gbuf, "u_use_tex", 0.0)
            vao.render(mg.TRIANGLES)

        # 2) 光照 pass：全屏三角形，读 G-buffer -> lit（深度保留供 overlay 遮挡）
        self.fbo_lit.use()
        ctx.disable(mg.DEPTH_TEST)
        self.fbo_lit.clear(0.0, 0.0, 0.0, 1.0)
        self.tex_pos.use(0)
        self.tex_nrm.use(1)
        self.tex_alb.use(2)
        if self._use_skybox and self.skybox_tex is not None:
            self.skybox_tex.use(3)
        self.vao_light.render(mg.TRIANGLES)

        # 3) overlay pass：拖尾 / 标记（前向非光照，与共享深度做遮挡测试）
        ctx.enable(mg.DEPTH_TEST)
        if self.trail_vertices >= 4:
            self.vao_trail.render(mg.TRIANGLE_STRIP, vertices=self.trail_vertices)
        if self._marker_count:
            for first in (0, self._marker_count):
                self.vao_markers.render(mg.LINE_STRIP, vertices=self._marker_count,
                                        first=first)

    def read_pixels(self) -> np.ndarray:
        """lit FBO 回读 -> ``(H, W, 3) uint8``（行序翻转为图像坐标，mpl 路径一致）。"""
        raw = self.fbo_lit.read(components=3, alignment=1)
        img = np.frombuffer(raw, dtype=np.uint8).reshape(self.height, self.width, 3)
        return np.flipud(np.ascontiguousarray(img))

    def blit_to_screen(self):
        """把 lit FBO 拷到默认帧缓冲（仅 --gl-live 的可见窗口上下文可用）。"""
        mg = self.moderngl
        self.ctx.screen.use()
        self.ctx.viewport = (0, 0, self.width, self.height)
        self.ctx.disable(mg.DEPTH_TEST)
        self.tex_lit.use(0)
        self._set(self.prog_blit, "u_tex", 0)
        self.vao_blit.render(mg.TRIANGLES)

    def close(self):
        objs = [self.vbo_fs, self.vbo_trail,
                self.vbo_markers, self.tex_pos, self.tex_nrm, self.tex_alb,
                self.tex_depth, self.tex_lit, self.fbo_gbuf, self.fbo_lit,
                self.tex_white, *self.part_vaos, *self.part_textures,
                self.vao_light, self.vao_blit, self.vao_trail, self.vao_markers,
                self.prog_gbuf, self.prog_light, self.prog_flat, self.prog_blit]
        for obj in objs:
            try:
                obj.release()
            except Exception:  # noqa: BLE001
                pass
        for vao in self.part_vaos:  # VAO 持有的 vbo/ibo
            pass
        self.handle.close()


# ---------------------------------------------------------------------------
# HUD（复用 matplotlib 自带 DejaVu 字体，与 mpl 路径文字一致）
# ---------------------------------------------------------------------------

def _hud_font(height: int):
    from PIL import ImageFont
    size = max(11, int(round(height / 64.0)))
    try:
        import matplotlib
        path = os.path.join(os.path.dirname(matplotlib.__file__),
                            "mpl-data", "fonts", "ttf", "DejaVuSansMono.ttf")
        if os.path.isfile(path):
            return ImageFont.truetype(path, size)
    except Exception:  # noqa: BLE001 退回 PIL 默认位图字体
        pass
    return ImageFont.load_default()


def draw_hud(img: np.ndarray, text: str) -> np.ndarray:
    """在帧上叠加半透明白底黑字 HUD（文字内容与 matplotlib 路径一致）。"""
    if not text:
        return img
    from PIL import Image, ImageDraw
    im = Image.fromarray(img)
    drawer = ImageDraw.Draw(im, "RGBA")
    font = _hud_font(img.shape[0])
    x0, y0 = max(8, img.shape[1] // 36), max(8, img.shape[0] // 24)
    box = drawer.multiline_textbbox((x0 + 8, y0 + 6), text, font=font, spacing=4)
    drawer.rectangle([x0, y0, box[2] + 8, box[3] + 6],
                     fill=(255, 255, 255, 190), outline=(190, 190, 190, 255))
    drawer.multiline_text((x0 + 8, y0 + 6), text, font=font,
                          fill=(5, 5, 12, 255), spacing=4)
    return np.asarray(im)


def _trail_colors(alt, alt_lo: float, alt_hi: float, mode: str = "alt") -> np.ndarray:
    """拖尾逐点颜色：``alt`` 高空暖橙 -> 低空亮绿；``none`` 恒定蓝。"""
    alt = np.asarray(alt, dtype=np.float64)
    n = len(alt)
    if mode == "none" or alt_hi - alt_lo < 1e-9:
        return np.tile(np.array(TRAIL_BLUE, dtype=np.float32), (n, 1))
    t = np.clip((alt - alt_lo) / (alt_hi - alt_lo), 0.0, 1.0)
    warm = np.array(TRAIL_WARM[:3], dtype=np.float32)
    green = np.array(TRAIL_GREEN[:3], dtype=np.float32)
    rgb = green[None, :] * (1.0 - t)[:, None] + warm[None, :] * t[:, None]
    alpha = np.full((n, 1), TRAIL_GREEN[3], dtype=np.float32)
    return np.concatenate([rgb, alpha], axis=1).astype(np.float32)


# ---------------------------------------------------------------------------
# 相机（迁移自已验证的 GL 实现，取景逻辑与 matplotlib 路径对齐）
# ---------------------------------------------------------------------------

def fixed_camera(bounds, aspect, fovy=np.radians(45.0), elev_deg=8.0, azim_deg=-90.0):
    """固定机位：取景覆盖整条飞行走廊。

    ``bounds`` 来自 ``render._flight_view_bounds``：(x0, x1, alt0, alt1, z0, z1)。
    注意方位角**镜像**：mpl 把世界 ``(x, alt, z)`` 放进 mpl ``(x, z, alt)`` 布局
    （行列式 -1 的左手嵌入），同一个 ``azim`` 在 mpl 画面上的左右与世界系相反；
    要让 GL 画面里"飞机沿 +x 由左向右飞"（与 mpl 固定机位一致），正弦项取反。
    """
    x0, x1, alt0, alt1, z0, z1 = (float(v) for v in bounds)
    center = np.array([(x0 + x1) / 2.0, (alt0 + alt1) / 2.0, (z0 + z1) / 2.0])

    e, a = np.radians(elev_deg), np.radians(azim_deg)
    direction = np.array([np.cos(e) * np.cos(a), np.sin(e), -np.cos(e) * np.sin(a)])

    # 相机基向量与距离无关，先把 8 个角点投到相机系再解"恰好装下走廊"的距离
    f = -direction
    s = np.cross(f, np.array([0.0, 1.0, 0.0]))
    ns = np.linalg.norm(s)
    s = np.array([1.0, 0.0, 0.0]) if ns < 1e-9 else s / ns
    u = np.cross(s, f)

    tan_v = max(float(np.tan(fovy * 0.5)), 1e-6)
    tan_h = tan_v * max(float(aspect), 1e-6)
    corners = np.array([[x, y, z]
                        for x in (x0, x1) for y in (alt0, alt1) for z in (z0, z1)])
    rel = corners - center
    need = np.maximum(np.abs(rel @ s) / tan_h, np.abs(rel @ u) / tan_v)
    dist = max(float(np.max(rel @ f + need)) * 1.06, 1.0)

    eye = center + direction * dist
    return eye, center, dist


def chase_camera(pos, quat, cfg_view):
    """追逐机位：机体后上方 3/4 视角（迁移 matplotlib 路径的机位算法）。"""
    R = quat_to_matrix(quat)
    xb = R[:, 0]
    dist = float(cfg_view.get("dist", 55.0))
    height = float(cfg_view.get("height", 34.0))
    lateral = float(cfg_view.get("lateral", 26.0))

    xz = np.array([xb[0], 0.0, xb[2]], dtype=np.float64)
    n = np.linalg.norm(xz)
    xz = np.array([1.0, 0.0, 0.0]) if n < 1e-6 else xz / n

    up = np.array([0.0, 1.0, 0.0])
    side = np.cross(up, xz)
    sn = np.linalg.norm(side)
    side = -side / sn if sn > 1e-9 else np.array([0.0, 0.0, 1.0])

    pos = np.asarray(pos, dtype=np.float64)
    eye = pos - xz * dist + up * height + side * lateral
    target = pos + xz * 8.0
    return eye, target, dist


def chase2_camera(pos, quat, cfg_view):
    """低空追逐机位（chase2）：相机贴近飞机高度、远距跟随，视线近水平平行于地面。

    与 :func:`chase_camera` 的区别：默认高度 6m（chase 为 34m 俯视 3/4 视角），
    俯角仅约 atan((6-1.5)/55) ~ 4.7°，地平线居中，适合观察水平姿态与
    拖尾的水平延伸；侧向偏移也较小（8m）保留一点立体感。
    """
    R = quat_to_matrix(quat)
    xb = R[:, 0]
    dist = float(cfg_view.get("dist", 55.0))
    height = float(cfg_view.get("height", 6.0))
    lateral = float(cfg_view.get("lateral", 8.0))

    xz = np.array([xb[0], 0.0, xb[2]], dtype=np.float64)
    n = np.linalg.norm(xz)
    xz = np.array([1.0, 0.0, 0.0]) if n < 1e-6 else xz / n

    up = np.array([0.0, 1.0, 0.0])
    side = np.cross(up, xz)
    sn = np.linalg.norm(side)
    side = -side / sn if sn > 1e-9 else np.array([0.0, 0.0, 1.0])

    pos = np.asarray(pos, dtype=np.float64)
    eye = pos - xz * dist + up * height + side * lateral
    # eye 沉入地面时抬到安全高度（低空平视时可能贴地）
    if eye[1] < 1.0:
        eye = eye.copy()
        eye[1] = 1.0
    target = pos + xz * 12.0
    return eye, target, dist


# ---------------------------------------------------------------------------
# 模型解析（默认 airplane.glb + 程序化盒体兜底；显式 --gl-model 失败即报错）
# ---------------------------------------------------------------------------

@dataclass
class GLConfig:
    """GL 渲染途径的参数集合（sim_service.py CLI -> 本模块的传输对象）。"""
    model: str | None = None
    model_fwd: str = "-x"   # airplane.glb 实测：垂尾在 +x 端、机头在 -x
    model_up: str = "+y"
    model_rot: tuple = (0.0, 0.0, 0.0)
    model_scale: float = 0.0
    model_center: str = "bbox"
    trail: bool = True
    trail_state: str = "alt"
    trail_width: float = 4.0
    grid: float = 25.0
    vert: float | None = None       # None：fixed 默认 3.0 / chase、chase2 默认 1.0
    skybox: bool = True             # 是否使用等距柱状环境贴图（默认开，关则渐变天空）
    gl_backend: str | None = None
    shader_dir: str | None = None


def resolve_parts(glider, cfg: GLConfig, log=print) -> list[Mesh]:
    """加载并归一化模型部件：轴转换 + 微调 + 联合包围盒居中 + 缩放到机身长度。

    - 默认（未显式指定 ``cfg.model``）：``assets/airplane.glb``，缺失/失败时
      警告并回退程序化盒体（尺寸与机身一致，无需归一化）；
    - 显式指定的模型加载失败：直接抛错退出（不静默换模型，姿态问题要显式暴露）。
    """
    path = cfg.model
    if not path:
        path = DEFAULT_MODEL_GLB if os.path.isfile(DEFAULT_MODEL_GLB) else None
    if path:
        try:
            ext = os.path.splitext(path)[1].lower()
            if ext in (".glb", ".gltf"):
                parts = load_glb_parts(path)
            else:
                parts = [load_obj(path)]
            conv = axis_conv(cfg.model_fwd, cfg.model_up)
            parts = fit_parts(parts, glider.length, rot_deg=cfg.model_rot,
                              scale=cfg.model_scale, conv=conv,
                              center=cfg.model_center)
            n_tris = sum(p.triangle_count for p in parts)
            log(f"[gl] loaded model: {os.path.basename(path)} ({n_tris} tris), "
                f"fwd={cfg.model_fwd} up={cfg.model_up}, "
                f"scale={'auto' if cfg.model_scale <= 0 else cfg.model_scale}, "
                f"center={cfg.model_center}")
            return parts
        except Exception as exc:  # noqa: BLE001
            if cfg.model:
                raise
            log(f"[gl] 默认模型加载失败（{path}），改用程序化网格：{exc}")
    mesh = procedural_mesh(glider)
    log(f"[gl] 使用程序化网格（{mesh.triangle_count} tris）")
    return [mesh]


# ---------------------------------------------------------------------------
# 姿态自检（纯 numpy + glm，不建 GL 上下文）
# ---------------------------------------------------------------------------

def _axis_parse(tok: str) -> np.ndarray:
    t = str(tok).strip().lower()
    v = np.zeros(3, dtype=np.float64)
    v["xyz".index(t[1])] = 1.0 if t[0] == "+" else -1.0
    return v


def pose_check(model_fwd: str = "+x", model_up: str = "+y",
               model_rot=(0.0, 0.0, 0.0), tol: float = 1e-9,
               progress=print) -> int:
    """姿态链路端到端自检："一定要处理好姿态"的保险栓。

    断言（float64 全链，容差 ``tol``）：
        渲染链 ``T(pos)·R_glm(quat)·S(k) @ (rot_total @ model_axis)``
        == 物理链 ``pos + k · quat_rotate(quat, rot_total @ model_axis)``

    即 glm 的 ``mat4_cast``（渲染矩阵）与 ``spatial`` 的四元数旋转（物理积分
    同源）在四个规范姿态（level / pitch20 / bank30 / yaw90）× 三轴（机头/上/
    右翼）上逐项一致；同时打印 float32 上传路径（真实渲染精度，~1e-4）。
    返回失败项数（0 = 全过）。
    """
    import glm

    conv = axis_conv(model_fwd, model_up)
    from gl_math import mat4_rot_xyz
    rot_total = np.asarray(mat4_rot_xyz(model_rot), dtype=np.float64)[:3, :3] @ conv

    f_raw, u_raw = _axis_parse(model_fwd), _axis_parse(model_up)
    r_raw = np.cross(f_raw, u_raw)
    axes = (("nose", f_raw), ("up", u_raw), ("wing", r_raw))

    progress(f"[pose-check] 轴转换：fwd={model_fwd} up={model_up} "
             f"rot={tuple(float(d) for d in model_rot)}")
    for label, raw in axes:
        v = rot_total @ raw
        progress(f"  model {label:4s} -> 机体 [{v[0]:+.3f}, {v[1]:+.3f}, {v[2]:+.3f}]")

    pos = np.array([1500.0, 120.0, -300.0])
    k = 2.5
    fails = 0
    progress("[pose-check] 渲染链 vs 物理链（float64，容差 1e-9）")
    for name, q in POSE_SETS.items():
        gq = glm.dquat(float(q[3]), float(q[0]), float(q[1]), float(q[2]))
        M = glm.translate(glm.dmat4(1.0), glm.dvec3(*pos)) \
            * glm.mat4_cast(gq) * glm.scale(glm.dmat4(1.0), glm.dvec3(k))
        for label, raw in axes:
            v_fit = rot_total @ raw
            h = M * glm.dvec4(float(v_fit[0]), float(v_fit[1]), float(v_fit[2]), 1.0)
            got = np.array([h.x / h.w, h.y / h.w, h.z / h.w])
            want = quat_rotate(q, rot_total @ raw) * k + pos
            err = float(np.max(np.abs(got - want)))
            ok = err <= tol
            fails += 0 if ok else 1
            progress(f"  {name:8s} {label:4s} err={err:.2e} {'OK' if ok else 'FAIL'}"
                     f"  got={np.round(got, 6).tolist()}")
        # float32 上传路径（真实渲染精度，仅展示）
        m32 = mat4_from_pos_quat_scale(pos, q, k, None)
        v_fit = rot_total @ f_raw
        got32 = transform_points(m32, v_fit.reshape(1, 3))[0]
        want32 = quat_rotate(q, rot_total @ f_raw) * k + pos
        progress(f"  {name:8s} float32 上传路径 err={np.max(np.abs(got32 - want32)):.2e}"
                 " （展示，不计失败）")
    progress(f"[pose-check] {'全部通过' if fails == 0 else f'{fails} 项失败'}")
    return fails


# ---------------------------------------------------------------------------
# FrameSink：帧缓冲与呈现解耦（新增呈现方式只需实现此协议）
# ---------------------------------------------------------------------------

class FrameSink:
    """呈现协议：只消费 ``renderer`` 的 lit FBO，不触碰管线内部。"""

    def open(self, width: int, height: int, fps: float):  # noqa: ARG002
        self.done = False

    def submit(self, renderer, state: dict):
        raise NotImplementedError

    def close(self):
        pass


class VideoSink(FrameSink):
    """MP4 输出（imageio-ffmpeg，参数与 mpl 路径 make_video 一致）。"""

    def __init__(self, out_path: str, codec: str = "libx264", quality: int = 6):
        self.out_path = out_path
        self.codec = codec
        self.quality = quality
        self.writer = None

    def open(self, width, height, fps):
        super().open(width, height, fps)
        import imageio.v2 as imageio
        self.writer = imageio.get_writer(
            self.out_path, fps=fps, codec=self.codec, quality=self.quality,
            pixelformat="yuv420p", macro_block_size=None)

    def submit(self, renderer, state):
        img = renderer.read_pixels()
        if state.get("hud_text"):
            img = draw_hud(img, state["hud_text"])
        self.writer.append_data(np.ascontiguousarray(img))

    def close(self):
        if self.writer is not None:
            self.writer.close()
            self.writer = None


class PngSink(FrameSink):
    """单帧 PNG（``--gl-preview``：最快迭代环）。"""

    def __init__(self, out_path: str):
        self.out_path = out_path

    def submit(self, renderer, state):
        from PIL import Image
        img = renderer.read_pixels()
        if state.get("hud_text"):
            img = draw_hud(img, state["hud_text"])
        Image.fromarray(img).save(self.out_path)
        self.done = True


class WindowSink(FrameSink):
    """原生 glfw 实时窗口（``--gl-live``）：blit lit FBO -> 屏幕，按 fps 节拍。

    需要 renderer 以 ``visible=True``（glfw 窗口上下文）创建；ESC / 关窗退出。
    """

    def __init__(self, fps: float = 15.0):
        self.fps = float(fps)
        self._t0 = None
        self._frame = 0

    def submit(self, renderer, state):
        handle = renderer.handle
        if handle.win is None or handle.glfw is None:
            raise GLContextError("--gl-live 需要 glfw 可见窗口上下文（renderer 未以 visible=True 创建）")
        glfw = handle.glfw
        renderer.blit_to_screen()
        glfw.swap_buffers(handle.win)
        glfw.poll_events()
        if (glfw.window_should_close(handle.win)
                or glfw.get_key(handle.win, glfw.KEY_ESCAPE) == glfw.PRESS):
            self.done = True
            return
        # 实时节拍
        import time
        if self._t0 is None:
            self._t0 = time.perf_counter()
        target = self._t0 + self._frame / self.fps
        now = time.perf_counter()
        if now < target:
            time.sleep(target - now)
        self._frame += 1


# ---------------------------------------------------------------------------
# 播放循环（相机 / 取景 / 拖尾 / HUD / --gl-vert 场景缩放，VideoSink 复用旧实现）
# ---------------------------------------------------------------------------

def _playback(tele, renderer: DeferredRenderer, sink: FrameSink, *,
              fps: float = 15.0, camera: str = "fixed", cfg_view=None, hud: bool = False,
              start: float = 0.0, end=None, pose_set: str | None = None,
              t_preview: float = 0.0, progress=None):
    cfg_view = {} if cfg_view is None else dict(cfg_view)
    times = np.asarray(tele["t"], dtype=np.float64)
    scale = float(cfg_view.get("scale", 6.0 if camera == "fixed" else 1.0))
    vert = cfg_view.get("vert")
    if vert is None:
        vert = 3.0 if camera == "fixed" else 1.0
    vert = max(float(vert), 1e-6)

    pos_arr = np.asarray(tele["pos"], dtype=np.float64)
    pos_view = pos_arr.copy()
    if camera == "fixed":
        bounds = _flight_view_bounds(tele)
        # --gl-vert：场景级 y 缩放（等效非均匀视图），姿态（旋转）保持物理正确
        cam_bounds = bounds if vert == 1.0 else (
            bounds[0], bounds[1], bounds[2], bounds[3] * vert, bounds[4], bounds[5])
        if vert != 1.0:
            pos_view[:, 1] *= vert
        eye, target, dist = fixed_camera(cam_bounds, renderer.width / float(renderer.height))
        renderer.set_camera(eye, target, (0.0, 1.0, 0.0), float(np.radians(45.0)),
                            max(1.0, dist * 0.01), max(100.0, dist * 10.0))
    renderer.set_markers([pos_view[0], pos_view[-1]], scale=scale)

    trail_n = max(20, int(cfg_view.get("trail", MAX_TRAIL_POINTS)))
    alt_arr = np.asarray(tele["alt"], dtype=np.float64)
    alt_lo, alt_hi = float(alt_arr.min()), float(alt_arr.max())

    # 帧序列：pose_set -> 单帧静态姿态；否则按 start/end/fps 取全程
    quat_fix = POSE_SETS.get(pose_set) if pose_set else None
    if pose_set and quat_fix is None:
        raise ValueError(f"未知姿态集 {pose_set!r}，可选：{sorted(POSE_SETS)}")
    if quat_fix is not None or isinstance(sink, PngSink):
        idx = int(np.clip(np.searchsorted(times, t_preview), 0, len(times) - 1))
        frames = [(float(times[idx]), idx)]
    else:
        if end is None:
            end = float(times[-1])
        n_frames = int(round((end - start) * fps))
        frames = []
        for k in range(n_frames):
            t = start + k / fps
            idx = int(np.clip(np.searchsorted(times, t), 0, len(times) - 1))
            frames.append((t, idx))

    sink.open(renderer.width, renderer.height, fps)
    try:
        for i, (t, idx) in enumerate(frames):
            pos = pos_view[idx]
            quat = quat_fix if quat_fix is not None \
                else np.asarray(tele["quat"][idx], dtype=np.float64)
            if camera == "chase2":
                eye, target, dist = chase2_camera(pos, quat, cfg_view)
                renderer.set_camera(eye, target, (0.0, 1.0, 0.0), float(np.radians(45.0)),
                                    max(1.0, dist * 0.01), max(100.0, dist * 10.0))
            elif camera != "fixed":
                eye, target, dist = chase_camera(pos, quat, cfg_view)
                renderer.set_camera(eye, target, (0.0, 1.0, 0.0), float(np.radians(45.0)),
                                    max(1.0, dist * 0.01), max(100.0, dist * 10.0))
            if renderer.trail_width and idx > 0:
                lo = max(0, idx - trail_n)
                renderer.set_trail(pos_view[lo:idx + 1],
                                   _trail_colors(alt_arr[lo:idx + 1], alt_lo, alt_hi,
                                                 cfg_view.get("trail_state", "alt")))
            else:
                renderer.set_trail(np.zeros((0, 3)), None)
            renderer.set_aircraft(pos, quat, scale)
            renderer.render_frame()
            sink.submit(renderer, {
                "t": t, "idx": idx,
                "hud_text": _hud_text(tele, idx) if hud else ""})
            if progress and (i % max(1, len(frames) // 10) == 0 or i + 1 == len(frames)):
                progress(f"[gl] frame {i + 1}/{len(frames)} t={t:.1f}s")
            if sink.done:
                break
    finally:
        sink.close()


# ---------------------------------------------------------------------------
# 公开入口（签名风格对齐 render.make_video）
# ---------------------------------------------------------------------------

def make_video_gl(tele, glider, out_path: str, fps: float = 15, start: float = 0.0,
                  end=None, cfg_view=None, progress=print, hud: bool = False,
                  camera: str = "fixed", size=(1280, 720), codec: str = "libx264",
                  quality: int = 6, cfg: GLConfig | None = None) -> str:
    """OpenGL 延迟渲染飞行回放 MP4（取帧/帧率/编码与 ``render.make_video`` 一致）。

    无法创建 GL 上下文 / 缺少编码依赖时抛异常，由调用方（sim_service）回退 mpl。
    """
    cfg = cfg or GLConfig()
    try:
        import imageio.v2 as imageio  # noqa: F401
        import imageio_ffmpeg  # noqa: F401
    except Exception as exc:  # noqa: BLE001
        raise ImportError("缺少视频编码依赖 imageio-ffmpeg：请先 pip install imageio-ffmpeg") from exc

    parts = resolve_parts(glider, cfg, log=progress or print)
    renderer = DeferredRenderer(size[0], size[1], parts, shader_dir=cfg.shader_dir,
                                gl_backend=cfg.gl_backend, trail_width=cfg.trail_width,
                                skybox=cfg.skybox)
    if progress:
        progress(f"[gl] 上下文：{renderer.handle.kind} | {renderer.info}")
    try:
        renderer.set_grid(cfg.grid)
        sink = VideoSink(out_path, codec=codec, quality=quality)
        _playback(tele, renderer, sink, fps=fps, camera=camera, cfg_view=cfg_view,
                  hud=hud, start=start, end=end, progress=progress)
    finally:
        renderer.close()
    return out_path


def preview_png(tele, glider, out_path: str, t: float = 0.0, pose_set: str | None = None,
                cfg_view=None, camera: str = "fixed", size=(1280, 720),
                cfg: GLConfig | None = None, progress=print, hud: bool = True) -> str:
    """单帧 PNG 预览（``--gl-preview [t] [--gl-pose-set ...]``，最快迭代环）。"""
    cfg = cfg or GLConfig()
    parts = resolve_parts(glider, cfg, log=progress or print)
    renderer = DeferredRenderer(size[0], size[1], parts, shader_dir=cfg.shader_dir,
                                gl_backend=cfg.gl_backend, trail_width=cfg.trail_width,
                                skybox=cfg.skybox)
    if progress:
        progress(f"[gl] 上下文：{renderer.handle.kind} | {renderer.info}")
    try:
        renderer.set_grid(cfg.grid)
        sink = PngSink(out_path)
        _playback(tele, renderer, sink, camera=camera, cfg_view=cfg_view, hud=hud,
                  pose_set=pose_set, t_preview=t, progress=progress)
    finally:
        renderer.close()
    return out_path


def live_window(tele, glider, fps: float = 15.0, cfg_view=None,
                camera: str = "chase", size=(1024, 576),
                cfg: GLConfig | None = None, progress=print) -> None:
    """原生 glfw 实时窗口（``--gl-live``）：按 fps 节拍播放全程，ESC / 关窗退出。"""
    cfg = cfg or GLConfig()
    parts = resolve_parts(glider, cfg, log=progress or print)
    renderer = DeferredRenderer(size[0], size[1], parts, shader_dir=cfg.shader_dir,
                                gl_backend="glfw", visible=True,
                                trail_width=cfg.trail_width)
    if progress:
        progress(f"[gl] 上下文：{renderer.handle.kind} | {renderer.info}")
    try:
        renderer.set_grid(cfg.grid)
        sink = WindowSink(fps=fps)
        _playback(tele, renderer, sink, camera=camera, cfg_view=cfg_view,
                  progress=progress)
    finally:
        renderer.close()
