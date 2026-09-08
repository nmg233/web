"""render.py — 3D 可视化：把滑翔机渲染成简单 3D 盒体模型 + 航迹 + 地面。

用 matplotlib（任何环境都能跑，含无显示器 headless），把机体坐标变换到
“追逐相机”坐标系后绘制，输出 PNG 帧 / GIF / MP4。

render_frames() 的输入 tele 来自 sim_core.run_flight()。
"""

from __future__ import annotations

import os

import numpy as np

from spatial import quat_to_matrix


# ---------------------------------------------------------------------------
# 盒体几何
# ---------------------------------------------------------------------------

def _box_faces(center, half):
    """返回一个盒子的 6 个四边形面（每面 4 顶点，机体系局部坐标）。"""
    c = np.asarray(center, dtype=float)
    h = np.asarray(half, dtype=float)
    axes = [np.array([1.0, 0.0, 0.0]),
            np.array([0.0, 1.0, 0.0]),
            np.array([0.0, 0.0, 1.0])]
    faces = []
    for i in range(3):
        for s in (1.0, -1.0):
            n = axes[i] * s                    # 面法向
            js = [j for j in range(3) if j != i]
            e0, e1 = axes[js[0]], axes[js[1]]
            # 沿两个面内轴按顺序取角点，保证是简单四边形
            corners = []
            for (s0, s1) in ((1, 1), (-1, 1), (-1, -1), (1, -1)):
                corners.append(c + n * h[i] + e0 * (s0 * h[js[0]]) + e1 * (s1 * h[js[1]]))
            faces.append(np.array(corners))
    return faces


# ---------------------------------------------------------------------------
# 追逐相机
# ---------------------------------------------------------------------------

def chase_view_matrix(eye, target, up=(0.0, 1.0, 0.0)):
    """返回 3x3（world->cam）旋转，把点变换到相机系：x 右、y 上、z 纵深。"""
    f = np.asarray(target, dtype=float) - np.asarray(eye, dtype=float)
    fn = np.linalg.norm(f)
    if fn < 1e-9:
        f = np.array([0.0, 0.0, -1.0])
    else:
        f = f / fn
    up = np.asarray(up, dtype=float)
    r = np.cross(f, up)
    rn = np.linalg.norm(r)
    if rn < 1e-9:
        r = np.array([1.0, 0.0, 0.0])
    else:
        r = r / rn
    u = np.cross(r, f)
    return np.stack([r, u, f], axis=0)   # 行 = 相机基向量


def to_cam(R_vm, eye, pts):
    """将世界点（N,3）转到相机系。"""
    pts = np.asarray(pts, dtype=float).reshape(-1, 3)
    return (R_vm @ (pts - np.asarray(eye, dtype=float)).T).T


# ---------------------------------------------------------------------------
# 场景绘制
# ---------------------------------------------------------------------------

class GliderArtist:
    """把机体部件画到给定 matplotlib 3D 轴上。"""

    def __init__(self, glider):
        self.glider = glider
        self._face_cache = None

    def _parts_world(self, pos, quat, cam_R, cam_eye, Rv=None):
        """返回相机系下的 (faces_arrays, colors)。"""
        if self._face_cache is None:
            self._face_cache = []
            for _name, center, half, rgba in self.glider.parts():
                self._face_cache.append((_box_faces(center, half), rgba))
        R = quat_to_matrix(quat)
        out = []
        cols = []
        for faces_local, rgba in self._face_cache:
            pts_all = []
            for fl in faces_local:
                pts_all.extend(fl)
            arr = np.array(pts_all)
            world = (R @ arr.T).T + pos
            if Rv is not None:
                world = (Rv @ (world - cam_eye).T).T
            out.append(world)
            cols.append(rgba)
        return out, cols

    def draw(self, ax, pos, quat, tf):
        import matplotlib.pyplot as plt
        from mpl_toolkits.mplot3d.art3d import Poly3DCollection
        if self._face_cache is None:
            self._face_cache = []
            for _name, center, half, rgba in self.glider.parts():
                self._face_cache.append((_box_faces(center, half), rgba))
        R = quat_to_matrix(quat)
        seg = 6
        for bi, (faces_local, col) in enumerate(self._face_cache):
            pts_all = []
            for fl in faces_local:
                pts_all.extend(fl)
            arr = np.array(pts_all)
            world = (R @ arr.T).T + pos
            cam = tf(world)
            fc = [cam[i * 4:(i + 1) * 4] for i in range(seg)]
            coll = Poly3DCollection(fc, facecolors=[col] * seg,
                                    edgecolors=(0, 0, 0, 0.35), linewidths=0.4)
            ax.add_collection3d(coll)


def _ground_patch(glider_pos, size=220.0, spacing=25.0):
    """以滑翔机 x/z 为中心、y=0 的地面网格线（世界系点）。"""
    x0 = np.floor((glider_pos[0] - size / 2) / spacing) * spacing
    z0 = np.floor((glider_pos[2] - size / 2) / spacing) * spacing
    lines = []
    x = x0
    while x <= glider_pos[0] + size / 2:
        lines.append([(x, 0.0, z0), (x, 0.0, z0 + size)])
        x += spacing
    z = z0
    while z <= glider_pos[2] + size / 2:
        lines.append([(z0, 0.0, z), (z0 + size, 0.0, z)])
        z += spacing
    return lines


def draw_scene(ax, tele, idx, glider, cfg_view):
    """在世界系画第 idx 帧（追逐相机由 cfg_view 控制）。"""
    pos = tele["pos"][idx]
    quat = tele["quat"][idx]
    R = quat_to_matrix(quat)
    xb = R[:, 0]

    # ---- 相机：后上方 3/4 追逐视角 ----
    dist = cfg_view.get("dist", 55.0)
    height = cfg_view.get("height", 34.0)
    lat = cfg_view.get("lateral", 26.0)
    xz = np.array([xb[0], 0.0, xb[2]])
    n = np.linalg.norm(xz)
    if n < 1e-6:
        xz = np.array([1.0, 0.0, 0.0])
    else:
        xz = xz / n
    up = np.array([0.0, 1.0, 0.0])
    side = np.cross(up, xz)
    sn = np.linalg.norm(side)
    side = side / sn if sn > 1e-9 else np.array([0.0, 0.0, 1.0])
    side = -side  # 固定从右侧观察

    cam_eye = (pos - xz * dist + up * height + side * lat)
    target = pos + xz * 8.0
    R_vm = chase_view_matrix(cam_eye, target)
    tc = R_vm @ (target - cam_eye)

    def tf(p):
        p = np.asarray(p, dtype=float).reshape(-1, 3)
        return (R_vm @ (p - cam_eye).T).T - tc

    ax.clear()

    # 地面网格（相机系）
    for seg in _ground_patch(pos, size=cfg_view.get("ground", 300.0),
                             spacing=cfg_view.get("spacing", 30.0)):
        a = tf(np.array(seg))
        ax.plot([a[0, 0], a[1, 0]], [a[0, 1], a[1, 1]], [a[0, 2], a[1, 2]],
                color=(0.45, 0.6, 0.45, 0.5), linewidth=0.6)

    # 航迹
    trail = tele["pos"][max(0, idx - cfg_view.get("trail", 500)):idx + 1]
    if len(trail) > 2:
        tr = tf(trail)
        ax.plot(tr[:, 0], tr[:, 1], tr[:, 2], color=(0.25, 0.45, 0.85, 0.9),
                linewidth=1.8)

    # 滑翔机
    art = cfg_view.setdefault("_artist", GliderArtist(glider))
    art.draw(ax, pos, quat, tf)

    # 显示范围（以滑翔机为中心）
    half = cfg_view.get("view_half", 24.0)
    ax.set_xlim(-half, half)
    ax.set_ylim(-half * 0.55, half)
    ax.set_zlim(-half * 0.5, half * 0.8)
    ax.set_box_aspect((1, 1, 1))
    ax.axis("off")
    ax.view_init(elev=cfg_view.get("elev", 12.0), azim=cfg_view.get("azim", -70.0))
    return ax


def _hud_text(tele, idx):
    """把当前状态拼成 HUD 字符串（英文，避免 CJK 字体问题）。"""
    try:
        t = tele["t"][idx]
        V = tele["V"][idx]
        alt = tele["alt"][idx]
        sink = tele["sink"][idx]
        alpha = np.degrees(tele["alpha"][idx])
        cl = tele["CL"][idx]
        cd = max(tele["CD"][idx], 1e-4)
        ld = cl / cd
        return (
            f"t = {t:5.1f} s    h = {alt:6.0f} m    V = {V:5.1f} m/s\n"
            f"AoA = {alpha:+5.1f} deg    sink = {sink:5.2f} m/s   L/D = {ld:5.1f}"
        )
    except Exception:
        return ""


def _make_figure(figsize=(9.6, 7.2), dpi=110):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from mpl_toolkits.mplot3d import Axes3D  # noqa: F401
    fig = plt.figure(figsize=figsize, dpi=dpi)
    fig.subplots_adjust(left=0.0, right=1.0, bottom=0.0, top=1.0)
    ax = fig.add_subplot(111, projection="3d")
    return fig, ax


def render_frames(tele, glider, out_dir, prefix="frame",
                  fps=30, every=None, start=0.0, end=None, cfg_view=None,
                  progress=print, hud=False):
    """把遥测渲染成 PNG 序列。

    返回帧时间列表。
    """
    cfg_view = {} if cfg_view is None else dict(cfg_view)
    os.makedirs(out_dir, exist_ok=True)
    times = tele["t"]
    if end is None:
        end = float(times[-1])
    n_frames = int(round((end - start) * fps))
    every = max(1, every or 1)
    fig, ax = _make_figure()
    hud_text = fig.text(
        0.035, 0.035, "", fontsize=11.5, va="bottom", ha="left",
        family="monospace", color=(0.02, 0.02, 0.05),
        bbox=dict(fc="white", alpha=0.72, ec="0.75", lw=0.6))
    rendered_times = []
    for k in range(0, n_frames, every):
        t = start + k / fps
        idx = int(np.searchsorted(times, t))
        if idx >= len(times):
            break
        draw_scene(ax, tele, idx, glider, cfg_view)
        if hud:
            hud_text.set_text(_hud_text(tele, idx))
        fname = os.path.join(out_dir, f"{prefix}_{k:05d}.png")
        fig.savefig(fname, bbox_inches="tight", facecolor="white")
        rendered_times.append(t)
        if progress and (k % max(1, n_frames // 10) == 0):
            progress(f"frame {k}/{n_frames}  t={t:.1f}s")
    import matplotlib.pyplot as plt
    plt.close(fig)
    return rendered_times


def make_gif(tele, glider, out_path, fps=30, start=0.0, end=None,
             cfg_view=None, progress=print, hud=False):
    """渲染并保存 GIF（PillowWriter）。"""
    import matplotlib.pyplot as plt
    from matplotlib.animation import PillowWriter

    cfg_view = {} if cfg_view is None else dict(cfg_view)
    times = tele["t"]
    if end is None:
        end = float(times[-1])
    n_frames = int(round((end - start) * fps))
    fig, ax = _make_figure()
    hud_text = fig.text(
        0.035, 0.035, "", fontsize=11.5, va="bottom", ha="left",
        family="monospace", color=(0.02, 0.02, 0.05),
        bbox=dict(fc="white", alpha=0.72, ec="0.75", lw=0.6))
    writer = PillowWriter(fps=fps)

    with writer.saving(fig, out_path, dpi=110):
        for k in range(n_frames):
            t = start + k / fps
            idx = int(np.searchsorted(times, t))
            if idx >= len(times):
                break
            draw_scene(ax, tele, idx, glider, cfg_view)
            if hud:
                hud_text.set_text(_hud_text(tele, idx))
            writer.grab_frame()
            if progress and (k % max(1, n_frames // 10) == 0):
                progress(f"gif frame {k}/{n_frames} t={t:.1f}s")
    plt.close(fig)
    return out_path


def _flight_view_bounds(tele, pad_frac=0.18, min_alt=0.0):
    """固定机位取景范围：覆盖整段飞行走廊（起点到落点/终点），含高度。"""
    pos = np.asarray(tele["pos"])
    xs = pos[:, 0]; ys = pos[:, 1]; zs = pos[:, 2]
    x0, x1 = float(xs.min()), float(xs.max())
    z0, z1 = float(zs.min()), float(zs.max())
    dx = max(x1 - x0, 1e-6); dz = max(z1 - z0, 1e-6)
    if dx < 60.0:
        c = (x0 + x1) / 2; x0 = c - 60; x1 = c + 60; dx = 120.0
    if dz < 60.0:
        c = (z0 + z1) / 2; z0 = c - 60; z1 = c + 60; dz = 120.0
    x0 -= dx * pad_frac; x1 += dx * pad_frac
    z0 -= dz * pad_frac; z1 += dz * pad_frac
    y1 = max(float(ys.max()) * 1.15 + 5.0, 45.0)
    return x0, x1, min_alt, y1, z0, z1


def _u(v):
    """世界 (x, alt, z) -> mpl 布局 (x, z, alt)：把高度放到 mpl 的竖直轴（z-up），
    使地面 (x-z 水平面) 自然平铺在画面下方、飞机向上飞。"""
    return np.asarray(v)[..., [0, 2, 1]]


def draw_glider_world(ax, glider, pos, quat, scale=1.0):
    """在世界系画滑翔机盒体（固定机位用，mpl z-up 布局）。scale>1 放大显示。"""
    from mpl_toolkits.mplot3d.art3d import Poly3DCollection
    R = quat_to_matrix(quat)
    for _name, center, half, rgba in glider.parts():
        faces = _box_faces(np.asarray(center, dtype=float),
                           np.asarray(half, dtype=float) * scale)
        world = [(R @ f.T).T + pos for f in faces]
        coll = Poly3DCollection(_u(world), facecolors=[rgba] * 6,
                                edgecolors=(0, 0, 0, 0.35), linewidths=0.3)
        ax.add_collection3d(coll)


def draw_world_frame(ax, tele, idx, glider, B, cfg_view=None):
    """固定机位第 idx 帧：mpl z-up 布局（x=走廊, y=横侧, z=高度），相机不动、飞机全程可见。

    地面（alt=0 的水平面）位于画面下方，飞机沿走廊飞行、高度向上。"""
    from mpl_toolkits.mplot3d.art3d import Line3DCollection
    cfg_view = {} if cfg_view is None else cfg_view
    x0, x1, alt0, alt1, z0, z1 = B   # B = (x, alt, z) 世界范围
    pos = np.asarray(tele["pos"][idx], dtype=float)   # (x, alt, z)
    quat = np.asarray(tele["quat"][idx], dtype=float)

    ax.clear()
    # 地面网格：世界 (x, 0, z) -> mpl (x, z, 0)
    spacing = float(cfg_view.get("spacing", 80.0))
    gc = cfg_view.get("ground_color", (0.45, 0.6, 0.45, 0.4))
    segs = []
    for xx in np.arange(np.floor(x0 / spacing) * spacing, x1 + spacing, spacing):
        segs.append([(xx, z0, 0.0), (xx, z1, 0.0)])
    for zz in np.arange(np.floor(z0 / spacing) * spacing, z1 + spacing, spacing):
        segs.append([(x0, zz, 0.0), (x1, zz, 0.0)])
    if segs:
        lc = Line3DCollection(segs, colors=[gc] * len(segs), linewidths=0.5)
        ax.add_collection3d(lc)

    # 航迹（截至当前帧）
    trail_n = max(20, int(cfg_view.get("trail", 5000)))
    tr = _u(tele["pos"][max(0, idx - trail_n):idx + 1])
    ax.plot(tr[:, 0], tr[:, 1], tr[:, 2],
            color=cfg_view.get("trail_color", (0.2, 0.45, 0.85, 0.95)), linewidth=1.8)

    # 投放点 / 终点标记
    ax.scatter(*_u(tele["pos"][0]), color=(0.1, 0.6, 0.2), s=16, depthshade=False)
    ax.scatter(*_u(tele["pos"][-1]), color=(0.85, 0.2, 0.2), s=16, depthshade=False)

    # 飞机（世界系盒体，放大显示）
    draw_glider_world(ax, glider, pos, quat,
                      scale=float(cfg_view.get("scale", 6.0)))

    ax.set_xlim(x0, x1)
    ax.set_ylim(z0, z1)
    ax.set_zlim(alt0, alt1)
    ax.axis("off")
    ax.view_init(elev=cfg_view.get("elev", 30.0), azim=cfg_view.get("azim", -90.0))
    return ax


def make_video(tele, glider, out_path, fps=15, start=0.0, end=None,
               cfg_view=None, progress=print, hud=False, camera="fixed",
               figsize=(10.0, 7.5), dpi=100, codec="libx264", quality=6):
    """渲染 MP4 飞行回放（可选 HUD）。camera="chase" 追逐镜头 / "fixed" 固定世界机位。

    与 make_gif 同构：逐帧绘制，把画布 RGBA 交给 ffmpeg 编码为 H.264。
    imageio-ffmpeg 为纯 pip 依赖（自带 ffmpeg 二进制，跨 Windows/Linux），
    无需在系统安装 ffmpeg。未安装时抛 ImportError（调用方可降级跳过视频）。
    """
    try:
        import imageio.v2 as imageio
        import imageio_ffmpeg  # noqa: F401
    except Exception as exc:  # noqa: BLE001
        raise ImportError("缺少视频编码依赖 imageio-ffmpeg：请先 pip install imageio-ffmpeg") from exc

    import matplotlib.pyplot as plt

    cfg_view = {} if cfg_view is None else dict(cfg_view)
    times = tele["t"]
    if end is None:
        end = float(times[-1])
    n_frames = int(round((end - start) * fps))
    fig, ax = _make_figure(figsize, dpi)
    hud_text = fig.text(
        0.035, 0.035, "", fontsize=11.0, va="bottom", ha="left",
        family="monospace", color=(0.02, 0.02, 0.05),
        bbox=dict(fc="white", alpha=0.72, ec="0.75", lw=0.6))

    B = _flight_view_bounds(tele) if camera == "fixed" else None

    w = imageio.get_writer(
        out_path, fps=fps, codec=codec, quality=quality,
        pixelformat="yuv420p", macro_block_size=None)
    try:
        for k in range(n_frames):
            t = start + k / fps
            idx = int(np.searchsorted(times, t))
            if idx >= len(times):
                break
            if camera == "fixed":
                draw_world_frame(ax, tele, idx, glider, B, cfg_view)
            else:
                draw_scene(ax, tele, idx, glider, cfg_view)
            if hud:
                hud_text.set_text(_hud_text(tele, idx))
            fig.canvas.draw()
            rgba = np.asarray(fig.canvas.buffer_rgba())
            w.append_data(rgba[:, :, :3].copy())
            if progress and (k % max(1, n_frames // 10) == 0):
                progress(f"video frame {k}/{n_frames} t={t:.1f}s")
    finally:
        w.close()
        plt.close(fig)
    return out_path
