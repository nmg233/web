#!/usr/bin/env python3
"""run_glider.py — 滑翔机气动仿真 + 3D 展示 命令行入口。

示例：
  # 无 novaPhy 环境（本机 Windows 等）自动用 reference 后端：
  python run_glider.py --maneuver circuit --seconds 60

  # 目标 Linux 环境已装 novaPhy：
  python run_glider.py --backend novaphy --maneuver circuit --seconds 60

  # 只仿真不渲染：
  python run_glider.py --backend novaphy --no-vis
"""

from __future__ import annotations

import argparse
import json
import os
import sys

import numpy as np

from aircraft import Glider
from sim_core import SimConfig, flight_summary, run_flight


def _novaphy_usable():
    """novaphy 是否真正可加载（Linux+Py3.11 安装后可用）。"""
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
            raise SystemExit(
                "novaPhy 后端不可用：本机无法加载 novaphy。请改用 --backend reference，"
                "或在目标 Linux x86_64 + CPython 3.11 环境安装 novaphy wheel 后运行。")
        from backend_novaphy import NovaPhyBackend
        return NovaPhyBackend
    # auto
    if usable:
        from backend_novaphy import NovaPhyBackend
        return NovaPhyBackend
    from backend_reference import ReferenceBackend
    return ReferenceBackend


def build_config(args) -> SimConfig:
    cfg = SimConfig()
    cfg.sim_time = float(args.seconds)
    cfg.maneuver = args.maneuver
    cfg.bank_cmd_deg = float(args.bank_deg)
    if args.sine_period:
        cfg.sine_period = float(args.sine_period)
    if args.alt:
        cfg.start_alt = float(args.alt)
    if args.V_ref:
        cfg.V_ref = float(args.V_ref)
    return cfg


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--backend", choices=["auto", "novaphy", "reference"], default="auto",
                   help="物理后端（novaphy 需在 Linux x86_64+Py3.11 环境；本机回退 reference）")
    p.add_argument("--seconds", type=float, default=60.0, help="仿真时长 (s)")
    p.add_argument("--maneuver", choices=["straight", "circuit", "sine"], default="circuit",
                   help="机动：直飞 / 持续盘旋 / 蛇形")
    p.add_argument("--bank-deg", type=float, default=22.0, help="盘旋/蛇形目标坡度 (°)")
    p.add_argument("--sine-period", type=float, default=0.0, help="蛇形周期 (s，0=自动)")
    p.add_argument("--alt", type=float, default=0.0, help="投放高度 (m，0=默认320)")
    p.add_argument("--V-ref", type=float, default=0.0, help="巡航空速 (m/s，0=默认31)")
    p.add_argument("--outdir", default="output", help="输出目录")
    p.add_argument("--no-vis", action="store_true", help="不生成任何可视化/图表")
    p.add_argument("--no-gif", action="store_true", help="跳过 GIF")
    p.add_argument("--no-plot", action="store_true", help="跳过 PNG 图表")
    p.add_argument("--no-csv", action="store_true", help="跳过 CSV 导出")
    p.add_argument("--no-json", action="store_true", help="跳过 JSON 摘要")
    p.add_argument("--gif-start", type=float, default=12.0, help="GIF 起始时刻")
    p.add_argument("--gif-end", type=float, default=0.0, help="GIF 结束时刻(0=仿真末)")
    p.add_argument("--gif-fps", type=int, default=24)
    p.add_argument("--view-half", type=float, default=0.0,
                   help="追逐相机画面半宽（越大越远；0=默认 20）")
    p.add_argument("--seed", type=int, default=0, help="固定初始扰动（预留，未用）")
    args = p.parse_args(argv)

    glider = Glider()
    cfg = build_config(args)
    BackendCls = _pick_backend(args.backend)
    backend = BackendCls(glider)
    print(f"[run] backend = {backend.name}   maneuver = {cfg.maneuver}   "
          f"t_end = {cfg.sim_time:.0f} s")

    tele = run_flight(backend, glider, cfg)
    summary = flight_summary(tele)
    print("[summary] " + json.dumps(summary, indent=2))
    print(f"[summary] reason = {tele['reason']}")

    if args.no_vis:
        backend.close()
        return 0

    outdir = os.path.abspath(args.outdir)
    os.makedirs(outdir, exist_ok=True)

    # CSV
    if not args.no_csv:
        _write_csv(tele, os.path.join(outdir, "flight_telemetry.csv"))

    # PNG 图表 + 3D 航迹
    if not args.no_plot:
        from plot_flight import plot_flight, plot_trajectory_3d_view
        plot_flight(tele, os.path.join(outdir, "flight_telemetry.png"),
                    title=f"Glider flight telemetry  [{backend.name} / {cfg.maneuver}]")
        plot_trajectory_3d_view(
            tele, os.path.join(outdir, "trajectory3d.png"),
            title=f"3D flight path  [{backend.name} / {cfg.maneuver}]")
        print("[plot] wrote PNG charts")

    # GIF（3D 追逐镜头）
    if not args.no_gif:
        from render import make_gif
        cfg_view = dict(dist=36, height=52, lateral=16, view_half=15.0,
                        ground=340, spacing=25, trail=1000, elev=30, azim=-55)
        if args.view_half and args.view_half > 0:
            cfg_view["view_half"] = args.view_half
        gend = args.gif_end if args.gif_end > 0 else float(tele["t"][-1])
        if gend > args.gif_start:
            gif_path = os.path.join(outdir, "glider_flight.gif")
            print(f"[gif] rendering {args.gif_start:.0f}..{gend:.0f}s "
                  f"@{args.gif_fps}fps ...")
            make_gif(tele, glider, gif_path, fps=args.gif_fps,
                     start=args.gif_start, end=gend, cfg_view=cfg_view, hud=True)
            print(f"[gif] wrote {gif_path}")
        else:
            print("[gif] skipped (gif_end <= gif_start)")

    # JSON 摘要
    if not args.no_json:
        with open(os.path.join(outdir, "summary.json"), "w", encoding="utf-8") as f:
            json.dump({"config": vars(args), "summary": summary,
                       "backend": backend.name, "reason": tele["reason"]},
                      f, ensure_ascii=False, indent=2)

    backend.close()
    print(f"[done] outputs in {outdir}")
    return 0


def _write_csv(tele, path):
    import csv
    keys = ["t", "alt", "V", "alpha", "beta", "sink", "CL", "CD",
            "elevator", "aileron", "rudder", "bank", "pitch"]
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["time_s", "x", "y", "z", "qx", "qy", "qz", "qw"] + keys[1:])
        for i in range(len(tele["t"])):
            p = tele["pos"][i]
            q = tele["quat"][i]
            row = ([tele["t"][i]]
                   + [f"{v:.4f}" for v in p]
                   + [f"{v:.5f}" for v in q]
                   + [f"{tele[k][i]:.4f}" for k in keys[1:]])
            w.writerow(row)
    return path


if __name__ == "__main__":
    sys.exit(main())
