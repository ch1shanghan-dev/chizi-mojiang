#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""生成「池子魔将」前缀角标（31x48，官方十周年UI 同规格）。

用法：
    python tools/gen-mark.py                 # 默认生成「池」→ image/mark_chi.png
    python tools/gen-mark.py 魔              # 换字
    python tools/gen-mark.py 魔 mark_mo.png  # 换字 + 换输出名

它做三件事：
  1. 从十周年UI 的 85 张官方角标里重建一张「无字底版」——
     同主题角标的底色/描边/内框完全相同，只有字形不同，
     所以逐像素按亮度取 p90 样本即可把字剔掉，留下纯净底版。
  2. 用凯体（simkai.ttf）在最终像素尺寸上直接渲染汉字（不要缩放！缩放会把笔画糊掉），
     按官方字形的实测统计把它对齐到内框中心。
  3. 以官方字色 (104,52,5) 按覆盖率合成到底版上。

为什么是这些参数（全部来自实测，样本=官方 83 张同主题角标）：
    字 bbox   w p50=19  h p50=17      字中心   (15.0, 24.5)
    墨量      p50=88 px              实心率   p50=0.77（r<120 的像素占比）
    字色      (104,52,5)，83 张里 82 张如此
  字体用 IoU 法鉴定：拿官方已有的 50 个汉字，逐字体渲染同字做重叠比对，
  楷体 0.513 断层领先（黑体 0.427 / 雅黑 0.376 / 等线 0.369 / 宋体 0.352 / 仿宋 0.342），
  且楷体的最佳字号稳定落在 21~23。
  覆盖率曲线 (cov*1.25)**0.70 是为把 FreeType 的软边压硬，
  使「实心率/墨量」两项同时命中官方值（不压则实心率只有 0.44，看起来发灰发糊）。
"""
import os
import sys
import glob
import shutil
import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
EXTDIR = os.path.dirname(HERE)                      # .../池子魔将
IMGDIR = os.path.join(EXTDIR, "image")
DECUI = os.path.join(os.path.dirname(EXTDIR), "十周年UI", "image", "ui", "mark")

W, H = 31, 48
GLYPH_RGB = (104, 52, 5)
FONT = "C:/Windows/Fonts/simkai.ttf"
SIZE = 24
GAIN, GAMMA = 1.25, 0.70
TARGET_CX, TARGET_CY = 15.0, 24.5


def build_base(samples):
    """从同主题官方角标重建无字底版：逐像素按亮度取 p90 样本"""
    S = []
    for p in sorted(glob.glob(os.path.join(DECUI, "mark_*.png"))):
        im = Image.open(p).convert("RGBA")
        if im.size != (W, H):
            continue
        a = np.array(im).astype(np.float32)
        body = (a[:, :, 3] > 200) & (a[:, :, 0] > 200)
        if not body.sum():
            continue
        bb = a[body]
        # 只取金色系（底色亮、蓝通道低），排除异色主题
        if not (bb[:, 0].mean() > 200 and bb[:, 2].mean() < 140):
            continue
        S.append(a)
    if len(S) < 10:
        raise SystemExit("官方角标样本不足（%d 张），请确认十周年UI 已安装：%s" % (len(S), DECUI))
    S = np.stack(S)
    n = S.shape[0]
    lum = S[:, :, :, 0] * 0.6 + S[:, :, :, 1] * 0.3 + S[:, :, :, 2] * 0.1
    order = np.argsort(lum, axis=0)
    pick = order[int(round(0.90 * (n - 1)))]
    yy, xx = np.mgrid[0:H, 0:W]
    base = S[pick, yy, xx, :]
    print("底版：由 %d 张官方角标合成" % n)
    return np.clip(base, 0, 255).astype(np.float32)


def render_coverage(char):
    if not os.path.exists(FONT):
        raise SystemExit("找不到字体：%s" % FONT)
    f = ImageFont.truetype(FONT, SIZE)
    t = Image.new("L", (SIZE * 4, SIZE * 4), 0)
    ImageDraw.Draw(t).text((SIZE * 2, SIZE * 2), char, font=f, fill=255, anchor="mm")
    cov = np.array(t).astype(np.float32) / 255.0
    return np.clip((cov * GAIN) ** GAMMA, 0, 1)


def compose(base, cov, char):
    ys, xs = np.nonzero(cov > 0.06)
    if not len(ys):
        raise SystemExit("字形渲染为空：%r" % char)
    dx = int(round(TARGET_CX - (xs.min() + xs.max()) / 2.0))
    dy = int(round(TARGET_CY - (ys.min() + ys.max()) / 2.0))
    a = base.copy()
    ch, cw = cov.shape
    sx, sy = max(0, -dx), max(0, -dy)
    ex, ey = min(cw, W - dx), min(ch, H - dy)
    if ex <= sx or ey <= sy:
        raise SystemExit("字形超出画布")
    sub = cov[sy:ey, sx:ex]
    reg = a[dy + sy : dy + ey, dx + sx : dx + ex, :]
    c = sub[:, :, None]
    gc = np.array(GLYPH_RGB, np.float32)[None, None, :]
    reg[:, :, :3] = reg[:, :, :3] * (1 - c) + gc * c
    reg[:, :, 3] = np.maximum(reg[:, :, 3], c[:, :, 0] * 255)
    return np.clip(a, 0, 255).astype(np.uint8)


def report(arr):
    r, g, b, al = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2], arr[:, :, 3]
    inner = np.zeros((H, W), bool)
    inner[2:35, 6:25] = True
    gl = (r < 145) & (g < 90) & (b < 60) & (al > 100) & inner
    ys, xs = np.nonzero(gl)
    dark = (arr[gl][:, 0] < 120).mean() if len(ys) else 0
    print("  字形 bbox w=%d h=%d  中心 (%.1f, %.1f)  墨量 %d px  实心率 %.2f"
          % (xs.max() - xs.min() + 1, ys.max() - ys.min() + 1,
             (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2, gl.sum(), dark))
    print("  官方标尺      w=19 h=17  中心 (15.0, 24.5)  墨量 88 px  实心率 0.77")


def main():
    char = sys.argv[1] if len(sys.argv) > 1 else "池"
    out = sys.argv[2] if len(sys.argv) > 2 else "mark_chi.png"
    base = build_base(None)
    cov = render_coverage(char)
    arr = compose(base, cov, char)
    dst = os.path.join(IMGDIR, out)
    if os.path.exists(dst):
        bak = dst + ".bak"
        shutil.copy2(dst, bak)
        print("旧图已备份 → %s" % os.path.basename(bak))
    Image.fromarray(arr, "RGBA").save(dst)
    print("已写出 %s (%d 字节)" % (dst, os.path.getsize(dst)))
    report(arr)


main()
