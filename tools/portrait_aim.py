#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""池子魔将 · 立绘取景瞄准器（决定 --focus / --crop 该填多少）

为什么需要它
------------
make_portrait.py 的 --focus 默认 0.5，是**机械居中**：把源片按目标比例裁一块，
让这块的几何中心落在源片几何中心。但源片是**横版战斗图**，人物几乎从来不在正中间——
有的偏左（挥剑、冲锋），有的偏右（回头、站立），旁边还有大片光刃 / 飘带 / 旗子。

2026-10-10 钟会就是典型：两版立绘都用 focus=0.5，结果人物被裁到画框右侧。
实测人物核心（脸+躯干）觉醒前在源片 x 0.57~0.80、觉醒后在 x 0.45~0.88 —— 
**两版位置还不一样**，用同一个 focus 必错。

本工具的判据
------------
只看「人物核心」而不是整幅画面能量，因为背景的大片深色 / 亮色区域会骗过简单的阈值。
三步定参：

  1. 抽一帧（默认 1.2s，一般是姿态稳定的时刻）
  2. 分别统计三种人物特征的水平投影，取各自的 20% 峰值包围盒：
       A 银白/浅色发（高亮 + 低饱和）—— 银发角色首选
       B 暖色皮肤（R 主导）—— 有露脸的角色首选
       C 最亮 4% —— 兜底（发冠高光）
  3. 三个包围盒投票 + 目视确认，取「人物核心中心」

⚠ **必须目视复核**：飘带、旗帜、光效也会命中这些特征。工具会顺手导出
   <输出>_瞄准.png，在源帧上画出候选中心线与各特征包围盒——**别跳过这一步**。
   钟会第一次自动定位就被左侧旗子骗到 x=0.35（正确的约 0.66）。

用法
----
  # 看一眼人物大概在哪（导出瞄准图 + 打印建议参数）
  python tools/portrait_aim.py <源片> [--time 1.2] [--target 210x250]

  # 直接给出可抄的命令行
  python tools/portrait_aim.py 钟会觉醒前.mp4 --target 210x250 --center 0.66

依赖：ffmpeg（同 make_portrait.py 的探测顺序）、numpy、Pillow
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np

try:
    from PIL import Image, ImageDraw
except ImportError:
    sys.stderr.write("[取景瞄准] 缺少 Pillow：pip install pillow\n")
    sys.exit(2)

FFMPEG_CANDIDATES = [
    os.environ.get("FFMPEG"),
    r"D:\Noname\_tools\ffmpeg\ffmpeg-9.0.2-essentials_build\bin\ffmpeg.exe",
    r"D:\ffmpeg\bin\ffmpeg.exe",
    "ffmpeg",
    "/usr/bin/ffmpeg",
]


def find_ffmpeg() -> str:
    for c in FFMPEG_CANDIDATES:
        if not c:
            continue
        p = Path(c)
        if p.is_absolute() and p.exists():
            return str(p)
        if not p.is_absolute():
            f = shutil.which(c)
            if f:
                return f
    sys.stderr.write("[取景瞄准] 找不到 ffmpeg。设 FFMPEG 环境变量或放进 PATH。\n")
    sys.exit(2)


def grab(ffmpeg: str, src: Path, t: float, out: Path):
    subprocess.run([ffmpeg, "-y", "-v", "error", "-ss", f"{t:.3f}", "-i", str(src),
                    "-frames:v", "1", str(out)], check=True)
    return np.asarray(Image.open(out).convert("RGB")).astype(np.float32)


def boxes(a: np.ndarray, frac: float = 0.20):
    """返回三种特征的包围盒 (名字, x0, x1, y0, y1, 命中像素数)。"""
    h, w = a.shape[:2]
    mx = a.max(2) / 255.0
    mn = a.min(2) / 255.0
    sat = (mx - mn) / (mx + 1e-6)
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]

    feats = {
        "银白发": (mx > 0.72) & (sat < 0.30),
        "暖色肤": (r > b + 22) & (r > g + 8) & (mx > 0.35) & (mx < 0.95) & (sat > 0.10),
        "最亮4%": mx >= np.percentile(mx, 96),
    }
    out = []
    for name, m in feats.items():
        n = int(m.sum())
        if n < 200:
            continue
        col, row = m.sum(0).astype(float), m.sum(1).astype(float)
        ci = np.where(col >= col.max() * frac)[0]
        ri = np.where(row >= row.max() * frac)[0]
        if not len(ci) or not len(ri):
            continue
        out.append((name, ci[0] / w, ci[-1] / w, ri[0] / h, ri[-1] / h, n))
    return out


def main():
    ap = argparse.ArgumentParser(description="立绘取景瞄准器")
    ap.add_argument("source")
    ap.add_argument("--time", type=float, default=1.2, help="抽帧时间点（秒，默认 1.2）")
    ap.add_argument("--target", default="210x250", help="目标尺寸 WxH（默认 210x250）")
    ap.add_argument("--center", type=float, default=None,
                    help="目视确认的人物核心中心 x（0~1）。给了就直接算 crop/focus")
    ap.add_argument("--out", default=None, help="瞄准图输出路径")
    args = ap.parse_args()

    src = Path(args.source)
    if not src.exists():
        sys.stderr.write(f"[取景瞄准] 素材不存在：{src}\n")
        sys.exit(2)
    tw, th = (int(x) for x in args.target.lower().split("x"))
    ffmpeg = find_ffmpeg()
    png = Path(args.out) if args.out else src.with_name(src.stem + "_瞄准.png")
    a = grab(ffmpeg, src, args.time, png)
    H, W = a.shape[:2]

    print(f"{src.name}  帧 {W}x{H}  t={args.time}s")
    print(f"目标 {tw}x{th}（比例 {tw/th:.3f}）→ 源片裁切宽 {H*tw/th:.0f}\n")

    print("三种特征的包围盒（x 为源片比例，0~1）：")
    for name, x0, x1, y0, y1, n in boxes(a):
        print(f"  {name}: 命中 {n:6d}  x {x0:.3f}~{x1:.3f} 中心 {(x0+x1)/2:.3f}"
              f"  | y {y0:.3f}~{y1:.3f}")

    cands = [b for b in boxes(a) if b[0] != "最亮4%"]
    if cands:
        guess = float(np.median([(b[1] + b[2]) / 2 for b in cands]))
        print(f"\n自动推测人物核心中心 x ≈ {guess:.3f}"
              f"   ⚠ 必须目视核对（飘带/旗帜会骗过阈值）")

    # 瞄准图：源帧 + 中心线 + 包围盒
    im = Image.open(png).convert("RGB")
    d = ImageDraw.Draw(im)
    for name, x0, x1, y0, y1, _ in boxes(a):
        d.rectangle([x0 * W, y0 * H, x1 * W, y1 * H], outline=(0, 255, 120), width=2)
        d.text((x0 * W + 3, y0 * H + 3), name, fill=(0, 255, 120))
    centers = [args.center] if args.center is not None else [guess]
    for c in centers:
        x = c * W
        d.line([(x, 0), (x, H)], fill=(255, 60, 60), width=3)
        d.text((x + 4, 6), f"center={c:.3f}", fill=(255, 60, 60))
    im.save(png)
    print(f"\n瞄准图已写出：{png}（绿框=特征包围盒，红线=人物核心中心）")

    if args.center is not None:
        cw = int(round(H * tw / th))
        cx = int(round(args.center * W - cw / 2))
        cx = max(0, min(W - cw, cx))
        fx = cx / (W - cw) if W - cw > 1 else 0.5
        print(f"\n可直接抄的命令：")
        print(f'  python tools/make_portrait.py "{src}" -o <输出>.webp --mode anim '
              f'--target {tw}x{th} --crop {cw}:{H}:{cx}:0')
        print(f"  （等价 --focus {fx:.4f},0.42 --zoom 1.0）")


if __name__ == "__main__":
    main()
