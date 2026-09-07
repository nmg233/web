"""plot_flight.py — 飞行遥测 2D 图表（高度剖面 / 空速 / 迎角 / L/D / 俯仰 / 舵面）。

生成 PNG，用于文档说明“气动特性符合预期”（稳定滑翔、恒定迎角/空速等）。
"""

from __future__ import annotations

import os

import numpy as np


def plot_flight(tele, out_png: str, title="Glider flight telemetry (NovaPhy aero model)"):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    t = tele["t"]
    fig, axes = plt.subplots(4, 1, figsize=(11, 11), sharex=True)

    ax = axes[0]
    ax.plot(t, tele["alt"], color="tab:blue", lw=1.2)
    ax.set_ylabel("altitude (m)")
    ax.grid(alpha=0.3)
    ax.set_title(title)

    ax = axes[1]
    ax.plot(t, tele["V"], color="tab:green", lw=1.2, label="airspeed")
    ax.plot(t, np.full_like(t, np.median(tele["V"])),
            "--", color="tab:green", alpha=0.6, label="median")
    ax.set_ylabel("V (m/s)")
    ax.legend(loc="upper right", fontsize=8)
    ax.grid(alpha=0.3)

    ax = axes[2]
    ax.plot(t, np.degrees(tele["alpha"]), color="tab:red", lw=1.2, label="AoA")
    ax.plot(t, tele["sink"], color="tab:orange", lw=1.2, label="sink rate")
    ax.set_ylabel("AoA (deg) / sink (m/s)")
    ax.legend(loc="upper right", fontsize=8)
    ax.grid(alpha=0.3)

    ax = axes[3]
    ld = np.divide(tele["CL"], np.maximum(tele["CD"], 1e-4))
    ax.plot(t, ld, color="tab:purple", lw=1.2, label="L/D")
    ax.axhline(np.median(ld[50:]) if len(ld) > 50 else np.median(ld),
               ls="--", color="tab:purple", alpha=0.6, label="median L/D")
    ax.set_ylabel("L/D")
    ax.set_xlabel("time (s)")
    ax.legend(loc="upper right", fontsize=8)
    ax.grid(alpha=0.3)

    fig.tight_layout()
    fig.savefig(out_png, dpi=120, facecolor="white")
    plt.close(fig)
    return out_png


def plot_trajectory_3d_view(tele, out_png: str, title="3D flight path (world view)"):
    """世界系整体航迹 3D 图（从固定视角，适合看盘旋/滑翔全貌）。"""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from mpl_toolkits.mplot3d.art3d import Line3DCollection

    pos = tele["pos"]
    fig = plt.figure(figsize=(9, 8))
    ax = fig.add_subplot(111, projection="3d")

    # 轨迹按高度着色
    pts = pos
    segs = np.stack([pts[:-1], pts[1:]], axis=1)
    alt = pos[:, 1]
    lc = Line3DCollection(segs, cmap="viridis", linewidth=1.6)
    lc.set_array(alt[:-1])
    ax.add_collection3d(lc)

    # 起点/终点
    ax.scatter(*pts[0], color="green", s=40, label="release")
    ax.scatter(*pts[-1], color="red", s=40, label="end")

    lim = np.abs(pts[:, [0, 2]]).max() * 1.15
    ax.set_xlim(-lim, lim)
    ax.set_zlim(-lim, lim)
    ax.set_ylim(0, max(pts[:, 1].max() * 1.15, 50))
    ax.set_xlabel("X (m)")
    ax.set_ylabel("altitude (m)")
    ax.set_zlabel("Z (m)")
    ax.view_init(elev=22, azim=-60)
    ax.set_title(title)
    ax.legend(fontsize=8)
    fig.tight_layout()
    fig.savefig(out_png, dpi=120, facecolor="white")
    plt.close(fig)
    return out_png
