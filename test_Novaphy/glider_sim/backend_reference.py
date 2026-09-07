"""backend_reference.py — 纯 numpy 6DOF 参考后端（不依赖 novaPhy）。

接口与 backend_novaphy.NovaPhyBackend 完全一致，用于：
  1. 在 Windows/无 novaPhy 环境本地验证气动模型与可视化；
  2. 与 novaPhy 后端对比（两边看到相同的气动力）。

物理：半隐式(辛)Euler 刚体积分，重力 + 外部气动力/力矩。
"""

from __future__ import annotations

import numpy as np

from aircraft import Glider
from spatial import RigidState, integrate_rigid, quat_to_matrix

GRAVITY = np.array([0.0, -9.81, 0.0])


class ReferenceBackend:
    """AeroSim 后端接口：get_state / apply_wrench / step / reset / close。"""

    name = "reference"

    def __init__(self, glider: Glider):
        self.glider = glider
        self.state = RigidState()
        self._force = np.zeros(3)
        self._torque = np.zeros(3)
        self._built = False

    # ---- 构造 / 复位 ----
    def reset(self, pos, quat, vel, omega=None):
        omega = np.zeros(3) if omega is None else np.asarray(omega, dtype=np.float64)
        self.state = RigidState(pos, quat, vel, omega)
        self._force = np.zeros(3)
        self._torque = np.zeros(3)
        self._built = True

    # ---- 仿真接口 ----
    def get_state(self) -> RigidState:
        return self.state

    def apply_wrench(self, F_world, T_world):
        self._force = np.asarray(F_world, dtype=np.float64).reshape(3)
        self._torque = np.asarray(T_world, dtype=np.float64).reshape(3)

    def step(self, dt: float):
        st = self.state
        self.state = integrate_rigid(
            st, self._force, self._torque,
            self.glider.mass, self.glider.I_body, float(dt), GRAVITY)
        self._force = np.zeros(3)
        self._torque = np.zeros(3)

    def body_axes(self):
        R = quat_to_matrix(self.state.quat)
        return R[:, 0], R[:, 1], R[:, 2]

    def close(self):
        self._built = False
