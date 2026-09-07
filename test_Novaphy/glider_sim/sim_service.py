#!/usr/bin/env python3
"""sim_service.py — 供 PBL 平台后端调用的滑翔机模拟服务（headless，进程内一次性）。

与 run_glider / glider_interactive 复用同一套气动模型与积分后端
（aircraft.py / aero.py / sim_core.py），学生提交
  上反角(°)  +  重心前移量(m)  +  初始投放速度(m/s)
后由平台后端 spawn 本脚本，在 --outdir 输出：
  summary.json          指标摘要（含 reason / glide_time / 距离 / 下沉率 / L/D 等）
  flight_telemetry.csv  全量遥测
  flight_telemetry.png  高度/空速/迎角/下沉率/L-D 曲线
  trajectory3d.png      世界系 3D 航迹
最终向 stdout 打印一行 JSON（平台后端据此落库）。

后端自动选择：
  - Linux x86_64 + CPython 3.11 且装有 novaphy wheel → novaPhy 物理后端（默认 prefer）；
  - 其它环境（Windows / 无 novaPhy）→ 纯 numpy reference 后端（行为等价，仅积分实现不同）。
可用 --backend novaphy|reference 强制指定。

示例：
  python sim_service.py --dihedral 5 --cg 0.0 --speed 36 --alt 150 --outdir output/sim1
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys

import numpy as np

from aircraft import Glider
from sim_core import SimConfig, run_flight, flight_summary


def _novaphy_usable():
    try:
        from backend_novaphy import novaphy as _nv
        return _nv is not None
    except Exception:  # noqa: BLE001
        return False


def _pick_backend(name):
    if name == "reference":
        from backend_reference import ReferenceBackend
        return ReferenceBackend
    usable = _novaphy_usable()
    if name == "novaphy":
        if not usable:
            raise SystemExit("novaPhy 后端不可用：请改用 --backend reference，"
                             "或在 Linux x86_64 + CPython 3.11 环境安装 novaphy wheel 后运行。")
        from backend_novaphy import NovaPhyBackend
        return NovaPhyBackend
    if usable:
        from backend_novaphy import NovaPhyBackend
        return NovaPhyBackend
    from backend_reference import ReferenceBackend
    return ReferenceBackend


def write_csv(tele, path):
    keys = ["t", "alt", "V", "alpha", "sink", "CL", "CD", "bank", "pitch"]
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(keys)
        n = len(tele["t"])
        for i in range(n):
            w.writerow([float(tele[k][i]) for k in keys])


def write_plots(tele, outdir, backend_name, params):
    from plot_flight import plot_flight, plot_trajectory_3d_view
    tag = f"[{backend_name}]  CG={params['cg']:+.2f}m  dihedral={params['dihedral']}deg  V0={params['speed']}m/s"
    plot_flight(tele, os.path.join(outdir, "flight_telemetry.png"),
                title=f"Glider telemetry  {tag}")
    plot_trajectory_3d_view(tele, os.path.join(outdir, "trajectory3d.png"),
                            title=f"3D flight path  {tag}")


def main(argv=None):
    p = argparse.ArgumentParser(description="PBL 滑翔机模拟服务（headless）")
    p.add_argument("--dihedral", type=float, default=0.0, help="机翼上反角 (°)")
    p.add_argument("--cg", type=float, default=0.0,
                   help="重心相对默认沿机体前移量 (m)，>0 靠前（静稳↑/时长短），<0 靠后（易失稳）")
    p.add_argument("--speed", type=float, default=36.0, help="初始投放速度 (m/s)")
    p.add_argument("--alt", type=float, default=150.0, help="投放高度 (m)")
    p.add_argument("--timeout", type=float, default=90.0, help="最长仿真时间 (s)")
    p.add_argument("--autolevel", action=argparse.BooleanOptionalAction, default=False,
                   help="默认关闭横滚/偏航自动保持：考察上反角与重心对被动稳定性的真实影响；"
                        "--autolevel 可开启让飞机更易保持平飞")
    p.add_argument("--backend", default="auto", choices=["auto", "novaphy", "reference"])
    p.add_argument("--video", action="store_true", help="额外渲染 MP4 飞行回放（需 imageio-ffmpeg）")
    p.add_argument("--video-fps", type=int, default=12, help="回放帧率")
    p.add_argument("--video-max", type=float, default=60.0,
                   help="回放最长覆盖仿真秒数（实际取 min(整段时长, 该值))")
    p.add_argument("--outdir", default="output/sim", help="输出目录")
    args = p.parse_args(argv)

    outdir = os.path.abspath(args.outdir)
    os.makedirs(outdir, exist_ok=True)

    glider = Glider(dihedral_deg=float(args.dihedral), cg_x=float(args.cg))
    cfg = SimConfig()
    cfg.start_alt = float(args.alt)
    cfg.start_speed = float(args.speed)
    cfg.V_ref = 31.0
    cfg.sim_time = float(args.timeout)
    cfg.maneuver = "straight"
    if not args.autolevel:
        # 关闭主动横滚/偏航保持，让学生观察布局参数（上反角/重心）产生的被动稳定效果
        cfg.gain_roll = 0.0
        cfg.gain_roll_rate = 0.0
        cfg.gain_beta = 0.0
        cfg.gain_yaw_rate = 0.0

    BackendCls = _pick_backend(args.backend)
    backend = BackendCls(glider)
    tele = run_flight(backend, glider, cfg)
    summary = flight_summary(tele)

    files = {"summary": "summary.json", "csv": "flight_telemetry.csv",
             "telemetry_png": "flight_telemetry.png", "trajectory_png": "trajectory3d.png",
             "video": "flight_replay.mp4"}
    write_csv(tele, os.path.join(outdir, files["csv"]))
    write_plots(tele, outdir, backend.name, {
        "cg": args.cg, "dihedral": args.dihedral, "speed": args.speed})

    # 可选：MP4 飞行回放（依赖 imageio-ffmpeg；缺失/失败时跳过，不影响主结果）
    if args.video:
        try:
            from render import make_video
            vdur = min(float(tele["t"][-1]), max(5.0, float(args.video_max)))
            make_video(
                tele, glider,
                os.path.join(outdir, files["video"]),
                fps=max(4, int(args.video_fps)),
                start=0.0, end=vdur,
                camera="fixed",
                cfg_view=dict(spacing=80.0, trail=5000, elev=30, azim=-90,
                              scale=6.0, ground_color=(0.45, 0.6, 0.45, 0.4),
                              trail_color=(0.2, 0.45, 0.85, 0.95)),
                hud=True, figsize=(10.0, 7.5), dpi=100,
                progress=lambda *a, **k: None)
            print(f"[video] wrote {files['video']} ({vdur:.0f}s @ {args.video_fps}fps)")
        except ImportError as exc:
            print(f"[video] skipped: {exc}", file=sys.stderr)
            files["video"] = None
        except Exception as exc:  # noqa: BLE001
            print(f"[video] failed: {exc}", file=sys.stderr)
            files["video"] = None
    else:
        files["video"] = None

    backend.close()

    result = {
        "params": {
            "dihedral_deg": round(float(args.dihedral), 3),
            "cg_x": round(float(args.cg), 3),
            "speed": round(float(args.speed), 3),
            "alt": round(float(args.alt), 3),
            "autolevel": args.autolevel,
        },
        "backend": backend.name,
        "reason": summary.get("reason", "ok"),
        "glide_time_s": round(summary["time"], 2),
        "distance_m": round(summary["dist"], 1),
        "alt_start": round(summary["alt_start"], 1),
        "alt_end": round(summary["alt_end"], 1),
        "mean_sink_mps": round(summary["sink"], 3),
        "mean_speed_mps": round(summary["speed"], 2),
        "glide_ratio": round(summary["glide_ratio"], 2),
        "steps": int(tele["steps"]),
        "files": files,
    }

    with open(os.path.join(outdir, "summary.json"), "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"error": str(exc)}, ensure_ascii=False))
        sys.exit(1)
