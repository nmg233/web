"""spatial.py — 最小 6DOF 刚体数学库（纯 numpy，xyzw 四元数，Y-up 世界系）。

被 reference 后端与 aero 气动模型共用；novaPhy 后端只读取/写入状态与力矩，
不依赖本模块积分器（但复用同一套四元数/旋转约定，保证两个后端一致）。
"""

from __future__ import annotations

import numpy as np

# ---------------------------------------------------------------------------
# 四元数（顺序 [x, y, z, w]，即 xyzw；与 novaPhy Transform.rotation / body_q 一致）
# ---------------------------------------------------------------------------


def quat_identity() -> np.ndarray:
    return np.array([0.0, 0.0, 0.0, 1.0], dtype=np.float64)


def quat_normalize(q: np.ndarray) -> np.ndarray:
    q = np.asarray(q, dtype=np.float64)
    n = np.linalg.norm(q)
    return q / n if n > 1e-12 else quat_identity()


def quat_mul(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """返回 a * b（先 b 后 a 的组合旋转，a 作用在 b 之后）。"""
    a = np.asarray(a, dtype=np.float64)
    b = np.asarray(b, dtype=np.float64)
    x1, y1, z1, w1 = a
    x2, y2, z2, w2 = b
    return np.array(
        [
            w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2,
            w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2,
            w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2,
            w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2,
        ]
    )


def quat_conjugate(q: np.ndarray) -> np.ndarray:
    q = np.asarray(q, dtype=np.float64)
    return np.array([-q[0], -q[1], -q[2], q[3]])


def quat_rotate(q: np.ndarray, v: np.ndarray) -> np.ndarray:
    """将向量 v 用单位四元数 q 旋转。"""
    q = quat_normalize(q)
    v = np.asarray(v, dtype=np.float64)
    t = 2.0 * np.cross(q[:3], v)
    return v + q[3] * t + np.cross(q[:3], t)


def quat_from_axis_angle(axis: np.ndarray, angle: float) -> np.ndarray:
    axis = np.asarray(axis, dtype=np.float64)
    n = np.linalg.norm(axis)
    if n < 1e-12:
        return quat_identity()
    axis = axis / n
    half = 0.5 * angle
    s = np.sin(half)
    return np.array([axis[0] * s, axis[1] * s, axis[2] * s, np.cos(half)])


def quat_to_axis_angle(q: np.ndarray) -> tuple[np.ndarray, float]:
    q = quat_normalize(q)
    if q[3] > 1.0:
        q = q / np.linalg.norm(q)
    w = np.clip(q[3], -1.0, 1.0)
    angle = 2.0 * np.arccos(w)
    s = np.sqrt(1.0 - w * w)
    if s < 1e-6:
        axis = np.array([1.0, 0.0, 0.0])
    else:
        axis = q[:3] / s
    return axis, angle


def quat_from_matrix(R: np.ndarray) -> np.ndarray:
    """从 3x3 旋转矩阵（列向量为基）转 xyzw 四元数（Shepperd 方法）。"""
    R = np.asarray(R, dtype=np.float64)
    tr = R[0, 0] + R[1, 1] + R[2, 2]
    if tr > 0.0:
        s = np.sqrt(tr + 1.0) * 2.0
        qw = 0.25 * s
        qx = (R[2, 1] - R[1, 2]) / s
        qy = (R[0, 2] - R[2, 0]) / s
        qz = (R[1, 0] - R[0, 1]) / s
    elif R[0, 0] > R[1, 1] and R[0, 0] > R[2, 2]:
        s = np.sqrt(1.0 + R[0, 0] - R[1, 1] - R[2, 2]) * 2.0
        qw = (R[2, 1] - R[1, 2]) / s
        qx = 0.25 * s
        qy = (R[0, 1] + R[1, 0]) / s
        qz = (R[0, 2] + R[2, 0]) / s
    elif R[1, 1] > R[2, 2]:
        s = np.sqrt(1.0 + R[1, 1] - R[0, 0] - R[2, 2]) * 2.0
        qw = (R[0, 2] - R[2, 0]) / s
        qx = (R[0, 1] + R[1, 0]) / s
        qy = 0.25 * s
        qz = (R[1, 2] + R[2, 1]) / s
    else:
        s = np.sqrt(1.0 + R[2, 2] - R[0, 0] - R[1, 1]) * 2.0
        qw = (R[1, 0] - R[0, 1]) / s
        qx = (R[0, 2] + R[2, 0]) / s
        qy = (R[1, 2] + R[2, 1]) / s
        qz = 0.25 * s
    return quat_normalize(np.array([qx, qy, qz, qw]))


def quat_to_matrix(q: np.ndarray) -> np.ndarray:
    """xyzw 四元数 -> 3x3 旋转矩阵（R 的列 = 旋转后的基向量）。"""
    q = quat_normalize(q)
    x, y, z, w = q
    return np.array(
        [
            [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
        ]
    )


def euler_from_quat(q: np.ndarray) -> tuple[float, float, float]:
    """返回 (roll, pitch, yaw)（rad），采用 X(roll)-Y(pitch)-Z(yaw) 内旋约定。

    yaw: 绕世界 +y（竖直）的航向；pitch: 抬头为正；roll: 右翼下沉为正。
    """
    q = quat_normalize(q)
    x, y, z, w = q
    # 滚转 roll
    sinr_cosp = 2.0 * (w * x + y * z)
    cosr_cosp = 1.0 - 2.0 * (x * x + y * y)
    roll = np.arctan2(sinr_cosp, cosr_cosp)
    # 俯仰 pitch（clamp 防止 gimbal）
    sinp = 2.0 * (w * y - z * x)
    if abs(sinp) >= 1.0:
        pitch = np.copysign(np.pi / 2.0, sinp)
    else:
        pitch = np.arcsin(sinp)
    # 偏航 yaw
    siny_cosp = 2.0 * (w * z + x * y)
    cosy_cosp = 1.0 - 2.0 * (y * y + z * z)
    yaw = np.arctan2(siny_cosp, cosy_cosp)
    return roll, pitch, yaw


_WORLD_UP = np.array([0.0, 1.0, 0.0])


def body_axis_pitch(q: np.ndarray) -> float:
    """机体 x（机头）相对水平面的俯仰角。抬头为正，仅由 xb·up 决定，与横滚无关。"""
    xb = quat_rotate(q, np.array([1.0, 0.0, 0.0]))
    return float(np.arcsin(np.clip(xb[1], -1.0, 1.0)))


def body_axis_bank(q: np.ndarray) -> float:
    """横滚角：机体 y(升力方向) 绕机头 x 轴相对竖直方向的角度。右翼下沉为正。"""
    xb = quat_rotate(q, np.array([1.0, 0.0, 0.0]))
    yb = quat_rotate(q, np.array([0.0, 1.0, 0.0]))
    up = _WORLD_UP
    up_p = up - xb * float(np.dot(up, xb))     # 竖直投影到 ⊥xb 平面
    yb_p = yb - xb * float(np.dot(yb, xb))
    nu = np.linalg.norm(up_p)
    nv = np.linalg.norm(yb_p)
    if nu < 1e-6 or nv < 1e-6:
        return 0.0
    up_p = up_p / nu
    yb_p = yb_p / nv
    s = np.cross(xb, up_p)                     # 平面内的“右翼”参考方向
    sn = np.linalg.norm(s)
    if sn < 1e-6:
        return 0.0
    s = s / sn
    return float(np.arctan2(np.dot(yb_p, s), np.dot(yb_p, up_p)))


def body_axis_heading(q: np.ndarray) -> float:
    """航向（绕竖直 +y）。机头 +x 与水平面夹角。yaw=0 时机头朝世界 +x。"""
    xb = quat_rotate(q, np.array([1.0, 0.0, 0.0]))
    return float(np.arctan2(-xb[2], xb[0]))


def quat_from_heading_pitch(heading: float, pitch: float) -> np.ndarray:
    """给定航向与俯仰（无横滚），构造姿态四元数（机翼水平）。"""
    xh = np.array([np.cos(heading), 0.0, -np.sin(heading)])   # 水平前向
    up = _WORLD_UP
    lateral = np.cross(xh, up)                                # 横向（右翼参考）
    ln = np.linalg.norm(lateral)
    if ln < 1e-9:
        lateral = np.array([0.0, 0.0, 1.0])
    else:
        lateral = lateral / ln
    q_h = quat_from_axis_angle(np.array([0.0, 1.0, 0.0]), heading)
    q_p = quat_from_axis_angle(lateral, pitch)
    return quat_normalize(quat_mul(q_p, q_h))


# ---------------------------------------------------------------------------
# 6DOF 刚体状态
# ---------------------------------------------------------------------------


class RigidState:
    """单个刚体(滑翔机整机)的 6DOF 状态。世界系 Y-up。"""

    __slots__ = ("pos", "quat", "vel", "omega")

    def __init__(
        self,
        pos=None,
        quat=None,
        vel=None,
        omega=None,
    ):
        self.pos = np.zeros(3) if pos is None else np.asarray(pos, dtype=np.float64).reshape(3)
        self.quat = quat_identity() if quat is None else quat_normalize(quat)
        self.vel = np.zeros(3) if vel is None else np.asarray(vel, dtype=np.float64).reshape(3)
        self.omega = (
            np.zeros(3) if omega is None else np.asarray(omega, dtype=np.float64).reshape(3)
        )

    def copy(self) -> "RigidState":
        return RigidState(self.pos.copy(), self.quat.copy(), self.vel.copy(), self.omega.copy())

    def rotation_matrix(self) -> np.ndarray:
        return quat_to_matrix(self.quat)

    @property
    def R(self) -> np.ndarray:
        return quat_to_matrix(self.quat)

    def body_axes(self):
        R = quat_to_matrix(self.quat)
        return R[:, 0], R[:, 1], R[:, 2]  # x 前 / y 上 / z 右翼

    def vel_body(self) -> np.ndarray:
        """机体坐标系中的速度分量 (u 前, v 上, w 右)。"""
        return quat_rotate(quat_conjugate(self.quat), self.vel)

    def omega_body(self) -> np.ndarray:
        return quat_rotate(quat_conjugate(self.quat), self.omega)

    def euler(self) -> tuple[float, float, float]:
        return euler_from_quat(self.quat)

    def alpha_beta(self) -> tuple[float, float]:
        """气动迎角 / 侧滑角（rad）。alpha 抬头为正；beta 右侧风为正。"""
        u, v, w = self.vel_body()
        V = np.linalg.norm(self.vel)
        if V < 1e-6:
            return 0.0, 0.0
        alpha = np.arctan2(-v, u) if u != 0 else 0.0
        beta = np.arcsin(np.clip(w / V, -1.0, 1.0))
        return alpha, beta


# ---------------------------------------------------------------------------
# 半隐式 Euler 6DOF 参考积分器（用于本地验证 / 无 novaPhy 时的后备）
# ---------------------------------------------------------------------------


def integrate_rigid(state: RigidState, F: np.ndarray, T: np.ndarray, mass: float,
                    I_body: np.ndarray, dt: float, gravity=np.array([0.0, -9.81, 0.0])) -> RigidState:
    """半隐式(辛)Euler：v,ω 用当前力更新，再更新位置/姿态。"""
    F = np.asarray(F, dtype=np.float64).reshape(3)
    T = np.asarray(T, dtype=np.float64).reshape(3)
    I_body = np.asarray(I_body, dtype=np.float64)

    # 1) 更新线速度（重力 + 外力）
    a = gravity + F / mass
    new = state.copy()
    new.vel = state.vel + a * dt

    # 2) 更新角速度（体轴惯性，含陀螺项）
    R = quat_to_matrix(state.quat)
    I_inv = np.linalg.inv(I_body)
    omega_b = R.T @ state.omega
    alpha_b = I_inv @ (R.T @ T - np.cross(omega_b, I_body @ omega_b))
    new.omega = state.omega + (R @ alpha_b) * dt

    # 3) 更新位置
    new.pos = state.pos + new.vel * dt

    # 4) 更新姿态（用平均角速度的指数映射积分）
    omega_mid = 0.5 * (state.omega + new.omega)
    w_abs = np.linalg.norm(omega_mid)
    if w_abs > 1e-9:
        dq = quat_from_axis_angle(omega_mid, w_abs * dt)
    else:
        dq = quat_identity()
    new.quat = quat_normalize(quat_mul(dq, state.quat))
    return new
