"""aero.py — 滑翔机 6DOF 气动模型（纯 numpy，几何面法，含失速 / 诱导阻力 / 下洗）。

对每个气动面在其气动中心 AC 处计算局部来流（机体速度 + 角速度×力臂），
分解为“迎角 / 侧滑角”，得到升 / 阻力系数，再合成世界系力与对 COM 的力矩。

坐标系（与 aircraft.py 一致）：
  机体系 x 前、y 上、z 右翼；世界系 Y 向上。

本模块与物理引擎无关：reference 后端与 novaPhy 后端共用 compute_wrench()
的输出，保证两个后端看到的气动力完全一致。
"""

from __future__ import annotations

import numpy as np

from spatial import quat_to_matrix


def lift_coeff(alpha: float, a0: float, clmax: float, astall: float) -> float:
    """对称翼型升力系数 CL(alpha)：线性段 + 失速后衰减。"""
    sign = 1.0 if alpha >= 0.0 else -1.0
    a = abs(alpha)
    if a <= astall:
        return float(np.clip(a0 * alpha, -clmax, clmax))
    cl1 = np.clip(a0 * astall, 0.0, clmax * 0.95)
    a2 = astall + np.radians(14.0)          # 失速后快速衰减区
    u = min((a - astall) / max(a2 - astall, 1e-9), 1.0)
    cl = cl1 + (clmax * 0.45 - cl1) * u
    if a > a2:
        a3 = np.radians(90.0)               # 大迎角缓慢趋向 0（不会在正常飞行达到）
        u2 = min((a - a2) / max(a3 - a2, 1e-9), 1.0)
        cl += (0.0 - cl) * u2
    return float(sign * cl)


def drag_coeff(alpha: float, cl: float, cd0: float, ar: float, e: float) -> float:
    """CD = cd0 + 诱导阻力 + 失速分离阻力。"""
    k = 1.0 / (np.pi * e * max(ar, 0.1))
    cd = cd0 + k * cl * cl
    a = abs(alpha)
    if a > np.radians(8.0):
        u = (a - np.radians(8.0)) / max(np.radians(42.0) - np.radians(8.0), 1e-9)
        cd += 1.1 * float(np.clip(u, 0.0, 1.0)) ** 2
    return float(cd)


def _surface_force(R, srf, air_velocity, rho, extra_angle=0.0):
    """单个升力面在来流 air_velocity(世界系) 下的升+阻力向量。

    返回 (force_world, cl, cd)。
    """
    Vm = float(np.linalg.norm(air_velocity))
    if Vm < 1e-6:
        return np.zeros(3), 0.0, 0.0
    q = 0.5 * rho * Vm * Vm
    ahat = air_velocity / Vm
    a_b = R.T @ ahat
    n_b = np.asarray(srf["n_body"], dtype=np.float64)

    fc = -a_b[0]                       # 来流沿 x 的前向分量（正=来流向前来）
    fn = float(a_b @ n_b)              # 来流沿面法向分量
    alpha = np.arctan2(fn, fc) + float(extra_angle)

    cl = lift_coeff(alpha, srf["a0"], srf["clmax"], srf["astall"])
    cd = drag_coeff(alpha, cl, srf["cd0"], srf["AR"], srf["e"])

    n_world = R @ n_b
    lvec = n_world - ahat * float(np.dot(n_world, ahat))   # 升力方向 ⊥ 来流
    ln = np.linalg.norm(lvec)
    lhat = lvec / ln if ln > 1e-9 else np.zeros(3)

    f = q * srf["S"] * (cl * lhat + cd * ahat)             # 升力 + 阻力
    return f, cl, cd


def compute_wrench(state, glider, controls, rho, wind_world=None):
    """返回 (F_world, T_world, diag)。

    F_world 为世界系合力 [N]；T_world 为对 COM 的合力矩 [N*m]。
    """
    R = quat_to_matrix(state.quat)
    wind = (np.zeros(3) if wind_world is None
            else np.asarray(wind_world, dtype=np.float64).reshape(3))

    elevator = float(controls.get("elevator", 0.0))
    aileron = float(controls.get("aileron", 0.0))
    rudder = float(controls.get("rudder", 0.0))

    F = np.zeros(3)
    T = np.zeros(3)

    def point_flow(r_body):
        """AC 的力臂在世界系中的位置与该点来流速度。"""
        r_world = R @ np.asarray(r_body, dtype=np.float64)
        air = wind - (state.vel + np.cross(state.omega, r_world))
        return r_world, air

    # ---- 主机翼（左右半面；副翼差动）----
    S_wing = 2.0 * glider.wing_halves[0]["S"]
    q_wing_ref = 1.0
    lift_wing_qS = 0.0                 # sum(0.5ρV²·S·CL)
    for half in glider.wing_halves:
        r_world, air = point_flow(half["r_ac"])
        side = float(half["side"])
        f, cl, _cd = _surface_force(
            R, half, air, rho,
            extra_angle=side * aileron * glider.aileron_eff)
        Vm = np.linalg.norm(air)
        q_wing_ref = 0.5 * rho * Vm * Vm
        lift_wing_qS += q_wing_ref * half["S"] * cl
        F += f
        T += np.cross(r_world, f)
    cl_wing = lift_wing_qS / (q_wing_ref * S_wing) if q_wing_ref > 1e-6 else 0.0

    # ---- 平尾 + 升降舵（含下洗与安装角）----
    tail = glider.tail
    r_world, air = point_flow(tail["r_ac"])
    downwash = 0.0
    if abs(cl_wing) > 1e-3:
        downwash = 2.0 * cl_wing / (np.pi * glider.wing_halves[0]["AR"])
    f, _cl, _cd = _surface_force(
        R, tail, air, rho,
        extra_angle=tail["i_t"] - downwash + elevator * glider.elevator_eff)
    F += f
    T += np.cross(r_world, f)

    # ---- 垂尾 + 方向舵 ----
    fin = glider.fin
    r_world, air = point_flow(fin["r_ac"])
    f, _cl, _cd = _surface_force(
        R, fin, air, rho, extra_angle=rudder * glider.rudder_eff)
    F += f
    T += np.cross(r_world, f)

    # ---- 机身（纯阻力 + 阻力作用点在重心略前方带来的阻尼）----
    fus = glider.fuselage
    V_tot = float(np.linalg.norm(state.vel))
    if V_tot > 1e-6:
        vhat = state.vel / V_tot
        F_fus = -0.5 * rho * V_tot * V_tot * fus["S_ref"] * fus["cd"] * vhat
        F += F_fus
        r_world = R @ np.array([1.6, 0.0, 0.0])   # 等效机身压心约在重心前 1.6m
        T += np.cross(r_world, F_fus)

    # ---- 诊断（整机无量纲，供 HUD / 图表）----
    V_ref = float(np.linalg.norm(state.vel))
    diag = {
        "V": V_ref, "alpha": 0.0, "beta": 0.0,
        "CL": 0.0, "CD": 0.0, "L": 0.0, "D": 0.0, "sink": 0.0,
    }
    if V_ref > 1e-3:
        qref = 0.5 * rho * V_ref * V_ref
        u_b = state.vel_body()
        diag["alpha"] = float(np.arctan2(-u_b[1], u_b[0]))
        diag["beta"] = float(np.arcsin(np.clip(u_b[2] / V_ref, -1.0, 1.0)))
        diag["L"] = float(np.dot(F, R @ np.array([0.0, 1.0, 0.0])))
        diag["D"] = float(-np.dot(F, state.vel / V_ref))
        diag["CL"] = diag["L"] / (qref * S_wing) if qref > 1e-6 else 0.0
        diag["CD"] = diag["D"] / (qref * S_wing) if qref > 1e-6 else 0.0
        diag["sink"] = float(-state.vel[1])
    return F, T, diag
