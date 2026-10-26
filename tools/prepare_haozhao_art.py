"""Produce deterministic game-size derivatives and a comparison from generated art.

No creative repainting. Originals and generated source files are read-only inputs.
Run --install only after reviewing the comparison and the external original backup.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source-dir', type=Path, required=True)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--install', action='store_true')
    args = parser.parse_args()
    root, source = args.root.resolve(), args.source_dir.resolve()
    if source == root or root in source.parents:
        parser.error('Original backup and full-size candidates must be outside extension')
    original = source / 'original-400x472.jpg'
    paths = [original, source/'candidate-1.png', source/'candidate-2.png']
    original_hash = digest(original)
    # Compare bytes directly with the released source; do not accept an arbitrary backup.
    import subprocess
    old = subprocess.run(['git', 'show', 'HEAD:image/csh_haozhao.jpg'], cwd=root,
                         check=True, stdout=subprocess.PIPE).stdout
    if hashlib.sha256(old).hexdigest() != original_hash:
        raise ValueError('Original backup differs from released portrait')
    font = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 18)
    small = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 14)
    board = Image.new('RGB', (1260, 740), '#20252c')
    draw = ImageDraw.Draw(board)
    metadata = []
    for col, path in enumerate(paths):
        with Image.open(path) as image:
            image = image.convert('RGB')
            # Existing portrait geometry: 400x472. Preserve upper safe area, never stretch.
            card = ImageOps.fit(image, (400, 472), method=Image.Resampling.LANCZOS, centering=(0.5, 0))
            derived = source / ('original-preview.jpg' if col == 0 else f'candidate-{col}-400x472.jpg')
            card.save(derived, quality=94, subsampling=0)
            x = col*420+10
            board.paste(card, (x, 40))
            draw.text((x, 10), ['旧图（保留备份）', '候选一 · 城垛守御', '候选二 · 城防部署'][col], font=font, fill='#f1e7cd')
            for size, ox in [(100, 0), (42, 130)]:
                # Exact CSS cover with top anchor; actual host/theme preview is a separate check.
                avatar = ImageOps.fit(card, (size, size), method=Image.Resampling.LANCZOS, centering=(0.5, 0))
                board.paste(avatar, (x+ox, 545))
                draw.text((x+ox, 652), f'{size}px', font=small, fill='#c4cbd1')
            draw.text((x, 690), f'{image.width}×{image.height} → 400×472', font=small, fill='#c4cbd1')
            metadata.append({'source': str(path), 'source_sha256': digest(path),
                             'width': image.width, 'height': image.height,
                             'derived': str(derived), 'derived_sha256': digest(derived)})
    comparison = root/'docs/audit/ui/haozhao-art/comparison.jpg'
    comparison.parent.mkdir(parents=True, exist_ok=True)
    board.save(comparison, quality=94)
    if args.install:
        target = root/'image/csh_haozhao.jpg'
        current = digest(target)
        selected = source/'candidate-2-400x472.jpg'
        if current not in {original_hash, digest(selected)}:
            raise ValueError('Current portrait changed since original backup; refusing overwrite')
        target.write_bytes(selected.read_bytes())
    (source/'derivatives.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'comparison': str(comparison), 'installed': args.install,
                      'selected': 'candidate-2', 'original_sha256': original_hash}, ensure_ascii=False))


if __name__ == '__main__':
    main()
