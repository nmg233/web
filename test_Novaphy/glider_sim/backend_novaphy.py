"""backend_novaphy.py — novaPhy 物理引擎后端。

在目标 Linux + Python3.11 + 已安装 novaPhy 的环境下，用 novaPhy 的刚体求解器
（SolverSemiImplicit）做 6DOF 刚体动力学积分；气动力由 glider_sim/aero.py
计算后通过 state.apply_force / apply_torque 注入引擎。

用法（Linux 环境）::

    import novaphy  # 需已安装 novaphy wheel
    from backend_novaphy import NovaPhyBackend
    from aircraft import Glider
    backend = NovaPhyBackend(Glider())

模块在任何环境都能 import（novaPhy 不存在时仅实例化失败）。
"""

from __future__ import annotations

import numpy as np

from aircraft import Glider
from spatial import RigidState

try:  # novaPhy 只在 Linux x86_64 + CPython3.11 可用
    import novaphy
except Exception as _e:  # noqa: BLE001
    novaphy = None
    _NOVAPHY_IMPORT_ERROR = _e
else:
    _NOVAPHY_IMPORT_ERROR = None

GRAVITY = np.array([0.0, -9.81, 0.0], dtype=np.float32)


def _np(x, dtype=np.float32):
    if hasattr(x, "numpy"):
        x = x.numpy()
    return np.asarray(x, dtype=dtype)


class NovaPhyBackend:
    """novaPhy 后端：接口与 ReferenceBackend 一致。"""

    name = "novaphy"

    def __init__(self, glider: Glider):
        if novaphy is None:
            raise RuntimeError(
                "novaPhy 不可用（当前平台/解释器无法加载）。"
                "请在本包指定的 Linux x86_64 + CPython 3.11 环境安装后运行。"
                f"导入错误: {_NOVAPHY_IMPORT_ERROR}"
            )
        self.glider = glider
        self.body_idx = 0
        self.model = None
        self.solver = None
        self.state_0 = None
        self.state_1 = None
        self.control = None
        self.collision_pipeline = None
        self.contacts = None
        self._pending = None
        self._built = False
        self._v = None

    # ------------------------------------------------------------------
    def reset(self, pos, quat, vel, omega=None):
        """用 novaPhy ModelBuilder 建模型并设置初始状态。"""
        omega = np.zeros(3) if omega is None else np.asarray(omega, dtype=np.float64)
        g = self.glider

        builder = novaphy.ModelBuilder()
        builder.set_gravity(GRAVITY)
        builder.add_ground_plane(y=0.0, friction=0.55, restitution=0.15)

        pos_f = np.asarray(pos, dtype=np.float32).reshape(3)
        quat_f = np.asarray(quat, dtype=np.float32).reshape(4)
        xform = novaphy.Transform(pos_f, quat_f)
        I33 = np.asarray(g.I_body, dtype=np.float32)
        com0 = np.zeros(3, dtype=np.float32)
        self.body_idx = int(builder.add_body(
            xform=xform, mass=float(g.mass), com=com0, inertia=I33))

        # --- 碰撞体（仅机身小包络，用于触地/着陆） ---
        self._add_box(builder, self.body_idx, [2.1, 0.32, 0.35], [0.0, 0.0, 0.0],
                      visible=False, collide=True)

        # --- 视觉部件（机身/座舱/机翼/平尾/垂尾；不参与碰撞） ---
        for name, center, half, _rgba in g.parts():
            if name == "fuselage":
                continue  # 机身碰撞盒已有；仍加一个可见机身避免视觉缺失
            self._add_box(builder, self.body_idx, half, center,
                          visible=True, collide=False, label=name)
        # 可见机身
        for name, center, half, _rgba in g.parts():
            if name == "fuselage":
                self._add_box(builder, self.body_idx, half, center,
                              visible=True, collide=False, label=name)
                break

        self.model = builder.finalize()
        self.solver = novaphy.solvers.SolverSemiImplicit(
            self.model, novaphy.solvers.SolverSemiImplicit.Config())
        self.state_0 = self.model.state()
        self.state_1 = self.model.state()
        self.control = self.model.control()   # 无执行器，仅占位
        self.collision_pipeline = novaphy.CollisionPipeline(self.model)
        self.contacts = self.collision_pipeline.contacts()

        # 初始线/角速度
        self.state_0.set_linear_velocity(
            self.body_idx, np.asarray(vel, dtype=np.float32).reshape(3))
        self.state_0.set_angular_velocity(
            self.body_idx, np.asarray(omega, dtype=np.float32).reshape(3))
        self._built = True

    def _add_box(self, builder, body, half, center, *, visible, collide,
                 label="", color=None):
        """往 body 上追加一个偏移的盒形 shape（与 urdf 导入同路径）。"""
        half = np.asarray(half, dtype=np.float32).reshape(3)
        center = np.asarray(center, dtype=np.float32).reshape(3)
        local = novaphy.Transform.from_translation(center)
        mu, rest = 0.5, 0.1
        shape = novaphy.CollisionShape.make_box(half, body, local, mu, rest)
        flags = 0
        if visible:
            flags |= int(novaphy.ShapeFlags.VISIBLE)
        if collide:
            flags |= int(novaphy.ShapeFlags.COLLIDE_SHAPES)
        shape.flags = flags
        shape.friction = mu
        shape.restitution = rest
        builder.add_shape(shape)

    # ------------------------------------------------------------------
    def get_state(self) -> RigidState:
        bq = _np(self.state_0.body_q).reshape((-1, 7))
        bqd = _np(self.state_0.body_qd).reshape((-1, 7 - 1))
        row = bq[self.body_idx]
        rowd = bqd[self.body_idx] if bqd.shape[1] >= 6 else np.zeros(6)
        return RigidState(
            np.asarray(row[:3], dtype=np.float64),
            np.asarray(row[3:7], dtype=np.float64),
            np.asarray(rowd[:3], dtype=np.float64),
            np.asarray(rowd[3:6], dtype=np.float64),
        )

    def apply_wrench(self, F_world, T_world):
        self._pending = (
            np.asarray(F_world, dtype=np.float32).reshape(3),
            np.asarray(T_world, dtype=np.float32).reshape(3),
        )

    def step(self, dt: float):
        if self._pending is None:
            F, T = np.zeros(3, dtype=np.float32), np.zeros(3, dtype=np.float32)
        else:
            F, T = self._pending
            self._pending = None
        self.state_0.clear_forces()
        self.state_0.apply_force(self.body_idx, F)
        self.state_0.apply_torque(self.body_idx, T)
        self.collision_pipeline.collide(self.state_0, self.contacts)
        self.solver.step(self.state_0, self.state_1, self.control,
                         self.contacts, float(dt))
        self.state_0, self.state_1 = self.state_1, self.state_0

    def close(self):
        self._built = False
