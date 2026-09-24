"""gl_mesh.py — OpenGL 渲染用的三角网格：程序化盒体生成 + OBJ/GLB 读取。

坐标约定与 ``aircraft.py`` 一致：机体系 x 前 / y 上 / z 右翼；单位米。

- :func:`procedural_mesh` 把 ``Glider.parts()`` 的每个盒体展开成 12 个三角形，
  在没有任何模型文件时提供可用的默认外观。
- :func:`load_obj` 读取外部飞机模型（支持 ``v`` / ``vn`` / ``f``，含 ``v/vt``、
  ``v//vn``、``v/vt/vn``、负索引、四边形与多边形扇形三角化；无 ``vn`` 时按面法线
  平滑累加生成）。不解析 ``mtllib/usemtl/vt``——渲染走顶点色 + 光照，不做贴图。
- :func:`load_glb_parts` 经 ``trimesh`` 读取 GLB/GLTF，**烘焙场景图节点变换**后
  按部件返回（保留 per-part 材质色 / UV / 贴图），供延迟渲染器分组绘制；
- :func:`axis_conv` / :func:`fit_mesh` / :func:`fit_parts` 负责把任意轴约定的
  模型归一化到机体约定（长度、朝向、原点），这是姿态正确的第一道关口。
"""

from __future__ import annotations

import os
from dataclasses import dataclass

import numpy as np

from gl_math import mat4_rot_xyz

DEFAULT_MODEL_COLOR = (0.82, 0.83, 0.88)


@dataclass
class Mesh:
    """三角网格（顶点属性一一对应，索引为三角形列表）。

    ``uvs`` / ``texture`` 为可选的 GLB 贴图通道：材质带 baseColorTexture 时
    ``uvs`` 为 (N, 2) float32、``texture`` 为 PIL Image（延迟到渲染器建 GL 纹理）。
    """

    positions: np.ndarray   # (N, 3) float32
    normals: np.ndarray     # (N, 3) float32
    colors: np.ndarray      # (N, 3) float32
    indices: np.ndarray     # (M,)   uint32
    uvs: np.ndarray | None = None        # (N, 2) float32
    texture: object | None = None        # PIL Image | None

    @property
    def triangle_count(self) -> int:
        return int(len(self.indices) // 3)

    def interleave(self) -> bytes:
        """按 ``pos(3f) + normal(3f) + color(3f)`` 交错打包，供 VBO 上传。"""
        data = np.concatenate(
            [self.positions, self.normals, self.colors], axis=1
        ).astype(np.float32)
        return np.ascontiguousarray(data).tobytes()

    def interleave_uv(self) -> bytes:
        """按 ``pos(3f) | normal(3f) | color(3f) | uv(2f)`` 交错打包（44 B/顶点）。

        无 UV 时以 0 填充，保证所有网格共用同一字节布局；渲染器按程序实际
        声明的属性取用对应槽位，缺位补 padding（见既往 GLSL 属性裁剪教训）。
        """
        uv = self.uvs if self.uvs is not None and len(self.uvs) == len(self.positions) \
            else np.zeros((len(self.positions), 2), dtype=np.float32)
        data = np.concatenate(
            [self.positions, self.normals, self.colors, uv], axis=1
        ).astype(np.float32)
        return np.ascontiguousarray(data).tobytes()

    def bounds(self) -> tuple[np.ndarray, np.ndarray]:
        return self.positions.min(axis=0), self.positions.max(axis=0)


def _empty() -> Mesh:
    return Mesh(
        positions=np.zeros((0, 3), dtype=np.float32),
        normals=np.zeros((0, 3), dtype=np.float32),
        colors=np.zeros((0, 3), dtype=np.float32),
        indices=np.zeros((0,), dtype=np.uint32),
    )


def _concat(meshes: list[Mesh]) -> Mesh:
    """把多个网格拼成一个（索引整体偏移）。"""
    meshes = [m for m in meshes if len(m.positions)]
    if not meshes:
        return _empty()
    pos, nrm, col, idx = [], [], [], []
    base = 0
    for m in meshes:
        pos.append(m.positions)
        nrm.append(m.normals)
        col.append(m.colors)
        idx.append(m.indices + base)
        base += len(m.positions)
    return Mesh(
        positions=np.concatenate(pos).astype(np.float32),
        normals=np.concatenate(nrm).astype(np.float32),
        colors=np.concatenate(col).astype(np.float32),
        indices=np.concatenate(idx).astype(np.uint32),
    )


# ---------------------------------------------------------------------------
# 程序化盒体
# ---------------------------------------------------------------------------

# 单位立方体的 6 个面，每面 4 个角点（逆时针，法线朝外）+ 面法线
_BOX_FACES = (
    ((0.0, 0.0, 1.0), ((-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1))),
    ((0.0, 0.0, -1.0), ((1, -1, -1), (-1, -1, -1), (-1, 1, -1), (1, 1, -1))),
    ((1.0, 0.0, 0.0), ((1, -1, 1), (1, -1, -1), (1, 1, -1), (1, 1, 1))),
    ((-1.0, 0.0, 0.0), ((-1, -1, -1), (-1, -1, 1), (-1, 1, 1), (-1, 1, -1))),
    ((0.0, 1.0, 0.0), ((-1, 1, 1), (1, 1, 1), (1, 1, -1), (-1, 1, -1))),
    ((0.0, -1.0, 0.0), ((-1, -1, -1), (1, -1, -1), (1, -1, 1), (-1, -1, 1))),
)


def box_mesh(center, half, rgba) -> Mesh:
    """一个轴对齐盒体 -> 12 个三角形（每面独立法线，24 顶点）。"""
    c = np.asarray(center, dtype=np.float32).reshape(3)
    h = np.asarray(half, dtype=np.float32).reshape(3)
    rgb = np.asarray(rgba, dtype=np.float32).reshape(-1)[:3]

    pos, nrm, idx = [], [], []
    for normal, corners in _BOX_FACES:
        n = np.asarray(normal, dtype=np.float32)
        base = len(pos)
        for sx, sy, sz in corners:
            pos.append(c + np.array([sx, sy, sz], dtype=np.float32) * h)
            nrm.append(n)
        idx.extend([base, base + 1, base + 2, base, base + 2, base + 3])

    n_v = len(pos)
    return Mesh(
        positions=np.asarray(pos, dtype=np.float32),
        normals=np.asarray(nrm, dtype=np.float32),
        colors=np.tile(rgb, (n_v, 1)).astype(np.float32),
        indices=np.asarray(idx, dtype=np.uint32),
    )


def procedural_mesh(glider) -> Mesh:
    """由 ``Glider.parts()`` 派生整机网格（默认外观，无需模型文件）。"""
    return _concat([box_mesh(center, half, rgba) for _n, center, half, rgba in glider.parts()])


# ---------------------------------------------------------------------------
# OBJ 读写
# ---------------------------------------------------------------------------

def _newell_normal(pts: np.ndarray) -> np.ndarray:
    """多边形面法线（Newell 法，天然处理非平面多边形）。"""
    n = np.zeros(3, dtype=np.float64)
    m = len(pts)
    for i in range(m):
        a, b = pts[i], pts[(i + 1) % m]
        n[0] += (a[1] - b[1]) * (a[2] + b[2])
        n[1] += (a[2] - b[2]) * (a[0] + b[0])
        n[2] += (a[0] - b[0]) * (a[1] + b[1])
    return n


def load_obj(path: str, color=DEFAULT_MODEL_COLOR) -> Mesh:
    """读取 OBJ 文件为单色 :class:`Mesh`。解析失败/无面时抛 ``ValueError``。"""
    verts: list[list[float]] = []
    norms: list[list[float]] = []
    faces: list[list[tuple[int, int | None]]] = []

    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        for raw in fh:
            line = raw.strip()
            if not line or line[0] == "#":
                continue
            tok = line.split()
            head = tok[0]
            if head == "v" and len(tok) >= 4:
                verts.append([float(tok[1]), float(tok[2]), float(tok[3])])
            elif head == "vn" and len(tok) >= 4:
                norms.append([float(tok[1]), float(tok[2]), float(tok[3])])
            elif head == "f" and len(tok) >= 4:
                face: list[tuple[int, int | None]] = []
                for item in tok[1:]:
                    parts = item.split("/")
                    try:
                        vi = int(parts[0])
                    except ValueError:
                        continue
                    vi = vi - 1 if vi > 0 else len(verts) + vi
                    ni: int | None = None
                    if len(parts) >= 3 and parts[2]:
                        try:
                            raw_ni = int(parts[2])
                            ni = raw_ni - 1 if raw_ni > 0 else len(norms) + raw_ni
                        except ValueError:
                            ni = None
                    face.append((vi, ni))
                if len(face) >= 3:
                    faces.append(face)

    if not verts or not faces:
        raise ValueError(f"OBJ 中未找到有效顶点/面：{path}")

    v_arr = np.asarray(verts, dtype=np.float64)
    n_v = len(v_arr)

    # 校验索引范围，越界的面直接丢弃
    valid_faces = [
        f for f in faces
        if all(0 <= vi < n_v and (ni is None or 0 <= ni < len(norms)) for vi, ni in f)
    ]
    if not valid_faces:
        raise ValueError(f"OBJ 面索引越界：{path}")

    # 无 vn 时：按面法线对共享顶点平滑累加
    if not norms:
        acc = np.zeros((n_v, 3), dtype=np.float64)
        for face in valid_faces:
            pts = v_arr[[vi for vi, _ in face]]
            acc[[vi for vi, _ in face]] += _newell_normal(pts)
        ln = np.linalg.norm(acc, axis=1, keepdims=True)
        acc = np.divide(acc, np.where(ln < 1e-12, 1.0, ln))
        acc[ln[:, 0] < 1e-12] = np.array([0.0, 1.0, 0.0])
        n_arr = acc
    else:
        n_arr = np.asarray(norms, dtype=np.float64)

    # 按 (顶点, 法线) 去重，拼装非索引顶点表 + 三角形索引
    keymap: dict[tuple[int, int], int] = {}
    out_pos: list[np.ndarray] = []
    out_nrm: list[np.ndarray] = []
    out_idx: list[int] = []

    def resolve(vi: int, ni: int | None) -> int:
        n_idx = ni if ni is not None else vi      # 平滑法线时法线与顶点同号
        key = (vi, n_idx)
        got = keymap.get(key)
        if got is None:
            got = len(out_pos)
            out_pos.append(v_arr[vi])
            out_nrm.append(n_arr[n_idx])
            keymap[key] = got
        return got

    for face in valid_faces:
        a = resolve(*face[0])
        for k in range(1, len(face) - 1):
            out_idx.extend([a, resolve(*face[k]), resolve(*face[k + 1])])

    rgb = np.asarray(color, dtype=np.float32).reshape(-1)[:3]
    pos_f = np.asarray(out_pos, dtype=np.float32)
    nrm_f = np.asarray(out_nrm, dtype=np.float32)
    return Mesh(
        positions=pos_f,
        normals=nrm_f,
        colors=np.tile(rgb, (len(pos_f), 1)).astype(np.float32),
        indices=np.asarray(out_idx, dtype=np.uint32),
    )


def _factor_rgb(factor) -> np.ndarray | None:
    """PBR ``baseColorFactor`` -> RGB（0-1）。trimesh 有的版本返回 0-255，这里统一归一。"""
    if factor is None:
        return None
    arr = np.asarray(factor, dtype=np.float64).reshape(-1)
    if arr.size < 3:
        return None
    rgb = arr[:3].copy()
    if rgb.max() > 1.0 + 1e-6:
        rgb = rgb / 255.0
    return np.clip(rgb, 0.0, 1.0).astype(np.float32)


def _glb_part_visual(visual, n_verts: int, fallback):
    """从 trimesh ``visual`` 提取 ``(colors, uvs, texture)``。

    颜色优先级：baseColorTexture（贴图存进 :attr:`Mesh.texture`，颜色槽填
    baseColorFactor 作 tint）> baseColorFactor > 顶点色 > 统一 ``fallback``。
    ``TextureVisuals`` 没有 ``vertex_colors``（既往教训），故逐项探测。
    """
    material = getattr(visual, "material", None)

    colors: np.ndarray | None = None
    uvs: np.ndarray | None = None
    texture = None

    if material is not None:
        tex = getattr(material, "baseColorTexture", None)
        if tex is not None and np.asarray(tex).size > 0:
            raw_uv = getattr(visual, "uv", None)
            if raw_uv is not None and len(raw_uv) == n_verts:
                texture = tex                       # PIL Image，延迟到渲染器建 GL 纹理
                uvs = np.asarray(raw_uv, dtype=np.float32)
                tint = _factor_rgb(getattr(material, "baseColorFactor", None))
                if tint is None:
                    tint = np.ones(3, dtype=np.float32)
                colors = np.tile(tint, (n_verts, 1))
        if colors is None:
            factor = _factor_rgb(getattr(material, "baseColorFactor", None))
            if factor is not None:
                colors = np.tile(factor, (n_verts, 1))

    if colors is None:
        vc = getattr(visual, "vertex_colors", None)
        if vc is not None and len(vc) == n_verts:
            colors = np.asarray(vc, dtype=np.float32)[:, :3] / 255.0

    if colors is None:
        rgb0 = np.asarray(fallback, dtype=np.float32).reshape(-1)[:3]
        colors = np.tile(rgb0, (n_verts, 1))

    return colors.astype(np.float32), uvs, texture


def load_glb_parts(path: str, color=DEFAULT_MODEL_COLOR) -> list[Mesh]:
    """读取 GLB / GLTF 为**部件网格列表**（经 ``trimesh``）。

    - 节点变换：``Scene.dump(concatenate=False)`` 把场景图变换烘焙进顶点，
      规避直接取 ``geometry.values()`` 只拿局部坐标的姿态隐患；
      （``concatenate=True`` 会触发 trimesh.path.packing 导入，既往沙箱教训，不用）
    - 颜色 / UV / 贴图：见 :func:`_glb_part_visual`；
    - 法线：优先 GLB 自带 ``vertex_normals``，缺失时按面法线累加平滑
      （与 :func:`load_obj` 一致）；
    - 单位 / 朝向未知：由调用方 :func:`fit_parts` / :func:`fit_mesh` 归一化。
    """
    import trimesh  # 懒加载：无 trimesh 时仅 OBJ/程序化网格可用

    loaded = trimesh.load(path, force=None, process=False)
    if isinstance(loaded, trimesh.Scene):
        geoms = loaded.dump(concatenate=False)
        if isinstance(geoms, trimesh.Trimesh):
            geoms = [geoms]
    else:
        geoms = [loaded]
    geoms = [g for g in geoms
             if getattr(g, "faces", None) is not None and len(g.faces)
             and getattr(g, "vertices", None) is not None and len(g.vertices)]
    if not geoms:
        raise ValueError(f"GLB 中未找到有效网格：{path}")

    meshes: list[Mesh] = []
    for g in geoms:
        v = np.asarray(g.vertices, dtype=np.float32)
        f = np.asarray(g.faces, dtype=np.uint32)
        n = getattr(g, "vertex_normals", None)
        if n is None or np.asarray(n).shape[0] != len(v):   # 无法线：累加平滑分摊
            tn = getattr(g, "triangle_normals", None)
            tri = np.asarray(tn, dtype=np.float64) if tn is not None else None
            if tri is None or tri.shape != (len(f), 3):
                tri = _face_normals(f, v)
            acc = np.zeros((len(v), 3), dtype=np.float64)
            acc_rep = np.repeat(tri, 3, axis=0)
            np.add.at(acc, f.ravel(), acc_rep)
            ln = np.linalg.norm(acc, axis=1, keepdims=True)
            n = np.divide(acc, np.where(ln < 1e-12, 1.0, ln)).astype(np.float32)
        else:
            n = np.asarray(n, dtype=np.float32)

        colors, uvs, texture = _glb_part_visual(getattr(g, "visual", None), len(v), color)
        meshes.append(Mesh(
            positions=v,
            normals=n.astype(np.float32),
            colors=colors,
            indices=f.astype(np.uint32),
            uvs=uvs,
            texture=texture,
        ))
    return meshes


def _face_normals(faces, verts):
    """按面计算单位法线（用于无法线、无 triangle_normals 时的兜底）。"""
    v = verts[faces]
    n = np.cross(v[:, 1] - v[:, 0], v[:, 2] - v[:, 0]).astype(np.float64)
    ln = np.linalg.norm(n, axis=1, keepdims=True)
    return np.divide(n, np.where(ln < 1e-12, 1.0, ln))


def mesh_to_obj(mesh: Mesh, path: str) -> str:
    """把网格写成 OBJ（仅用于验证/调试：导出程序化网格后可再读回比对）。"""
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("# generated by gl_mesh.mesh_to_obj\n")
        for p in mesh.positions:
            fh.write(f"v {p[0]:.6f} {p[1]:.6f} {p[2]:.6f}\n")
        for n in mesh.normals:
            fh.write(f"vn {n[0]:.6f} {n[1]:.6f} {n[2]:.6f}\n")
        for i in range(0, len(mesh.indices), 3):
            tri = [int(mesh.indices[i + k]) + 1 for k in range(3)]
            fh.write("f " + " ".join(f"{t}//{t}" for t in tri) + "\n")
    return path


# ---------------------------------------------------------------------------
# 归一化（任意轴约定的模型 -> 机体约定）
# ---------------------------------------------------------------------------

_AXIS_INDEX = {"x": 0, "y": 1, "z": 2}


def _axis_vec(tok: str) -> np.ndarray:
    """``"+x"`` / ``"-z"`` 之类的轴描述 -> 单位向量。"""
    t = str(tok).strip().lower()
    if len(t) != 2 or t[0] not in "+-" or t[1] not in _AXIS_INDEX:
        raise ValueError(f"轴描述应为 '+x'/'-z' 之类，收到：{tok!r}")
    v = np.zeros(3, dtype=np.float64)
    v[_AXIS_INDEX[t[1]]] = 1.0 if t[0] == "+" else -1.0
    return v


def axis_conv(fwd: str, up: str) -> np.ndarray:
    """模型轴约定 -> 3x3 轴转换矩阵（把模型自身的"前/上"对到机体 +x/+y）。

    例：模型 +Z 为机头、+Y 为上时用 ``axis_conv("+z", "+y")``。
    返回 ``R``，满足 ``R @ fwd_hat = e_x``（机头对到机体 +x）、
    ``R @ up_hat = e_y``、``R @ (fwd × up) = e_z``（右手系闭合）。
    """
    f = _axis_vec(fwd)
    u = _axis_vec(up)
    if abs(float(np.dot(f, u))) > 1e-9:
        raise ValueError(f"前向 {fwd!r} 与上向 {up!r} 不能平行")
    r = np.cross(f, u)
    # 列 [f u r] 的矩阵把 e_x->f / e_y->u / e_z->r；转置即逆映射 f->e_x / u->e_y / r->e_z
    return np.stack([f, u, r], axis=1).T


def _fit_rot(rot_deg, conv) -> np.ndarray:
    """总旋转 = rot_xyz(rot_deg) @ conv：先做轴对齐（conv），再做微调（rot_deg）。"""
    rot = np.asarray(mat4_rot_xyz(rot_deg), dtype=np.float64)[:3, :3]
    if conv is not None:
        rot = rot @ np.asarray(conv, dtype=np.float64).reshape(3, 3)
    return rot


def _fit_metrics(meshes: list[Mesh], rot: np.ndarray, target_len: float,
                 scale: float, center: str):
    """联合包围盒 -> (平移中心 c, 缩放 s)。多部件按整体包围盒算，避免各自归一化后散架。"""
    pos_all = np.concatenate(
        [m.positions.astype(np.float64) @ rot.T for m in meshes], axis=0
    )
    lo, hi = pos_all.min(axis=0), pos_all.max(axis=0)
    if center == "origin":
        c = np.zeros(3)
    else:  # "bbox"（默认）
        c = 0.5 * (lo + hi)
    if scale > 0:
        s = float(scale)
    else:
        longest = float((hi - lo).max())
        s = float(target_len) / longest if longest > 1e-9 else 1.0
    return c, s


def _apply_fit(mesh: Mesh, rot: np.ndarray, c: np.ndarray, s: float) -> Mesh:
    pos = mesh.positions.astype(np.float64) @ rot.T
    pos = (pos - c) * s
    nrm = mesh.normals.astype(np.float64) @ rot.T
    ln = np.linalg.norm(nrm, axis=1, keepdims=True)
    nrm = np.divide(nrm, np.where(ln < 1e-12, 1.0, ln))
    uvs = None
    if mesh.uvs is not None and len(mesh.uvs) == len(mesh.positions):
        uvs = mesh.uvs.astype(np.float32)
    return Mesh(
        positions=pos.astype(np.float32),
        normals=nrm.astype(np.float32),
        colors=mesh.colors,
        indices=mesh.indices,
        uvs=uvs,
        texture=mesh.texture,
    )


def fit_parts(meshes: list[Mesh], target_len: float, rot_deg=(0.0, 0.0, 0.0),
              scale: float = 0.0, conv: np.ndarray | None = None,
              center: str = "bbox") -> list[Mesh]:
    """多部件版归一化：轴转换 + 微调 + **联合包围盒**居中 + 统一缩放。

    - ``conv``：:func:`axis_conv` 的产物（或任意 3x3），先应用（对齐机体轴），
      再应用 ``rot_deg`` 微调（度，X→Y→Z）；
    - ``center``：``"bbox"`` 按所有部件的整体包围盒居中（默认）；
      ``"origin"`` 保持模型原点（模型自带正确重心/锚点时用）；
    - ``scale > 0`` 显式缩放，否则按"整体最长边 = target_len"自动归一化。
    """
    meshes = [m for m in meshes if len(m.positions)]
    if not meshes:
        return []
    rot = _fit_rot(rot_deg, conv)
    c, s = _fit_metrics(meshes, rot, target_len, scale, center)
    return [_apply_fit(m, rot, c, s) for m in meshes]


def fit_mesh(mesh: Mesh, target_len: float, rot_deg=(0.0, 0.0, 0.0),
             scale: float = 0.0, conv: np.ndarray | None = None,
             center: str = "bbox") -> Mesh:
    """单网格归一化（:func:`fit_parts` 的便捷封装）。

    - ``conv``：轴转换矩阵（:func:`axis_conv`），先于 ``rot_deg`` 应用；
    - ``rot_deg``：模型自身坐标系内的朝向微调（度），按 X→Y→Z 依次旋转；
    - ``scale > 0`` 显式缩放，否则按"最长轴 = target_len"自动归一化（应对单位未知）；
    - ``center="bbox"`` 时几何中心与机体原点重合，``"origin"`` 保持模型原点。
    """
    if len(mesh.positions) == 0:
        return mesh
    return fit_parts([mesh], target_len, rot_deg=rot_deg, scale=scale,
                     conv=conv, center=center)[0]
