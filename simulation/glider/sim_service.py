#!/usr/bin/env python3
"""sim_service.py — 供 PBL 平台后端调用的滑翔机模拟服务（headless，进程内一次性）。

复用 glider_sim 的气动模型与积分后端（aircraft / aero / sim_core），学生提交
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
import platform
import sys

# numpy / aircraft / sim_core 均为延迟导入（见 main）：
# --probe 诊断模式需要在依赖缺失时仍能启动并输出环境报告。


def _novaphy_usable():
    try:
        from backend_novaphy import novaphy as _nv
        return _nv is not None
    except Exception:  # noqa: BLE001
        return False


def _detect_backend_name():
    if _novaphy_usable():
        return "novaphy"
    try:
        import numpy  # noqa: F401
        return "reference"
    except Exception:  # noqa: BLE001
        return ""


def _probe(probe_outdir, renderer=None):
    """输出引擎环境探测 JSON（不执行仿真）。"""

    def has(mod):
        try:
            __import__(mod)
            return True
        except Exception:  # noqa: BLE001
            return False

    result = {
        "ready": False,
        "python": platform.python_version(),
        "backend": "",
        "numpy": has("numpy"),
        "matplotlib": has("matplotlib"),
        "moderngl": has("moderngl"),
        "trimesh": has("trimesh"),
        "gl_context": False,
        "renderer": "mpl",
        "ffmpeg": False,
        "novaphy": _novaphy_usable(),
        "outputWritable": False,
    }
    result["backend"] = "novaphy" if result["novaphy"] else ("reference" if result["numpy"] else "")
    try:
        import imageio_ffmpeg
        result["ffmpeg"] = hasattr(imageio_ffmpeg, "get_ffmpeg_exe")
    except Exception:  # noqa: BLE001
        result["ffmpeg"] = False
    if result["moderngl"]:
        result["gl_context"] = _gl_context_ok()
    # 生效渲染器：arg > env GLIDER_RENDERER > 默认 mpl
    result["renderer"] = renderer or os.environ.get("GLIDER_RENDERER", "mpl")

    outdir = os.path.abspath(probe_outdir or "output/_probe")
    try:
        os.makedirs(outdir, exist_ok=True)
        probe_file = os.path.join(outdir, ".probe.tmp")
        with open(probe_file, "w", encoding="utf-8") as f:
            f.write("ok")
        os.remove(probe_file)
        result["outputWritable"] = True
    except Exception:  # noqa: BLE001
        result["outputWritable"] = False

    # ready = 可完成一次参考/真机仿真：需要 numpy + 后端 + matplotlib + 输出目录可写；
    # ffmpeg 仅影响 MP4 回放（缺失时优雅跳过），不参与 ready 判定。
    result["ready"] = bool(
        result["numpy"] and result["backend"] and result["matplotlib"] and result["outputWritable"]
    )
    print(json.dumps(result, ensure_ascii=False))
    return 0


def _gl_context_ok():
    """probe 用：尝试创建 standalone GL 上下文（guarded，任何失败返回 False）。"""
    try:
        from gldeferred import create_context
        handle = create_context(64, 64)
        handle.close()
        return True
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


def _parse_gl_rot(s):
    """'yaw,pitch,roll'（度）-> GLConfig.model_rot = (roll, yaw, pitch)（绕机体 X/Y/Z）。"""
    try:
        yaw, pitch, roll = (float(v) for v in str(s).split(","))
    except ValueError as exc:
        raise SystemExit(f"--gl-model-rot 需为 'yaw,pitch,roll'（度），收到：{s!r}") from exc
    return (roll, yaw, pitch)


def _parse_gl_size(s):
    """'WxH' -> (W, H)；None -> None（按相机取默认）。"""
    if s is None:
        return None
    try:
        w, h = str(s).lower().split("x")
        size = (int(w), int(h))
        if size[0] < 64 or size[1] < 64:
            raise ValueError
        return size
    except ValueError as exc:
        raise SystemExit(f"--gl-size 需为 'WxH'（>=64），收到：{s!r}") from exc


def _gl_setup(args):
    """把 CLI GL 参数组装成 (GLConfig, cfg_view)。延迟导入：mpl 路径不触碰 GL 依赖。"""
    from gldeferred import GLConfig
    cfg = GLConfig(
        model=args.gl_model,
        model_fwd=args.gl_model_fwd,
        model_up=args.gl_model_up,
        model_rot=_parse_gl_rot(args.gl_model_rot),
        model_scale=float(args.gl_model_scale),
        model_center=args.gl_model_center,
        trail_state=args.gl_trail_state,
        trail_width=float(args.gl_trail_width),
        vert=None if args.gl_vert is None else float(args.gl_vert),
        skybox=args.gl_skybox,
    )
    cfg_view = dict(trail_state=args.gl_trail_state,
                    vert=None if args.gl_vert is None else float(args.gl_vert))
    return cfg, cfg_view


def main(argv=None):
    p = argparse.ArgumentParser(description="PBL 滑翔机模拟服务（headless）")
    p.add_argument("--probe", action="store_true", help="输出引擎环境探测 JSON 后退出")
    p.add_argument("--probe-outdir", default="output/_probe", help="探测输出可写性时使用的目录")
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
    p.add_argument("--renderer", choices=["mpl", "gl"], default=None,
                   help="回放渲染器：mpl（默认，matplotlib）或 gl（GLB + 延迟渲染）；"
                        "优先级 arg > 环境变量 GLIDER_RENDERER > 默认 mpl；"
                        "gl 不可用时自动回退 mpl")
    p.add_argument("--video", action="store_true", help="额外渲染 MP4 飞行回放（需 imageio-ffmpeg）")
    p.add_argument("--video-fps", type=int, default=12, help="回放帧率")
    p.add_argument("--video-max", type=float, default=60.0,
                   help="回放最长覆盖仿真秒数（实际取 min(整段时长, 该值))")
    # ---- GL 渲染途径（仅 --renderer gl / --gl-* 调试模式时加载依赖）----
    p.add_argument("--gl-model", default=None, metavar="PATH",
                   help="GLB/OBJ 模型路径；缺省用 assets/airplane.glb（失败回退程序化盒体）")
    p.add_argument("--gl-model-fwd", default="-x", choices=["+x", "-x", "+y", "-y", "+z", "-z"],
                   help="模型机头轴（默认 -x，已按 airplane.glb 实测固化：垂尾在 +x 端）")
    p.add_argument("--gl-model-up", default="+y", choices=["+x", "-x", "+y", "-y", "+z", "-z"],
                   help="模型上轴（默认 +y）")
    p.add_argument("--gl-model-rot", default="0,0,0", metavar="YAW,PITCH,ROLL",
                   help="模型姿态微调（度，叠加在轴转换后）")
    p.add_argument("--gl-model-scale", type=float, default=0.0, metavar="F|0",
                   help="模型缩放；0=auto（最长包围盒边归一到机身长度）")
    p.add_argument("--gl-model-center", default="bbox", choices=["bbox", "origin"],
                   help="模型居中方式：bbox（减包围盒中心，默认）或 origin（保留原点）")
    p.add_argument("--gl-camera", default=None, choices=["fixed", "chase", "chase2"],
                   help="机位：fixed（走廊全景，默认）/ chase（后上方跟随）/ "
                        "chase2（低空平视跟随，视线近水平平行于地面）")
    p.add_argument("--gl-size", default=None, metavar="WxH",
                   help="渲染分辨率；缺省 fixed=1280x720 / chase、chase2=1024x576")
    p.add_argument("--gl-vert", type=float, default=None, metavar="K",
                   help="场景竖直增强系数（fixed 默认 3.0，chase 1.0）；只影响视图，姿态保持物理")
    p.add_argument("--gl-trail-state", default="alt", choices=["none", "alt"],
                   help="拖尾着色：alt=高空暖橙到低空亮绿渐变（默认），none=恒定蓝")
    p.add_argument("--gl-trail-width", type=float, default=4.0, metavar="PX",
                   help="拖尾宽度（像素，默认 4；0=关闭拖尾）")
    p.add_argument("--gl-skybox", action=argparse.BooleanOptionalAction, default=True,
                   help="使用等距柱状环境贴图作为天空（默认开；--no-gl-skybox 关，退渐变天空）")
    p.add_argument("--gl-hud", action=argparse.BooleanOptionalAction, default=True,
                   help="回放叠加飞行数据 HUD（默认开）")
    p.add_argument("--gl-preview", type=float, nargs="?", const=0.0, default=None, metavar="T",
                   help="仿真后输出单帧 PNG 预览（t=T 秒，缺省 0）到 outdir/gl_preview.png")
    p.add_argument("--gl-pose-set", default=None, choices=["level", "pitch20", "bank30", "yaw90"],
                   help="配合 --gl-preview：用规范静态姿态替代该时刻的真实姿态（姿态目检）")
    p.add_argument("--gl-live", action="store_true",
                   help="仿真后在原生 glfw 窗口实时播放（ESC / 关窗退出，默认 chase 机位）")
    p.add_argument("--gl-pose-check", action="store_true",
                   help="姿态链路自检（纯数学，不跑仿真、不建 GL 上下文）后退出")
    p.add_argument("--outdir", default="output/sim", help="输出目录")
    args = p.parse_args(argv)

    # 渲染器生效值：arg > env GLIDER_RENDERER > 默认 mpl
    renderer = args.renderer or os.environ.get("GLIDER_RENDERER", "mpl") or "mpl"

    if args.probe:
        return _probe(args.probe_outdir, renderer=args.renderer)

    if args.gl_pose_check:
        from gldeferred import pose_check
        fails = pose_check(args.gl_model_fwd, args.gl_model_up, _parse_gl_rot(args.gl_model_rot))
        return 1 if fails else 0

    # 正式仿真才导入重依赖（numpy / 气动模型），保证 --probe 在依赖缺失时也能诊断
    from aircraft import Glider
    from sim_core import SimConfig, run_flight, flight_summary

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
    # renderer=gl 时走延迟渲染管线；GL 依赖缺失 / 上下文失败回退 mpl（沿用惯例）
    if args.video:
        camera = args.gl_camera or "fixed"
        size = _parse_gl_size(args.gl_size) or \
            ((1024, 576) if camera in ("chase", "chase2") else (1280, 720))
        vdur = min(float(tele["t"][-1]), max(5.0, float(args.video_max)))
        done = False
        if renderer == "gl":
            try:
                from gldeferred import make_video_gl
                gl_cfg, gl_cfg_view = _gl_setup(args)
                make_video_gl(tele, glider, os.path.join(outdir, files["video"]),
                              fps=max(4, int(args.video_fps)), start=0.0, end=vdur,
                              cfg_view=gl_cfg_view, hud=args.gl_hud, camera=camera,
                              size=size, cfg=gl_cfg, progress=lambda *a, **k: None)
                print(f"[video] wrote {files['video']} via gl ({vdur:.0f}s @ {args.video_fps}fps)")
                done = True
            except Exception as exc:  # noqa: BLE001
                print(f"[video] gl unavailable, fallback to mpl: {exc}", file=sys.stderr)
        if not done:
            try:
                from render import make_video
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

    # 调试/目检：单帧 PNG 预览与实时窗口（不影响主产物；失败仅告警）
    if args.gl_preview is not None or args.gl_live:
        camera_dbg = args.gl_camera or ("chase" if args.gl_live else "fixed")
        size_dbg = _parse_gl_size(args.gl_size) or \
            ((1024, 576) if camera_dbg in ("chase", "chase2") else (1280, 720))
        try:
            gl_cfg, gl_cfg_view = _gl_setup(args)
            if args.gl_preview is not None:
                from gldeferred import preview_png
                out_png = os.path.join(outdir, "gl_preview.png")
                preview_png(tele, glider, out_png, t=float(args.gl_preview),
                           pose_set=args.gl_pose_set, cfg_view=gl_cfg_view,
                           camera=camera_dbg, size=size_dbg, cfg=gl_cfg,
                           hud=args.gl_hud, progress=print)
                print(f"[gl-preview] wrote {out_png}")
            if args.gl_live:
                from gldeferred import live_window
                live_window(tele, glider, fps=max(4, int(args.video_fps)),
                            cfg_view=gl_cfg_view, camera=camera_dbg, size=size_dbg,
                            cfg=gl_cfg, progress=print)
        except Exception as exc:  # noqa: BLE001
            print(f"[gl] preview/live failed: {exc}", file=sys.stderr)

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
        "renderer": renderer,
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
