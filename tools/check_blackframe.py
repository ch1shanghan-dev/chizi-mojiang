#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""池子魔将 · 素材黑帧检测（首尾硬切黑 / 中段黑场）

为什么需要它
------------
2026-10-09 修 `csh_wenyang_quedi_banner.mp4` 的「收尾一闪而过黑屏」时定位到：
**源素材的最后一帧本身就是一帧硬切黑**（平均亮度 10.6，84.5% 像素 <16），
而播放器是 `video.addEventListener("ended", finish)` —— 黑帧会完整播满 1/30s 才移除图层，
所以你必然看到它。且这个问题**与压缩无关**：原始素材和压缩版的数据完全一致。

这类素材通病会反复出现在新加的技能横幅上，所以把它固化成脚本，
**每个新素材进 effect/ 之前先过一遍**。

判定口径
--------
逐帧算「亮度 < --lum 的像素占比」，超过 --ratio 即判为黑帧。
默认 `--lum 16 --ratio 0.5`，即「一半以上像素接近纯黑」——
这个口径在实测中能把「真正的黑尾」和「本来就偏暗的战斗画面」干净地区分开
（文鸯素材正常帧亮度 ~70、暗占比 0%；黑帧亮度 10.6、暗占比 84.5%，中间没有模糊地带）。

注意：检测在**降采样后**的画面上做（默认宽 192），只为提速与降噪，
判定的是「整帧接近全黑」这种级别的问题，不用于精细画质评估。

用法
----
  # 单个文件
  python tools/check_blackframe.py 桌面/新素材.mp4

  # 整个目录（递归，只扫视频/动图扩展名）
  python tools/check_blackframe.py resources/app/extension/池子魔将/effect

  # 多个文件混合
  python tools/check_blackframe.py a.mp4 b.mp4 image/csh_zhonghui.webp

  # 更严格（暗占比 >30% 就算黑）
  python tools/check_blackframe.py 素材.mp4 --ratio 0.3

输出
----
  每个文件给：分辨率 / 帧率 / 总帧数，以及所有黑帧区间。
  命中首尾时，额外打印**可直接复制的裁剪命令**（该 ffmpeg 上 `-c copy` 会破坏末帧
  挂着的 B 帧参考，所以必须重编码，脚本给的是重编码版本）。

退出码
------
  0 = 全部干净；1 = 至少有一个文件检出黑帧（便于接 CI / 批处理）；2 = 环境或参数错误。

依赖
----
  ffmpeg / ffprobe —— 唯一依赖。探测顺序同 tools/make_portrait.py。
  刻意**不用 Pillow / numpy**：本机系统 python(3.14) 没装、venv(3.13) 才有，
  那样换个解释器就跑不起来。逐帧统计用标准库做，任何 python 都能跑。
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

# ---------------------------------------------------------------- 常量

FFMPEG_CANDIDATES = [
    os.environ.get("FFMPEG"),
    r"D:\Noname\_tools\ffmpeg\ffmpeg-9.0.2-essentials_build\bin\ffmpeg.exe",
    r"D:\ffmpeg\bin\ffmpeg.exe",
    "ffmpeg",
    "/usr/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
]

VIDEO_EXT = {".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v", ".flv", ".wmv"}
IMAGE_EXT = {".webp", ".gif", ".png", ".apng"}
SCAN_EXT = VIDEO_EXT | IMAGE_EXT

# 降采样后的分析宽度（只为提速；判定的是整帧级别的全黑）
SCAN_WIDTH = 192


# ---------------------------------------------------------------- 环境


def find_ffmpeg() -> str:
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
    sys.stderr.write("[黑帧检测] 找不到 ffmpeg。请设置环境变量 FFMPEG 或放进 PATH。\n")
    sys.exit(2)


def find_ffprobe(ffmpeg: str):
    exe = Path(ffmpeg).with_name("ffprobe.exe" if os.name == "nt" else "ffprobe")
    if exe.exists():
        return str(exe)
    return shutil.which("ffprobe")


# ---------------------------------------------------------------- 探测


def probe(ffprobe: str, src: Path) -> dict:
    """返回 width/height/fps/frames。拿不到时尽力降级。"""
    out = {"width": 0, "height": 0, "fps": 0.0, "frames": 0}
    if not ffprobe:
        return out
    cmd = [ffprobe, "-v", "error", "-select_streams", "v:0",
           "-count_frames", "-show_entries",
           "stream=width,height,r_frame_rate,nb_read_frames",
           "-of", "json", str(src)]
    try:
        p = subprocess.run(cmd, capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=120)
        data = json.loads(p.stdout or "{}")
        st = (data.get("streams") or [{}])[0]
        out["width"] = int(st.get("width") or 0)
        out["height"] = int(st.get("height") or 0)
        fr = st.get("r_frame_rate") or "0/1"
        try:
            a, b = str(fr).split("/")
            out["fps"] = float(a) / float(b) if float(b) else 0.0
        except Exception:
            out["fps"] = 0.0
        out["frames"] = int(st.get("nb_read_frames") or 0)
    except Exception:
        pass
    return out


def frame_stats(ffmpeg: str, src: Path, width: int, height: int):
    """逐帧返回 (平均亮度, 暗像素占比)。生成器。

    全程标准库：ffmpeg 直接解码成 gray（1 字节/像素），
    阈值比对用 bytes.translate 这种 C 层操作完成，不用 Pillow/numpy 也够快。
    """
    # 保持比例降采样；高度取偶数避免色度采样报错
    w = SCAN_WIDTH
    h = max(2, int(round(SCAN_WIDTH * height / max(1, width) / 2)) * 2)
    cmd = [ffmpeg, "-v", "error", "-i", str(src),
           "-vf", f"scale={w}:{h}:flags=area",
           "-pix_fmt", "gray", "-f", "rawvideo", "-"]
    p = subprocess.run(cmd, capture_output=True)
    buf = p.stdout
    fsz = w * h
    # 亮度 < lum_th 的像素映射成 1，其余 0；translate 在 C 层完成整块比对
    trans = bytes(1 if i < lum_th else 0 for i in range(256))
    n = len(buf) // fsz
    for i in range(n):
        chunk = buf[i * fsz:(i + 1) * fsz]
        cnt = len(chunk)
        if not cnt:
            continue
        yield sum(chunk) / cnt, sum(chunk.translate(trans)) / cnt


lum_th = 16  # 由 --lum 覆盖，见 main()


# ---------------------------------------------------------------- 分析


def find_runs(darks: list[float], ratio: float) -> list[tuple[int, int]]:
    """把「暗占比 > ratio」的帧合并成连续区间 [(start, end_inclusive), ...]。"""
    runs = []
    start = None
    for i, d in enumerate(darks):
        if d > ratio:
            if start is None:
                start = i
        else:
            if start is not None:
                runs.append((start, i - 1))
                start = None
    if start is not None:
        runs.append((start, len(darks) - 1))
    return runs


def analyze(ffmpeg: str, ffprobe: str, src: Path, ratio: float) -> dict:
    info = probe(ffprobe, src)
    stats = list(frame_stats(ffmpeg, src, info["width"], info["height"]))
    if not stats:
        return {"path": src, "error": "解码失败或没有帧"}
    means = [m for m, _ in stats]
    darks = [d for _, d in stats]
    if not info["frames"]:
        info["frames"] = len(stats)
    runs = find_runs(darks, ratio)
    return {
        "path": src,
        "width": info["width"], "height": info["height"],
        "fps": info["fps"], "frames": len(stats),
        "means": means, "darks": darks, "runs": runs,
        "ratio": ratio,
    }


def trim_hint(r: dict, ffmpeg_path: str) -> str:
    """首尾黑帧 → 给出可直接复制的裁剪命令。"""
    frames = r["frames"]
    runs = r["runs"]
    head = tail = 0
    if runs and runs[0][0] == 0:
        head = runs[0][1] + 1
    if runs and runs[-1][1] == frames - 1:
        tail = frames - runs[-1][0]
    if not head and not tail:
        return ""
    keep = frames - head - tail
    src = r["path"]
    # 去掉所有后缀再拼，避免 xxx.mp4.orig 这类名字被切成两半
    dst = src.parent / (src.name.split(".")[0] + "_trim.mp4")
    common = f"-c:v libx264 -preset veryslow -crf 22 -pix_fmt yuv420p -movflags +faststart -an"
    # 只裁尾：用 -frames:v 保留前 N 帧（必须重编码，见 docstring）
    if not head:
        return f"  ffmpeg -y -i \"{src}\" -frames:v {keep} {common} \"{dst}\""
    # 只裁头：从 head 帧之后开始取
    t0 = head / r["fps"] if r["fps"] else 0
    if not tail:
        return f"  ffmpeg -y -ss {t0:.4f} -i \"{src}\" {common} \"{dst}\""
    # 两头都裁
    return f"  ffmpeg -y -ss {t0:.4f} -i \"{src}\" -frames:v {keep} {common} \"{dst}\""


# ---------------------------------------------------------------- 输出


def report(r: dict, ffmpeg_path: str) -> bool:
    """打印单个文件的报告；返回是否存在黑帧。"""
    name = r["path"].name
    print(f"\n{'=' * 64}")
    print(f"{name}")
    if r.get("error"):
        print(f"  [跳过] {r['error']}")
        return False
    fps = r["fps"]
    print(f"  {r['width']}x{r['height']}  {fps:.3f}fps  {r['frames']} 帧"
          if fps else f"  {r['width']}x{r['height']}  {r['frames']} 帧")
    if not r["runs"]:
        print("  [ OK ] 无黑帧")
        return False

    frames = r["frames"]
    print(f"  [ 命中 ] 暗像素 >{r['ratio'] * 100:.0f}% 的区间：")
    for s, e in r["runs"]:
        seg = r["means"][s:e + 1]
        dk = r["darks"][s:e + 1]
        pos = []
        if s == 0:
            pos.append("头部")
        if e == frames - 1:
            pos.append("尾部")
        tag = "/".join(pos) if pos else "中段"
        n = e - s + 1
        line = (f"    帧 {s}–{e}（共 {n} 帧，{tag}）"
                f"  平均亮度 {sum(seg) / n:6.2f}  暗占比 {max(dk) * 100:5.1f}%")
        if fps:
            line += f"  时长 {n / fps * 1000:.0f}ms"
        print(line)

    hint = trim_hint(r, ffmpeg_path)
    if hint:
        print("  裁剪命令（去掉首尾黑帧，重编码）：")
        print(hint)
    return True


# ---------------------------------------------------------------- main


def expand(targets: list[str]) -> list[Path]:
    out = []
    for t in targets:
        p = Path(t)
        if p.is_dir():
            for f in sorted(p.rglob("*")):
                if f.is_file() and f.suffix.lower() in SCAN_EXT:
                    out.append(f)
        elif p.is_file():
            out.append(p)
        else:
            sys.stderr.write(f"[黑帧检测] 跳过（不存在）：{t}\n")
    return out


def main() -> int:
    global lum_th
    ap = argparse.ArgumentParser(
        description="检测视频/动图素材的首尾黑帧（硬切黑）",
        formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("targets", nargs="+", help="文件或目录（目录会递归扫描）")
    ap.add_argument("--lum", type=int, default=16,
                    help="判定「暗像素」的亮度阈值，0~255（默认 16）")
    ap.add_argument("--ratio", type=float, default=0.5,
                    help="暗像素占比超过该值即判为黑帧，0~1（默认 0.5）")
    ap.add_argument("--quiet", action="store_true", help="只打印有问题的文件")
    args = ap.parse_args()

    lum_th = max(0, min(255, args.lum))
    files = expand(args.targets)
    if not files:
        sys.stderr.write("[黑帧检测] 没有可扫描的文件\n")
        return 2

    ffmpeg = find_ffmpeg()
    ffprobe = find_ffprobe(ffmpeg)

    print(f"[黑帧检测] 扫描 {len(files)} 个文件   判定：亮度<{lum_th} 的像素占比 >"
          f"{args.ratio * 100:.0f}%")

    bad = []
    for f in files:
        r = analyze(ffmpeg, ffprobe, f, args.ratio)
        hit = report(r, ffmpeg) if not args.quiet else None
        if hit is None:
            # quiet 模式下也要算一次
            hit = bool(r.get("runs"))
        if hit:
            bad.append(f.name)

    print(f"\n{'=' * 64}")
    if bad:
        print(f"结论：{len(bad)}/{len(files)} 个文件检出黑帧 ——")
        for n in bad:
            print(f"  · {n}")
        return 1
    print(f"结论：{len(files)} 个文件全部干净。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
