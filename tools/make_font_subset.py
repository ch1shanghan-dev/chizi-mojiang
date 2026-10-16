# -*- coding: utf-8 -*-
"""
池子魔将 · 生成「全覆盖书法体」页面字体（2026-10-15）
------------------------------------------------------------
问题：font/csh_fx_font_1/2.woff2 只有 78/84 个字形（专供游戏内技能横幅），
     被放进页面 --ff-title 首位 → 任何不在子集内的字逐字回退系统宋体 →
     同一个人名/标题里混排两种字体（作者实机截图确认）。

方案：用开源字体 Zhi Mang Xing（SIL OFL 1.1）的**完整版**重新子集化，
     字符集 = ① 本扩展运行期源码中出现过的全部汉字与标点（保证够用）
             ② GB2312 一级常用字 3755 个（保证以后新增文案也不缺字）
     输出 font/csh_fx_font_3.woff2 + tools/font_charset.json（门禁 E20 用）。

用法：
  python tools/make_font_subset.py <ZhiMangXing-Regular.ttf> [--ext-root .]
"""
import json
import os
import re
import sys

try:
    from fontTools import subset
    from fontTools.ttLib import TTFont
except ImportError:
    print("需要 fontTools：pip install fontTools brotli", file=sys.stderr)
    raise

CJK = re.compile(r"[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef\u2000-\u206f\u2190-\u21ff\u25a0-\u25ff]")
SRC_EXT = (".js", ".html", ".json", ".css")


def gb2312_level1():
    """GB2312 一级汉字（区 16~55）共 3755 字。"""
    out = []
    for hi in range(16, 56):
        for lo in range(1, 95):
            b = bytes([hi + 0xA0, lo + 0xA0])
            try:
                out.append(b.decode("gb2312"))
            except UnicodeDecodeError:
                pass
    return out


def collect_from_sources(ext_root):
    chars = set()
    for dirpath, dirnames, filenames in os.walk(ext_root):
        dirnames[:] = [d for d in dirnames if d not in ("node_modules", "image", "audio", "mobilefx", "_backup")]
        for fn in filenames:
            if not fn.endswith(SRC_EXT):
                continue
            p = os.path.join(dirpath, fn)
            try:
                with open(p, encoding="utf-8") as f:
                    text = f.read()
            except (UnicodeDecodeError, OSError):
                continue
            chars.update(CJK.findall(text))
    return chars


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    src_font = sys.argv[1]
    ext_root = os.path.abspath(sys.argv[sys.argv.index("--ext-root") + 1]) if "--ext-root" in sys.argv else os.getcwd()

    from_src = collect_from_sources(ext_root)
    l1 = set(gb2312_level1())
    charset = set(from_src) | l1
    # 补齐 ASCII 可打印 + 常用标点
    charset |= set(chr(c) for c in range(0x20, 0x7F))
    charset |= set("　、。〈〉《》「」『』【】〔〕・ー—…“”‘’·×÷±°※★☆○●□■△▲▽▼◆◇→←↑↓")

    ft = TTFont(src_font)
    cmap = ft.getBestCmap()
    have = set(chr(c) for c in cmap)
    missing = sorted(c for c in charset if c not in have)

    out_dir = os.path.join(ext_root, "font")
    os.makedirs(out_dir, exist_ok=True)
    out_name = "csh_fx_font_3.woff2"
    out_path = os.path.join(out_dir, out_name)

    text = "".join(sorted(charset & have))
    tmp_txt = os.path.join(out_dir, "_subset_chars.txt")
    with open(tmp_txt, "w", encoding="utf-8") as f:
        f.write(text)

    args = [
        src_font,
        "--text-file=" + tmp_txt,
        "--output-file=" + out_path,
        "--flavor=woff2",
        "--layout-features=",
        "--no-hinting",
        "--desubroutinize",
        "--drop-tables+=DSIG",
    ]
    subset.main(args)
    os.remove(tmp_txt)

    size = os.path.getsize(out_path)
    # 门禁用字表（E20）
    charlist = sorted(charset & have)
    meta = {
        "_note": "csh_fx_font_3.woff2 字形表（由 tools/make_font_subset.py 生成）——门禁 E20 断言页面书法体用字 ⊆ 本表",
        "source": "Zhi Mang Xing Regular（Google Fonts · SIL OFL 1.1）",
        "glyphCount": len(cmap),
        "subsetCount": len(charlist),
        "fromSourceCount": len(from_src & have),
        "gb2312L1Count": len(l1 & have),
        "missingFromFont": len(missing),
        "chars": "".join(charlist),
    }
    with open(os.path.join(ext_root, "tools", "font_charset.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)

    print("源字体字形数:", len(cmap))
    print("源码用字:", len(from_src), "  其中源字体有:", len(from_src & have))
    print("GB2312 一级:", len(l1), "  其中源字体有:", len(l1 & have))
    print("最终子集字数:", len(charlist))
    print("源字体缺失(%d)：" % len(missing), "".join(missing[:80]))
    print("输出:", out_path, "大小 %.2f MB" % (size / 1048576.0))
    return 0


if __name__ == "__main__":
    sys.exit(main())
