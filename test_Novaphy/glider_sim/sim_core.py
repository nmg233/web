"""sim_core.py — 后端无关的飞行仿真循环（控制器 + 气动力注入 + 遥测）。

reference / novaPhy 两个后端走完全相同的流程：
  1. 读取当前 6DOF 状态（RigidState）
  2. 控制器输出舵面 def
  3. aero.compute_wrench 计算气动力/力矩（世界系，相对 COM）
  4. backend.apply_wrench + backend.step(dt)（引擎负责刚体动力学积分）
"""

from __future__ import annotations

import numpy as np

from aero import compute_wrench
from aircraft import Glider, air_density
from spatial import (RigidState, body_axis_bank, body_axis_heading,
                     body_axis_pitch, quat_from_axis_angle, quat_from_heading_pitch,
                     quat_mul, quat_normalize)


class SimConfig:
    def __init__(self):
        self.sim_time = 90.0          # 总时长 (s)
        self.dt = 1.0 / 120.0         # 仿真步长 (s)

        # 投放条件
        self.start_alt = 320.0
        self.start_speed = 40.0       # 投放空速
        self.start_pitch_deg = -2.0
        self.launch_roll_deg = 2.0    # 初始小幅横滚（演示横滚稳定性）
        self.heading_deg = 0.0

        # 巡航/目标
        self.V_ref = 31.0

        # 机动：straight 直飞 / circuit 持续盘旋 / sine 蛇形
        self.maneuver = "straight"
        self.bank_cmd_deg = 18.0      # circuit 使用的坡度
        self.sine_period = 140.0      # sine 周期 (s)
        self.maneuver_start = 6.0     # 投放后多少秒开始机动

        # 控制器增益
        self.gain_speed = 0.05        # 空速误差 -> 升降舵
        self.gain_dspeed = 0.10
        self.gain_pitch = 0.0         # 俯仰姿态保持（预留）
        self.gain_pitch_damp = 0.50
        self.gain_roll = 1.4          # 横滚回中
        self.gain_roll_rate = 1.0
        self.gain_beta = 0.30
        self.gain_yaw_rate = 0.5

        self.def_limit = 0.9
        self.stop_alt = 1.5           # 触地（视为着陆）
        self.max_roll_rad = np.radians(75.0)   # 超过视为失控


class FlightController:
    """空速保持 + 机翼水平 + 协调（去侧滑）。

    物理符号说明（已在 aero 中按“def>0 增大该面迎角”定义）：
      - 升降舵 def>0：平尾升力↑(尾上抬) -> 低头力矩（推杆）
      - 副翼   def>0：右翼(starboard)迎角↑ -> 左横滚
      - 方向舵 def>0：垂尾向右翼方向出力 -> 偏航
    控制器使用与上述一致的物理符号；具体极性与负反馈方向经数值验证后取定。
    """

    def __init__(self, cfg: SimConfig):
        self.cfg = cfg
        self._prev_V = None
        self._prev_bank = None

    def __call__(self, s: RigidState, dt: float, t: float = 0.0) -> dict:
        cfg = self.cfg
        V = float(np.linalg.norm(s.vel))
        zero = {"elevator": 0.0, "aileron": 0.0, "rudder": 0.0}
        if V < 1e-3:
            return zero
        ub = s.vel_body()
        alpha = float(np.arctan2(-ub[1], ub[0]))
        beta = float(np.arcsin(np.clip(ub[2] / V, -1.0, 1.0)))
        bank = body_axis_bank(s.quat)
        pitch = body_axis_pitch(s.quat)

        wb = s.omega_body()
        q = wb[2]                     # 绕右翼向 z 的俯仰率

        dV = 0.0 if self._prev_V is None else (V - self._prev_V) / max(dt, 1e-6)
        dbank = 0.0 if self._prev_bank is None else (bank - self._prev_bank) / max(dt, 1e-6)

        # ---- 机动 -> 目标坡度 ----
        bank_cmd = 0.0
        if t > cfg.maneuver_start:
            m = cfg.maneuver
            if m == "circuit":
                bank_cmd = np.radians(cfg.bank_cmd_deg)
            elif m == "sine":
                bank_cmd = np.radians(cfg.bank_cmd_deg) * np.sin(
                    2.0 * np.pi * t / max(cfg.sine_period, 1e-3))

        # 俯仰通道：def>0=推杆(低头)；V 高->抬头减速->def<0
        elevator = -cfg.gain_speed * (V - cfg.V_ref) - cfg.gain_dspeed * dV
        elevator += cfg.gain_pitch * (0.0 - pitch)
        elevator += cfg.gain_pitch_damp * q          # q>0 抬头 -> 加推杆阻尼
        # 横滚通道：仿真验证 def>0(右翼α升)会左滚->bank↓
        # 于是用 (bank-bank_cmd) 作误差即可负反馈：bank 高时给正副翼把它压回目标
        aileron = cfg.gain_roll * (bank - bank_cmd) + cfg.gain_roll_rate * dbank
        # 方向舵：去侧滑 + 偏航阻尼（符号经数值验证）
        rudder = -cfg.gain_beta * beta - cfg.gain_yaw_rate * (-wb[1])

        self._prev_V = V
        self._prev_bank = bank
        return {
            "elevator": float(np.clip(elevator, -cfg.def_limit, cfg.def_limit)),
            "aileron": float(np.clip(aileron, -cfg.def_limit, cfg.def_limit)),
            "rudder": float(np.clip(rudder, -cfg.def_limit, cfg.def_limit)),
        }


def launch_pose(cfg: SimConfig):
    """构造投放初始状态：给定高度/航向/俯仰/速度；带小横滚扰动。"""
    pos = np.array([0.0, cfg.start_alt, 0.0])
    heading = np.radians(cfg.heading_deg)
    pitch = np.radians(cfg.start_pitch_deg)
    roll = np.radians(cfg.launch_roll_deg)

    # 基础：航向 + 俯仰（机翼水平）
    q = quat_from_heading_pitch(heading, pitch)
    # 再加小横滚（绕机头 x 轴）
    xb = quat_mul(q, quat_from_axis_angle([1.0, 0.0, 0.0], 0.0))
    del xb
    q_roll = quat_from_axis_angle([1.0, 0.0, 0.0], roll)
    q = quat_normalize(quat_mul(q_roll, q))

    from spatial import quat_to_matrix
    R = quat_to_matrix(q)
    vel = cfg.start_speed * R[:, 0]   # 沿机头方向（含俯仰，水平分量为主导）
    return pos, q, vel, np.zeros(3)


def run_flight(backend, glider: Glider, cfg: SimConfig):
    """执行一次飞行，返回遥测 dict。"""
    pos0, q0, vel0, om0 = launch_pose(cfg)
    backend.reset(pos0, q0, vel0, om0)
    ctrl = FlightController(cfg)

    tele = {k: [] for k in
            ("t", "pos", "quat", "vel", "alpha", "beta", "V", "CL", "CD",
             "sink", "elevator", "aileron", "rudder", "alt", "bank", "pitch")}

    dt = cfg.dt
    n_steps = int(cfg.sim_time / dt)
    reason = "ok"
    for i in range(n_steps):
        s = backend.get_state()
        t_now = i * dt
        defs = ctrl(s, dt, t_now)
        rho = air_density(float(s.pos[1]))
        F, T, diag = compute_wrench(s, glider, defs, rho)
        backend.apply_wrench(F, T)
        backend.step(dt)

        s = backend.get_state()
        tele["t"].append(i * dt)
        tele["pos"].append(s.pos.copy())
        tele["quat"].append(s.quat.copy())
        tele["vel"].append(s.vel.copy())
        for k in ("alpha", "beta", "V", "CL", "CD", "sink"):
            tele[k].append(diag[k])
        for k in ("elevator", "aileron", "rudder"):
            tele[k].append(defs[k])
        tele["alt"].append(float(s.pos[1]))
        tele["bank"].append(float(np.degrees(body_axis_bank(s.quat))))
        tele["pitch"].append(float(np.degrees(body_axis_pitch(s.quat))))

        if s.pos[1] <= cfg.stop_alt:
            reason = "landed"
            break
        if abs(body_axis_bank(s.quat)) > cfg.max_roll_rad:
            reason = "crashed(roll)"
            break
        if np.linalg.norm(s.vel) < 6.0 and s.pos[1] > 60.0:
            reason = "stalled/slow"
            break

    out = {k: np.asarray(v) for k, v in tele.items()}
    out["reason"] = reason
    out["steps"] = len(out["t"])
    return out


def flight_summary(tele) -> dict:
    alt = tele["alt"]
    t = tele["t"]
    dur = float(t[-1]) if len(t) else 0.0
    dpos = tele["pos"][-1] - tele["pos"][0] if len(tele["pos"]) else np.zeros(3)
    dist = float(np.linalg.norm([dpos[0], dpos[2]]))
    sink = float(np.mean(tele["sink"])) if len(tele["sink"]) else 0.0
    meanV = float(np.mean(tele["V"])) if len(tele["V"]) else 0.0
    drop = float(alt[0] - alt[-1]) if len(alt) > 1 else 0.0
    # 末段高于起点（如仍在爬升/配平段）时，水平滑翔比按 0 处理，避免除近零
    glide_ratio = (dist / drop) if drop > 1e-6 else 0.0
    return {
        "time": dur, "dist": dist,
        "alt_start": float(alt[0]) if len(alt) else 0.0,
        "alt_end": float(alt[-1]) if len(alt) else 0.0,
        "sink": sink, "speed": meanV,
        "glide_ratio": glide_ratio, "reason": tele.get("reason", "ok"),
    }
