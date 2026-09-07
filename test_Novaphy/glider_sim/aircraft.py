"""aircraft.py — 滑翔机（单刚体整机）几何 / 质量 / 气动面参数。

坐标系约定
----------
- 世界系：Y 向上（与 novaPhy 引擎一致），X/Z 水平。
- 机体系（body frame，原点=质心 COM）：x 向前（机头）、y 向上、z 向右翼（starboard）。

气动面：每个面定义
  - S        面积 (m^2)
  - r_ac     气动中心 AC 在机体系中的位置（相对 COM）
  - n_body   零升力法向（升力方向）：机翼/平尾 = +y；垂尾 = +z
  - a0       升力线斜率 dCL/dalpha（rad^-1，基于该面面积）
  - cd0      零升阻力系数
  - e, AR    诱导阻力用 Oswald 效率 / 展弦比
  - clmax / astall  失速参数
主要面会拆成对称“半面”（左/右）以自然产生横滚阻尼与需要的差动效果。
"""

from __future__ import annotations

import numpy as np

# ---------------------------------------------------------------------------
# 标准大气
# ---------------------------------------------------------------------------
RHO0 = 1.225          # kg/m^3 @海平面
H_SCALE = 8500.0      # 指数大气标高 (m)


def air_density(altitude_m: float) -> float:
    return RHO0 * np.exp(-max(altitude_m, 0.0) / H_SCALE)


# ---------------------------------------------------------------------------
# 滑翔机参数
# ---------------------------------------------------------------------------
class Glider:
    def __init__(self, *, dihedral_deg: float = 0.0, cg_x: float = 0.0):
        # ---- 用户可调布局参数 ----
        self.dihedral_deg = float(dihedral_deg)   # 机翼上反角 (°)，>0 = 两翼尖上翘
        self.cg_x = float(cg_x)                   # 重心沿机体 x 前移量 (m)，>0 = 重心更靠前

        # ---- 总体质量 / 惯量（kg, kg*m^2）----
        self.mass = 420.0
        # 机体系主惯量（x 滚转 / y 俯仰 / z 偏航 由布局决定）
        self.I_body = np.diag([2100.0, 3300.0, 4000.0])
        self.I_body_inv = np.linalg.inv(self.I_body)

        # ---- 机翼（拆成左右两个半面）----
        span = 16.0            # 翼展
        wing_S = 17.5          # 总面积
        wing_AR = span ** 2 / wing_S
        wing_a0 = 2.0 * np.pi * wing_AR / (wing_AR + 2.0)   # 3D 升力线斜率

        # 左翼/右翼 AC：z = ±(半展的 40%)，x = +0.1（机翼 AC 略在 COM 前方）
        half = 0.5 * span
        z_ac = 0.40 * half
        self.wing_halves = []
        for side in (+1, -1):
            self.wing_halves.append({
                "S": 0.5 * wing_S,
                "r_ac": np.array([0.10, 0.0, side * z_ac]),
                "n_body": np.array([0.0, 1.0, 0.0]),
                "a0": wing_a0,
                "cd0": 0.010,
                "AR": wing_AR,
                "e": 0.82,
                "clmax": 1.35,
                "astall": np.radians(13.0),
                "side": side,
            })

        # ---- 平尾（含升降舵）----
        tail_S = 3.4
        tail_AR = 4.6
        tail_a0 = 2.0 * np.pi * tail_AR / (tail_AR + 2.0)
        self.tail = {
            "S": tail_S,
            "r_ac": np.array([-4.8, 0.05, 0.0]),
            "n_body": np.array([0.0, 1.0, 0.0]),
            "a0": tail_a0,
            "cd0": 0.008,
            "AR": tail_AR,
            "e": 0.90,
            "clmax": 1.1,
            "astall": np.radians(15.0),
            "i_t": np.radians(-1.5),     # 平尾安装角（度，抬头为正）
        }

        # ---- 垂尾（含方向舵）----
        fin_S = 1.6
        fin_AR = 1.8
        fin_a0 = 2.0 * np.pi * fin_AR / (fin_AR + 2.0)
        self.fin = {
            "S": fin_S,
            "r_ac": np.array([-4.6, 0.35, 0.0]),
            "n_body": np.array([0.0, 0.0, -1.0]),  # 法向取 -z：负反馈使方向稳定（数值验证）
            "a0": fin_a0,
            "cd0": 0.010,
            "AR": fin_AR,
            "e": 0.9,
            "clmax": 0.9,
            "astall": np.radians(18.0),
        }

        # ---- 机身（纯阻力，几乎不产生升力）----
        self.fuselage = {
            "S_ref": 0.55,      # 等效迎风/浸湿面积参考
            "cd": 0.35,
        }

        # ---- 控制面增益（deflection 无量纲 ~[-1,1] -> 附加迎角 rad）----
        self.elevator_eff = 0.55     # 升降舵 def->尾部附加 alpha 的效率
        self.rudder_eff = 0.75       # 方向舵 def->垂尾附加 beta 的效率
        self.aileron_eff = 0.35      # 副翼 def->半翼面附加 alpha 的效率

        # ---- 机身横截面（供渲染）----
        self.length = 7.2

        # ---- 把用户布局参数落到气动面定义上 ----
        # (a) 重心前移 -> 所有气动面相对 COM 整体后移（静稳定裕度变小）
        if abs(self.cg_x) > 1e-12:
            for _srf in [*self.wing_halves, self.tail, self.fin]:
                _srf["r_ac"] = np.asarray(_srf["r_ac"], dtype=float).copy()
                _srf["r_ac"][0] -= self.cg_x
        # (b) 机翼上反角：绕机体 x 轴旋转左右半翼面法向（翼尖上翘 -> 法向往内侧偏，
        #     使横滚静稳定增强；右翼 side=+1 法向朝 -z 偏，左翼朝 +z 偏）
        if abs(self.dihedral_deg) > 1e-12:
            _g = np.radians(self.dihedral_deg)
            for _h in self.wing_halves:
                _side = float(_h["side"])
                _ang = -_g * _side
                _c, _s = np.cos(_ang), np.sin(_ang)
                _n = np.asarray(_h["n_body"], dtype=float)
                _h["n_body"] = np.array(
                    [_n[0], _n[1] * _c - _n[2] * _s, _n[1] * _s + _n[2] * _c])

    # ------------------------------------------------------------------
    # 渲染部件（局部坐标系 box：半宽 hx,hy,hz + 颜色）—— 两个后端共用
    # ------------------------------------------------------------------
    def parts(self):
        """返回可渲染部件列表：(name, 机体系中心, 半尺寸, rgba)。"""
        hs = 0.30 * self.length / 2
        return [
            # 机身
            ("fuselage", np.array([0.0, 0.0, 0.0]),
             np.array([self.length * 0.5 - 0.1, 0.18, 0.22]), (0.95, 0.95, 0.95, 1.0)),
            # 座舱
            ("cockpit", np.array([1.4, 0.18, 0.0]),
             np.array([0.9, 0.22, 0.32]), (0.25, 0.55, 0.95, 1.0)),
            # 机翼（整体一块便于显示，两侧对称）
            ("wing", np.array([0.1, 0.0, 0.0]),
             np.array([1.6, 0.035, 8.0]), (0.85, 0.45, 0.12, 1.0)),
            # 翼尖小翼（视觉效果）
            ("wingtip_l", np.array([0.1, 0.28, 7.55]),
             np.array([0.7, 0.25, 0.06]), (0.85, 0.45, 0.12, 1.0)),
            ("wingtip_r", np.array([0.1, 0.28, -7.55]),
             np.array([0.7, 0.25, 0.06]), (0.85, 0.45, 0.12, 1.0)),
            # 平尾
            ("tailplane", np.array([-4.8, 0.05, 0.0]),
             np.array([0.7, 0.03, 1.6]), (0.90, 0.30, 0.30, 1.0)),
            # 垂尾
            ("fin", np.array([-4.7, 0.5, 0.0]),
             np.array([0.35, 0.85, 0.03]), (0.90, 0.30, 0.30, 1.0)),
        ]

    def control_surfaces(self):
        """可动的控制面（视觉上用颜色方块叠加在相应部件上，随 def 偏转）。"""
        return [
            # (名, 枢轴机体位置, 尺寸半宽, 默认颜色) —— 由 sim 层画成动画
        ]


DEFAULT_GLIDER = Glider()
