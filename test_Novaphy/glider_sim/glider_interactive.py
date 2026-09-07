#!/usr/bin/env python3
"""glider_interactive.py — 可交互的滑翔机教学仿真（学 drone_mountain.py 的 ViewerGL 交互风格）。

用户可设置：
  --alt       起飞高度 (m)
  --speed     初始投放速度 (m/s)
  --cg        重心相对默认沿机体前移量 (m)  >0=更靠前(头重/静稳↑时长↓)，<0=更靠后(接近失稳)
  --dihedral  机翼上反角 (°)  >0 两翼尖上翘 → 横向静稳定增强
运行后在 ViewerGL 实时 3D 窗口里观察滑翔机飞行，实时 HUD 显示飞行时间/高度/
速度/下沉/L/D；触地后给出“滑翔时长”。按 R 重新投放。

运行（需要 Linux + novaPhy，例如 WSL 里已建好的 /opt/novaphy 环境）：
  cd /mnt/d/html-source/PBLproject/jointproject/test_Novaphy/glider_sim
  /opt/novaphy/bin/python glider_interactive.py --alt 100 --dihedral 5

无窗口验证（Windows 可用 reference 后端）：
  python glider_interactive.py --headless --backend auto --alt 100
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import time

import numpy as np

from aero import compute_wrench
from aircraft import Glider, air_density
from sim_core import SimConfig, FlightController, launch_pose
from spatial import body_axis_bank, body_axis_pitch, quat_to_matrix

FRAME_DT = 1.0 / 30.0      # 交互画面帧间隔 s（仿真=1× 时）
PHYS_DT = 1.0 / 120.0      # 物理步长 s
FOLLOW_TAU = 0.08          # 相机跟随平滑时间常数（越小越“贴身”，避免落后）
CAMERA_LEAD = 9.0          # 相机注视点前视距离 m（让飞机位于画面偏下、留出前方视野）
GROUND_SIZE = 260.0        # ViewerGL 地面参考网格范围（米，半宽）


# ---------------------------------------------------------------------------
# 参数 → 模型 / 控制配置
# ---------------------------------------------------------------------------

def make_glider(args):
    return Glider(dihedral_deg=float(args.dihedral), cg_x=float(args.cg))


def make_cfg(args) -> SimConfig:
    cfg = SimConfig()
    cfg.start_alt = float(args.alt)
    cfg.start_speed = float(args.speed)
    cfg.V_ref = float(args.vref)
    cfg.sim_time = float(args.timeout)     # 最长滑翔(超时)仿真秒数
    cfg.maneuver = "straight"
    if not args.autolevel:                 # 关闭横滚/偏航自动保持，考察被动稳定
        cfg.gain_roll = 0.0
        cfg.gain_roll_rate = 0.0
        cfg.gain_beta = 0.0
        cfg.gain_yaw_rate = 0.0
    return cfg


def _pick_backend(name):
    if name == "reference":
        from backend_reference import ReferenceBackend
        return ReferenceBackend
    try:
        import novaphy  # noqa: F401
        from backend_novaphy import NovaPhyBackend
        has_novaphy = True
    except Exception:  # noqa: BLE001
        has_novaphy = False
        from backend_reference import ReferenceBackend
        if name == "novaphy":
            raise SystemExit("novaPhy 不可用：请在 WSL/Linux 的 novaPhy venv 里运行。")
        return ReferenceBackend
    if name == "novaphy" or has_novaphy:
        return NovaPhyBackend
    from backend_reference import ReferenceBackend
    return ReferenceBackend


# ---------------------------------------------------------------------------
# 物理推进（两个后端共用）
# ---------------------------------------------------------------------------

class Flight:
    """一次投放的飞行仿真驱动器。"""

    def __init__(self, backend, glider, cfg):
        self.backend = backend
        self.glider = glider
        self.cfg = cfg
        self.ctrl = FlightController(cfg)
        self.t_sim = 0.0
        self.state = "flying"     # flying / landed / crashed / timedout / stalled
        self.duration = 0.0       # 滑翔时长（触地/结束时的仿真时间）
        self.pos0 = None
        self.launch()

    def launch(self):
        pos, q, vel, om = launch_pose(self.cfg)
        self.pos0 = pos.copy()
        self.backend.reset(pos, q, vel, om)
        self.ctrl = FlightController(self.cfg)
        self.t_sim = 0.0
        self.state = "flying"
        self.duration = 0.0

    def step(self, dt):
        if self.state != "flying":
            return
        s = self.backend.get_state()
        defs = self.ctrl(s, dt, self.t_sim)
        rho = air_density(float(s.pos[1]))
        F, T, _d = compute_wrench(s, self.glider, defs, rho)
        self.backend.apply_wrench(F, T)
        self.backend.step(dt)
        self.t_sim += dt
        # 结束判定
        if s.pos[1] <= self.cfg.stop_alt:
            self.state = "landed"
        elif abs(body_axis_bank(s.quat)) > np.radians(75):
            self.state = "crashed"
        elif float(np.linalg.norm(s.vel)) < 6.0 and s.pos[1] > 40.0:
            self.state = "stalled"
        elif self.t_sim >= self.cfg.sim_time:
            self.state = "timedout"
        if self.state != "flying":
            self.duration = self.t_sim
        return defs

    def pose_for_hud(self):
        """返回 (y, V, sink, alpha_deg, pitch_deg, bank_deg, L/D)。"""
        s = self.backend.get_state()
        ub = s.vel_body()
        V = float(np.linalg.norm(s.vel))
        qref = 0.5 * air_density(float(s.pos[1])) * V * V
        # 用一次气动估算 L/D（近似，同 aero.diag）
        defs = {"elevator": 0.0, "aileron": 0.0, "rudder": 0.0}
        rho = air_density(float(s.pos[1]))
        _F, _T, d = compute_wrench(s, self.glider, defs, rho)
        ld = d["CL"] / max(d["CD"], 1e-4)
        return (float(s.pos[1]), V, float(-s.vel[1]),
                float(np.degrees(np.arctan2(-ub[1], ub[0]))),
                float(np.degrees(body_axis_pitch(s.quat))),
                float(np.degrees(body_axis_bank(s.quat))), ld)


# ---------------------------------------------------------------------------
# 交互窗口（ViewerGL，需要 novaPhy + WSLg/显示）
# ---------------------------------------------------------------------------

def run_visual(args, backend_cls, glider, cfg):
    try:
        import fix_wsl_gl  # noqa: F401  WSL 下修 ImGui/OpenGL 上下文
    except Exception:  # noqa: BLE001
        pass

    from novaphy.viewer import ViewerGL

    backend = backend_cls(glider)
    flight = Flight(backend, glider, cfg)

    viewer = ViewerGL(width=1280, height=820, ground_size=GROUND_SIZE, enable_imgui=True)
    viewer.set_model(backend.model)
    viewer.show_window()

    renderer = getattr(viewer, "renderer", getattr(viewer, "_renderer", None))
    if renderer is not None and hasattr(renderer, "camera"):
        renderer.camera.dist = 34.0
        renderer.camera.pitch = 0.42
        renderer.camera.yaw = 0.55
        renderer.camera.target = flight.pos0.copy()
    if renderer is not None:
        try:
            renderer._camera_speed = 0.0     # 关相机键盘飞行，避免误操作
        except AttributeError:
            pass

    hud = {"y": 0.0, "V": 0.0, "sink": 0.0, "alpha": 0.0, "pitch": 0.0,
           "bank": 0.0, "ld": 0.0}

    def draw_hud(imgui):
        imgui.text(f"alt {hud['y']:7.1f} m   speed {hud['V']:5.1f} m/s")
        imgui.text(f"sink {hud['sink']:5.2f} m/s   L/D {hud['ld']:5.1f}")
        imgui.text(f"AoA {hud['alpha']:+5.1f} deg   pitch {hud['pitch']:+5.1f} deg")
        imgui.text(f"bank {hud['bank']:+5.1f} deg")
        imgui.separator()
        imgui.text(f"flight time {flight.t_sim:6.1f} s")
        imgui.text(f"config: alt {args.alt}  speed {args.speed}  "
                   f"CG {args.cg:+.2f}  dihedral {args.dihedral}")
        imgui.separator()
        if flight.state == "flying":
            imgui.text("gliding ...  (R=reset)")
        else:
            imgui.text(f"== {flight.state.upper()}  glide time = "
                       f"{flight.duration:6.2f} s ==")

    viewer.register_ui_callback(draw_hud, position="side")

    sim_time = 0.0
    reset_prev = False
    next_frame = time.perf_counter()
    substeps = max(1, round(FRAME_DT * args.time_scale / PHYS_DT))

    try:
        while viewer.is_running():
            now = time.perf_counter()
            dt_real = max(1e-4, now - next_frame)
            next_frame = time.perf_counter() + FRAME_DT

            r_down = viewer.is_key_down("r") if hasattr(viewer, "is_key_down") else False
            if r_down and not reset_prev:
                flight.launch()
                viewer.set_model(backend.model)
                if renderer is not None and hasattr(renderer, "camera"):
                    renderer.camera.target = flight.pos0.copy()
                if renderer is not None and hasattr(renderer, "_follow_target"):
                    renderer._follow_target = None
            reset_prev = r_down

            if viewer.should_step():
                for _ in range(substeps):
                    flight.step(PHYS_DT)
                sim_time = flight.t_sim
                hud.update(dict(zip(("y", "V", "sink", "alpha", "pitch", "bank", "ld"),
                                    flight.pose_for_hud())))

            viewer.begin_frame(sim_time)
            viewer.log_state(backend.state_0)
            viewer.end_frame()

            # 相机平滑跟随（前视：注视点在滑翔机前方，飞机保持在画面中下部）
            if renderer is not None and hasattr(renderer, "camera"):
                s = backend.get_state()
                xb = quat_to_matrix(s.quat)[:, 0]
                xz = np.array([xb[0], 0.0, xb[2]])
                n = np.linalg.norm(xz)
                if n < 1e-6:
                    xz = np.array([1.0, 0.0, 0.0])
                else:
                    xz = xz / n
                target = s.pos + xz * CAMERA_LEAD
                prev = getattr(renderer, "_follow_target", None)
                if prev is None:
                    renderer._follow_target = target.copy()
                else:
                    a = 1.0 - math.exp(-dt_real / FOLLOW_TAU)
                    renderer._follow_target = (1.0 - a) * prev + a * target
                renderer.camera.target = np.asarray(renderer._follow_target, dtype=np.float32)

            # 墙钟节流
            delay = next_frame - time.perf_counter()
            if delay > 0:
                time.sleep(delay)
            elif delay < -FRAME_DT:
                next_frame = time.perf_counter()

            if flight.state != "flying" and sim_time > 0:
                # 结束后仍短暂展示状态，R 可重新投放；保持窗口不自动关闭
                pass
    finally:
        viewer.close()
    print(f"glide time = {flight.duration:.2f} s  ({flight.state})")


# ---------------------------------------------------------------------------
# 无窗口模式（验证 / 快速试参）
# ---------------------------------------------------------------------------

def run_headless(args, backend_cls, glider, cfg):
    backend = backend_cls(glider)
    flight = Flight(backend, glider, cfg)
    n_max = int(cfg.sim_time / PHYS_DT) + 1
    for _ in range(n_max):
        flight.step(PHYS_DT)
        if flight.state != "flying":
            break
    s = backend.get_state()
    out = {
        "alt": args.alt, "speed": args.speed, "cg": args.cg,
        "dihedral": args.dihedral, "autolevel": args.autolevel,
        "backend": getattr(backend, "name", "?"),
        "glide_time_s": round(flight.duration, 3),
        "state": flight.state,
        "end_alt": round(float(s.pos[1]), 2),
        "vref": args.vref,
    }
    print(json.dumps(out, ensure_ascii=False))
    backend.close()
    return out


# ---------------------------------------------------------------------------

def main(argv=None):
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--alt", type=float, default=100.0, help="起飞高度 (m, 默认100)")
    p.add_argument("--speed", type=float, default=36.0, help="初始投放速度 (m/s, 默认36)")
    p.add_argument("--vref", type=float, default=31.0, help="配平目标空速 (m/s)")
    p.add_argument("--cg", type=float, default=0.0,
                   help="重心相对默认沿机体前移量 (m): >0 靠前/更稳/时长短, <0 靠后/易失控")
    p.add_argument("--dihedral", type=float, default=0.0,
                   help="机翼上反角 (°): >0 增强横向静稳定")
    p.add_argument("--autolevel", action=argparse.BooleanOptionalAction, default=True,
                   help="默认开启：副翼自动保持机翼水平；--no-autolevel 关闭以观察上反角作用")
    p.add_argument("--timeout", type=float, default=150.0, help="最长滑翔仿真时间 (s)")
    p.add_argument("--time-scale", type=float, default=2.0,
                   help="交互模式仿真速度倍率(默认2×)，画面仍实时流畅")
    p.add_argument("--backend", default="auto", choices=["auto", "novaphy", "reference"])
    p.add_argument("--headless", action="store_true", help="无窗口模式，跑完打印滑翔时长")
    args = p.parse_args(argv)

    glider = make_glider(args)
    cfg = make_cfg(args)
    BackendCls = _pick_backend(args.backend)

    print(f"glider: alt={args.alt} speed={args.speed} CG={args.cg:+.2f} "
          f"dihedral={args.dihedral} autolevel={args.autolevel}")
    if args.headless:
        run_headless(args, BackendCls, glider, cfg)
    else:
        run_visual(args, BackendCls, glider, cfg)
    return 0


if __name__ == "__main__":
    sys.exit(main())
