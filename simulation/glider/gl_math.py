"""gl_math.py — OpenGL 渲染数学：pyGLM（glm）薄适配层。

矩阵运算全部委托 pyGLM（GLM 的 Python 绑定），不自写线性代数。本模块只负责：

1. **约定适配**
   - numpy 行主序 ``(4,4)`` <-> glm 列主序内存；
   - 物理四元数 ``tele["quat"]`` 的 ``(x,y,z,w)`` <-> ``glm.quat`` 的 ``(w,x,y,z)``；
   - 内部用 ``dmat4``（float64）计算，输出仍转 float32 numpy，精度与旧自写实现一致。
2. **接口稳定**
   函数签名 / 语义（角度单位、先应用顺序、返回类型）与历史实现完全一致，
   调用方（gl_mesh / gldeferred）不感知 glm 的存在。

约定
----
- 返回 numpy **行主序** (4,4) float32，``M @ p`` 列向量乘法；
- 上传 GL 走 :func:`gl_bytes`（float32 列主序字节流，moderngl ``uniform.write`` 直用）；
- 角度：入参 ``deg`` 为度，``fovy`` 为弧度；
- ``glm.mat4_cast`` 与 ``spatial.quat_to_matrix`` 的一致性由 ``gldeferred.pose_check``
  做端到端断言（<1e-9），任何约定漂移都会在姿态自检中暴露。
"""

from __future__ import annotations

import numpy as np
import glm


# ---------------------------------------------------------------------------
# numpy <-> glm 转换（唯一的布局魔法所在地）
# ---------------------------------------------------------------------------

def _to_glm(m) -> glm.dmat4:
    """numpy 行主序 (4,4) -> ``glm.dmat4``（float64 列主序）。"""
    arr = np.ascontiguousarray(np.asarray(m, dtype=np.float64).T)
    return glm.dmat4.from_bytes(arr.tobytes())


def _to_np(m: glm.dmat4) -> np.ndarray:
    """``glm.dmat4`` -> numpy 行主序 (4,4) float32。"""
    arr = np.frombuffer(m.to_bytes(), dtype=np.float64).reshape(4, 4).T
    return np.ascontiguousarray(arr, dtype=np.float32)


def _vec3(v) -> glm.dvec3:
    a = np.asarray(v, dtype=np.float64).reshape(3)
    return glm.dvec3(float(a[0]), float(a[1]), float(a[2]))


# ---------------------------------------------------------------------------
# 基础构造
# ---------------------------------------------------------------------------

def mat4_identity() -> np.ndarray:
    return np.eye(4, dtype=np.float32)


def mat4_mul(a, b) -> np.ndarray:
    """矩阵乘 ``a @ b``（先应用 b，再应用 a）。"""
    return _to_np(_to_glm(a) * _to_glm(b))


def mat4_translate(v) -> np.ndarray:
    return _to_np(glm.translate(glm.dmat4(1.0), _vec3(v)))


def mat4_scale(s) -> np.ndarray:
    """尺度矩阵：``s`` 为标量时三轴等比，为长度 3 时逐轴缩放。"""
    arr = np.asarray(s, dtype=np.float64)
    if arr.ndim == 0:
        v = np.full(3, float(arr))
    else:
        v = arr.reshape(3)
    return _to_np(glm.scale(glm.dmat4(1.0),
                            glm.dvec3(float(v[0]), float(v[1]), float(v[2]))))


def mat4_rot_xyz(deg) -> np.ndarray:
    """绕 X、Y、Z 依次旋转（度），等价于 ``Rz @ Ry @ Rx``（先绕 X 转）。"""
    rx, ry, rz = (np.radians(float(d)) for d in np.asarray(deg, dtype=np.float64).reshape(3))
    m = glm.rotate(glm.dmat4(1.0), rz, glm.dvec3(0, 0, 1))
    m = glm.rotate(m, ry, glm.dvec3(0, 1, 0))
    m = glm.rotate(m, rx, glm.dvec3(1, 0, 0))
    return _to_np(m)


def mat4_from_pos_quat_scale(pos, quat, scale=1.0, corr: np.ndarray | None = None) -> np.ndarray:
    """模型矩阵：``T(pos) @ R(quat) @ S(scale) @ corr``。

    ``quat`` 为物理约定 **(x, y, z, w)**（与 ``tele["quat"]`` 一致），内部转
    ``glm.quat(w, x, y, z)`` 后用 ``mat4_cast`` 生成旋转。
    ``corr`` 为模型自身坐标系内的朝向修正矩阵，缺省为单位阵。
    """
    q = np.asarray(quat, dtype=np.float64).reshape(4)
    gq = glm.dquat(float(q[3]), float(q[0]), float(q[1]), float(q[2]))
    m = glm.translate(glm.dmat4(1.0), _vec3(pos))
    m = m * glm.mat4_cast(gq)
    arr = np.asarray(scale, dtype=np.float64)
    if arr.ndim == 0:
        v = np.full(3, float(arr))
    else:
        v = arr.reshape(3)
    m = m * glm.scale(glm.dmat4(1.0),
                      glm.dvec3(float(v[0]), float(v[1]), float(v[2])))
    if corr is not None:
        m = m * _to_glm(corr)
    return _to_np(m)


# ---------------------------------------------------------------------------
# 相机与投影
# ---------------------------------------------------------------------------

def mat4_look_at(eye, target, up) -> np.ndarray:
    """视图矩阵（世界系 -> 相机系）：相机看向 -z，x 右、y 上。"""
    e, t, u = _vec3(eye), _vec3(target), _vec3(up)
    if glm.length(t - e) < 1e-9:                       # 退化保护：视线为零
        t = e + glm.dvec3(0, 0, -1)
    return _to_np(glm.lookAt(e, t, u))


def mat4_perspective(fovy_rad: float, aspect: float, near: float, far: float) -> np.ndarray:
    """透视投影矩阵（相机系 -> 裁剪空间，GL 深度 [-1, 1]）。"""
    aspect = float(aspect) if abs(float(aspect)) > 1e-9 else 1.0
    near = max(float(near), 1e-4)
    far = max(float(far), near * 1.0001)
    fovy = float(fovy_rad)
    fovy = fovy if abs(fovy) > 1e-9 else 1e-6
    m32 = glm.perspective(fovy, aspect, near, far)   # pyGLM 无 double 重载，float32（渲染标准精度）
    arr = np.frombuffer(m32.to_bytes(), dtype=np.float32).reshape(4, 4).T
    return np.ascontiguousarray(arr)


def normal_matrix(model_view: np.ndarray) -> np.ndarray:
    """法线变换矩阵：``transpose(inverse(MV[:3,:3]))``，扩成 4x4 便于统一上传。"""
    try:
        n = glm.transpose(glm.inverse(glm.dmat3(_to_glm(model_view))))
        out = np.array(n, dtype=np.float64)   # pyGLM -> numpy 已是行主序数学矩阵
        if np.isnan(out).any():
            raise ValueError("NaN")
        m = np.eye(4, dtype=np.float32)
        m[:3, :3] = out.astype(np.float32)
        return m
    except Exception:  # noqa: BLE001 奇异矩阵回退单位阵（与旧实现一致）
        return np.eye(4, dtype=np.float32)


def mat4_invert(m: np.ndarray) -> np.ndarray:
    """4x4 矩阵求逆（延迟管线用 ``(proj@view)^-1`` 从 NDC 重构世界射线）。"""
    try:
        inv = glm.inverse(_to_glm(m))
        out = _to_np(inv)
        if np.isnan(out).any():
            raise ValueError("NaN")
        return out
    except Exception:  # noqa: BLE001 奇异矩阵回退单位阵
        return np.eye(4, dtype=np.float32)


# ---------------------------------------------------------------------------
# 上传辅助
# ---------------------------------------------------------------------------

def gl_bytes(m: np.ndarray) -> bytes:
    """把行主序 numpy 矩阵转成 GL 需要的 **float32 列主序** 字节流。

    moderngl 的 ``uniform.write()`` 按 GL 约定解释内存，因此这里必须转置；
    所有 uniform 上传都应经过本函数，调用方无需关心布局。
    """
    arr = np.asarray(m, dtype=np.float32)
    return np.ascontiguousarray(arr.T).tobytes()


def transform_points(m: np.ndarray, pts) -> np.ndarray:
    """用 4x4 矩阵批量变换点集（N,3），返回齐次除法后的 (N,3)。主要用于自检。"""
    pts = np.asarray(pts, dtype=np.float64).reshape(-1, 3)
    hom = np.concatenate([pts, np.ones((len(pts), 1))], axis=1)
    out = hom @ np.asarray(m, dtype=np.float64).T
    w = out[:, 3:4]
    w = np.where(np.abs(w) < 1e-12, 1.0, w)
    return out[:, :3] / w
