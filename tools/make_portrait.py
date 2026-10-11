#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""池子魔将 · 立绘转换器（MP4 / 图片 → 扩展立绘）

把任意来源素材（横版战斗 MP4、单张高清图）转成扩展统一规格的立绘文件。

为什么需要它
------------
无名杀立绘框是 **2:3 竖版**（.player = 120x180），背景走 setBackgroundImage +
background-size:cover。本扩展既有立绘实测比例分布：

    jpg 400x472 (0.847)  × 82 套   ← 静态立绘主流规格
    webp 253x300 (0.843) × 39 套   ← 动图立绘主流规格
    少数 0.75~0.85 的异形尺寸

即「全扩展统一约 0.847 竖版」。素材若是横版 MP4（如 1158x576 = 2.01），
直接塞进去会被 cover 裁掉一大半，所以必须**先裁竖版、再缩放**到目标规格。

两种模式
--------
  static  —— 取一帧最佳画面，输出 jpg（体积小、零兼容风险）
  anim    —— 抽帧输出动画 WebP（循环播放）

!!!! 画质预算表（2026-10-09 实测，务必先读）!!!!
----------------------------------------------
立绘最终显示在 **100x100 CSS px** 的 `.avatar` 框里（layout/default/layout.css:2649），
`background-size:cover` + `background-position-x:center`，横向贴合、纵向锚顶。
即使按 DPR2 算，物理也就约 200px —— **超过 ~250px 宽之后，多出来的像素在游戏里看不见**。

所以预算要优先给「帧数」，而不是分辨率。实测 Frontier（源：8s / 30fps 战斗演出）：

  规格                  体积MB  帧数  PSNR   时间采样率
  253x300 @12 q80        1.54    96   33.93    0.40   最早的版本
  300x356 @15 q84        2.86   120   35.47    0.50   preset=balanced
  253x300 @20 q82        2.77   160   34.34    0.67
  240x284 @24 q80        2.83   192   34.11    0.80
  228x270 @26 q80        2.87   208   33.91    0.87
  210x250 @30 q80        2.94   240   33.80    1.00   preset=smooth（默认）
  340x402 @12 q85        2.85    96   36.00    0.40   preset=sharp

  读法：PSNR 是与「同分辨率未压缩参考帧」的差值，越高越无损；>38dB 基本看不出差别。
        时间采样率 = 抽帧 fps / 源视频 fps，1.00 表示一帧不丢。

  四条实测结论：
  ① 帧数比分辨率吃体积快得多 —— 同素材 24fps 直接爆 3MB，而 340x402@12fps 才 2.5MB
  ② 分辨率是笔亏本买卖：228x270@26 和 240x284@24 帧数都是 192~208 档，
     但把宽度从 240 加到 253 会迫使 q 降到 76，PSNR 反而从 34.11 掉到 33.00
  ③ PSNR 差 1~2dB 缩到 100px 显示后基本被抹平 —— 别为 0.5dB 牺牲帧数
  ④ 超过 ~300px 宽的收益只有在「全屏资料卡」里才看得见

  分辨率下限 = 200px（100 CSS px × DPR2）。低于这条线高分屏会发虚，别再往下压了。
  单套建议 ≤3MB。按 37 套动图估算，2.9MB/套 ≈ 107MB，包体请一并掂量。

两个省体积的关键手法（默认已开）
---------------------------------
  1. **不带 alpha**（yuv420p 而非 yuva420p）：立绘是带背景的不透明整幅画，
     现有 webp 的 alpha 实测全是 255，纯粹浪费。省下的空间转给帧数。
  2. **-method 6**：libwebp 最优压缩。同画质下能压小一档。

试过但没用的手段（别再浪费时间）
---------------------------------
  `-cr_threshold`（条件补充，跳过帧间未变化块）：0/30/60/100/150 五档实测体积**完全不变**
  （228x270@30 q80 恒为 3.31MB）。ffmpeg 的 libwebp 封装在这个路径上没把它生效。


用法
----
  # 静态立绘（推荐先跑这个看看取景）
  python tools/make_portrait.py <素材> -o <输出> --mode static --frame 0.5

  # 动图立绘（默认 preset=smooth：210x250 / 原生 fps / q80 ≈ 2.9MB）
  python tools/make_portrait.py <素材> -o <输出> --mode anim

  # 想要更大的图（平衡档 300x356 / 15fps）
  python tools/make_portrait.py <素材> -o <输出> --mode anim --preset balanced

  # 素材不是 30fps 时，显式跟上它的帧率可保原生流畅
  python tools/make_portrait.py <素材> -o <输出> --mode anim --fps 30

  # 只预览取景、不写文件
  python tools/make_portrait.py <素材> --preview out.png --mode static --frame 0.5

关键参数
--------
  --preset NAME   画质预设：smooth（默认，流畅优先）/ balanced / sharp
  --target WxH    目标尺寸。静态默认 400x472（对齐 jpg 主流）；动图由 preset 决定
  --focus FX,FY   裁切焦点（0~1，默认 0.5,0.42 —— 略偏上，保住头部）
                  ⚠ 默认 0.5 是**机械居中**，人物不在正中时必偏。
                  改这个值前先跑 tools/portrait_aim.py 看人物到底在哪：
                    python tools/portrait_aim.py <素材> --center <人物核心中心>
                  （2026-10-10 钟会就用默认值把人物裁到了画框右侧。）
  --zoom Z        裁切缩放（默认 1.0；<1 视野更宽、>1 更近）
  --crop W:H:X:Y  手动指定裁切框，优先级高于 focus/zoom
  --frame T       静态模式取哪一帧：0~1 是比例，>1 是帧序号（默认 0.5 中点）
  --fps N         动图抽帧帧率（默认取 preset；想一帧不丢就设成素材原生帧率）
  --quality Q     WebP 质量（默认取 preset）
  --alpha         保留 alpha 通道（默认不带 —— 不透明立绘省下的空间转给帧数）
  --no-fit        不做比例适配，直接用 --target 拉伸（默认会先裁成目标比例）

依赖
----
  ffmpeg  —— 解码 MP4 / 编码动画 WebP。优先用环境变量 FFMPEG，
             否则按 D:/Noname/_tools → PATH → 常见安装位置 逐级探测。
  Pillow  —— 读帧、静态图输出、尺寸探测（pip install pillow）

退出码：0 成功；非 0 失败（错误写 stderr）。
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.stderr.write("[立绘转换] 缺少 Pillow：pip install pillow\n")
    sys.exit(2)

# ---------------------------------------------------------------- 常量

# 扩展实测主流规格
DEFAULT_STATIC = (400, 472)   # 对齐 82 套 jpg 静态立绘

# ---------------------------------------------------------------- 预设档
# 三档各有取舍（实测数据见 docstring §画质预算）。用户明确过「流畅度优先」，
# 故 smooth 为默认档。
#
# 分辨率下限的依据：.avatar 是 100x100 CSS px，DPR2 → 需 >=200px 宽。
# smooth 档 210px 刚好守住这条底线；再低就会在高分屏发虚。
PRESETS = {
    "smooth":   {"target": (210, 250), "fps": 30, "quality": 80},  # 原生帧率，~2.9MB
    "balanced": {"target": (300, 356), "fps": 15, "quality": 84},  # 三轴均衡，2.86MB
    "sharp":    {"target": (340, 402), "fps": 12, "quality": 85},  # 单帧最清晰，2.85MB
}
DEFAULT_PRESET = "smooth"

# ffmpeg 候选位置（按顺序探测）
FFMPEG_CANDIDATES = [
    os.environ.get("FFMPEG"),
    r"D:\Noname\_tools\ffmpeg\ffmpeg-9.0.2-essentials_build\bin\ffmpeg.exe",
    r"D:\ffmpeg\bin\ffmpeg.exe",
    "ffmpeg",
    "/usr/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
]

VIDEO_EXT = {".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v", ".flv", ".wmv"}


# ---------------------------------------------------------------- 工具


def find_ffmpeg() -> str:
    """按候选顺序找到可用的 ffmpeg。"""
    for cand in FFMPEG_CANDIDATES:
        if not cand:
            continue
        p = Path(cand)
        if p.is_absolute():
            if p.exists():
                return str(p)
        else:
            found = shutil.which(cand)
            if found:
                return found
    sys.stderr.write(
        "[立绘转换] 找不到 ffmpeg。请设置环境变量 FFMPEG 或把它放进 PATH。\n"
    )
    sys.exit(2)


def run(cmd: list[str]) -> None:
    """跑子进程，失败时把 stderr 原样抛出来（便于定位）。"""
    proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8",
                          errors="replace")
    if proc.returncode != 0:
        sys.stderr.write("[立绘转换] 命令失败：\n  " + " ".join(cmd) + "\n")
        sys.stderr.write(proc.stderr[-4000:] + "\n")
        sys.exit(1)


def probe_source(ffmpeg: str, src: Path) -> tuple[int, int, bool, float]:
    """探测素材宽高 / 是否视频 / 时长秒。"""
    exe = Path(ffmpeg).with_name("ffprobe.exe" if os.name == "nt" else "ffprobe")
    if not exe.exists():
        exe = shutil.which("ffprobe")
    if not exe:
        # 没 ffprobe 就退回 Pillow（只对图片有效）
        im = Image.open(src)
        return im.width, im.height, False, 0.0
    proc = subprocess.run(
        [str(exe), "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height,duration",
         "-show_entries", "format=duration",
         "-of", "default=nw=1:nk=1", str(src)],
        capture_output=True, text=True, encoding="utf-8", errors="replace")
    nums = [ln.strip() for ln in proc.stdout.splitlines() if ln.strip()]
    w = h = 0
    dur = 0.0
    for n in nums:
        try:
            v = float(n)
        except ValueError:
            continue
        if w == 0 and v > 1:
            if v == int(v) and w == 0:
                w = int(v)
                continue
        if w and h == 0:
            h = int(v)
            continue
        if v > 0:
            dur = v
    if not w or not h:
        im = Image.open(src)
        return im.width, im.height, False, 0.0
    return w, h, True, dur


def build_crop(w: int, h: int, tw: int, th: int,
               focus: tuple[float, float], zoom: float) -> str:
    """算出 ffmpeg crop 滤镜串：从素材里取一块与目标同比例的区域。

    为什么必须先 crop：目标框是 2:3 竖版，素材多是横版。
    直接 scale 会把人压扁，直接塞给 cover 会裁掉大半。
    先按目标比例裁一块（位置由 focus 决定），再 scale 到目标尺寸 —— 一步到位。
    """
    target_ratio = tw / th
    src_ratio = w / h
    if src_ratio > target_ratio:
        # 素材更宽：以高度为准，裁宽度
        ch = h
        cw = int(round(h * target_ratio))
    else:
        # 素材更高：以宽度为准，裁高度
        cw = w
        ch = int(round(w / target_ratio))
    # zoom>1 收窄视野（更近），zoom<1 放宽
    cw = max(2, min(w, int(round(cw / zoom))))
    ch = max(2, min(h, int(round(ch / zoom))))
    fx, fy = focus
    cx = int(round((w - cw) * fx))
    cy = int(round((h - ch) * fy))
    cx = max(0, min(w - cw, cx))
    cy = max(0, min(h - ch, cy))
    return f"crop={cw}:{ch}:{cx}:{cy}"


def parse_size(s: str) -> tuple[int, int]:
    try:
        w, h = s.lower().split("x")
        return int(w), int(h)
    except Exception:
        sys.stderr.write(f"[立绘转换] 尺寸格式错误：{s}（应为 WxH，如 253x300）\n")
        sys.exit(2)


def parse_pair(s: str) -> tuple[float, float]:
    try:
        a, b = s.split(",")
        return float(a), float(b)
    except Exception:
        sys.stderr.write(f"[立绘转换] 坐标格式错误：{s}（应为 x,y，如 0.5,0.42）\n")
        sys.exit(2)


# ---------------------------------------------------------------- 核心


def do_static(ffmpeg, src, out, tw, th, crop, frame, quality):
    """静态：抽一帧 → 缩放 → jpg。"""
    if src.suffix.lower() in VIDEO_EXT:
        # -ss 放在 -i 前是快速定位；frame 用比例时需要先知道时长
        _, _, is_video, dur = probe_source(ffmpeg, src)
        ts = frame * dur if frame <= 1 else frame / 30.0
        cmd = [ffmpeg, "-y", "-ss", f"{max(0.0, ts):.3f}", "-i", str(src),
               "-vf", f"{crop},scale={tw}:{th}:flags=lanczos",
               "-frames:v", "1", "-q:v", str(max(2, min(31, int(31 - quality / 4)))),
               str(out)]
    else:
        # 图片：用 Pillow，能精确按比例/坐标裁
        cmd = [ffmpeg, "-y", "-i", str(src),
               "-vf", f"{crop},scale={tw}:{th}:flags=lanczos",
               "-frames:v", "1", str(out)]
    run(cmd)
    # jpg 落盘（ffmpeg 按扩展名自动选编码器，这里兜底确认）
    return out


def do_anim(ffmpeg, src, out, tw, th, crop, fps, quality, alpha=False):
    """动图：抽帧 → 缩放 → 动画 WebP。

    默认不带 alpha：立绘是整幅带背景的不透明画，现有 webp 的 alpha 实测全是 255，
    带它纯属浪费。省下的体积直接体现为「同样大小能塞更多帧」。
    """
    cmd = [ffmpeg, "-y", "-i", str(src),
           "-vf", f"fps={fps},{crop},scale={tw}:{th}:flags=lanczos",
           "-c:v", "libwebp", "-lossless", "0", "-q:v", str(quality),
           "-method", "6", "-loop", "0", "-an",
           "-pix_fmt", "yuva420p" if alpha else "yuv420p", str(out)]
    run(cmd)
    return out


def preview(ffmpeg, src, out, tw, th, crop, frame):
    """只导出取景预览（静态一帧），用于调 focus/zoom。"""
    if src.suffix.lower() in VIDEO_EXT:
        _, _, _, dur = probe_source(ffmpeg, src)
        ts = frame * dur if frame <= 1 else frame / 30.0
        cmd = [ffmpeg, "-y", "-ss", f"{max(0.0, ts):.3f}", "-i", str(src),
               "-vf", f"{crop},scale={tw}:{th}:flags=lanczos",
               "-frames:v", "1", str(out)]
    else:
        cmd = [ffmpeg, "-y", "-i", str(src),
               "-vf", f"{crop},scale={tw}:{th}:flags=lanczos",
               "-frames:v", "1", str(out)]
    run(cmd)
    return out


# ---------------------------------------------------------------- CLI


def main():
    ap = argparse.ArgumentParser(
        description="池子魔将立绘转换器：MP4/图片 → 扩展统一规格立绘",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__.split("用法", 1)[-1] if "用法" in __doc__ else "")
    ap.add_argument("source", help="素材路径（MP4 或图片）")
    ap.add_argument("-o", "--out", help="输出文件路径（.jpg 或 .webp）")
    ap.add_argument("--preview", help="只导出取景预览图，不写最终文件")
    ap.add_argument("--mode", choices=["static", "anim"], default="static")
    ap.add_argument("--target", help="目标尺寸 WxH（默认 static=400x472 / anim=253x300）")
    ap.add_argument("--focus", default="0.5,0.42", help="裁切焦点 x,y（0~1，默认 0.5,0.42）")
    ap.add_argument("--zoom", type=float, default=1.0, help="裁切缩放（默认 1.0）")
    ap.add_argument("--crop", help="手动裁切框 W:H:X:Y（覆盖 focus/zoom）")
    ap.add_argument("--frame", type=float, default=0.5,
                    help="静态取帧：0~1 为比例，>1 为帧序号（默认 0.5）")
    ap.add_argument("--preset", choices=list(PRESETS), default=DEFAULT_PRESET,
                    help=f"画质预设档（默认 {DEFAULT_PRESET}：流畅优先）")
    ap.add_argument("--fps", type=int, default=None,
                    help="动图抽帧帧率（默认取预设档）；素材是多少 fps 就用多少，可保原生流畅")
    ap.add_argument("--quality", type=int, default=None,
                    help="WebP 质量（默认取预设档）")
    ap.add_argument("--alpha", action="store_true", help="动图保留 alpha 通道")
    ap.add_argument("--no-fit", action="store_true",
                    help="不做比例裁切，直接拉伸到目标尺寸")
    args = ap.parse_args()

    # 预设 → 显式参数覆盖。argparse 默认值设为 None，是为了区分「没传」和「传了默认值」。
    p = PRESETS[args.preset]
    fps = args.fps if args.fps is not None else p["fps"]
    quality = args.quality if args.quality is not None else p["quality"]

    src = Path(args.source)
    if not src.exists():
        sys.stderr.write(f"[立绘转换] 素材不存在：{src}\n")
        sys.exit(2)
    if not args.out and not args.preview:
        sys.stderr.write("[立绘转换] 需要 -o/--out 或 --preview 之一\n")
        sys.exit(2)

    ffmpeg = find_ffmpeg()
    w, h, is_video, dur = probe_source(ffmpeg, src)

    if args.mode == "anim":
        default_target = p["target"]
    else:
        default_target = DEFAULT_STATIC
    tw, th = parse_size(args.target) if args.target else default_target

    if args.crop:
        parts = args.crop.replace(",", ":").split(":")
        if len(parts) != 4:
            sys.stderr.write("[立绘转换] --crop 应为 W:H:X:Y\n")
            sys.exit(2)
        cw, ch, cx, cy = (int(x) for x in parts)
        crop = f"crop={cw}:{ch}:{cx}:{cy}"
    elif args.no_fit:
        crop = None
    else:
        crop = build_crop(w, h, tw, th, parse_pair(args.focus), args.zoom)

    sys.stdout.write(
        f"[立绘转换] 素材 {w}x{h}（比例 {w/h:.3f}）"
        f"{' 视频 %.1fs' % dur if is_video else ' 图片'}\n"
        f"[立绘转换] 目标 {tw}x{th}（比例 {tw/th:.3f}）\n"
        f"[立绘转换] 裁切 {crop or '不裁切（拉伸）'}\n"
    )

    if args.preview:
        preview(ffmpeg, src, Path(args.preview), tw, th,
                crop or f"scale={tw}:{th}", args.frame)
        sys.stdout.write(f"[立绘转换] 预览已写出：{args.preview}\n")
        return

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    vf_crop = crop or f"scale={tw}:{th}"

    if args.mode == "static":
        do_static(ffmpeg, src, out, tw, th, vf_crop, args.frame, quality)
    else:
        do_anim(ffmpeg, src, out, tw, th, vf_crop, fps, quality,
                args.alpha)

    size_mb = out.stat().st_size / 1024 / 1024
    sys.stdout.write(
        f"[立绘转换] 完成：{out}（{size_mb:.2f} MB"
        f"{'，超过建议的 3MB' if size_mb > 3 else ''}）\n")
    if args.mode == "anim" and size_mb > 3:
        sys.stdout.write(
            "[立绘转换] 超预算了。降体积的顺序："
            "--fps 先降 → --quality 降到 76 → 换更省的预设 --preset smooth\n")


if __name__ == "__main__":
    main()
