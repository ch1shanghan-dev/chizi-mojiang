"""Crop the reviewed generated illustration to the real card geometry; no repainting."""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageOps, ImageDraw, ImageFont

parser = argparse.ArgumentParser()
parser.add_argument('--source', type=Path, required=True)
parser.add_argument('--work', type=Path, required=True)
parser.add_argument('--install', action='store_true')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
work = args.work.resolve()
if work == root or root in work.parents:
    raise ValueError('Backups/full source must remain outside the extension')
work.mkdir(parents=True, exist_ok=True)
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
before = work / 'before-400x472.jpg'
released = work / 'original-400x472.jpg'
if not before.exists() or not released.exists():
    raise ValueError('Both previous local and released portrait backups are required')
source = args.source.resolve()
target = root / 'image/csh_haozhao.jpg'
with Image.open(source) as image:
    dimensions = image.size
    card = ImageOps.fit(image.convert('RGB'), (400, 472), method=Image.Resampling.LANCZOS, centering=(0.5, 0))
    selected = work / 'candidate-2-400x472.jpg'
    card.save(selected, quality=94, subsampling=0)
(work / 'candidate-1-400x472.jpg').write_bytes(before.read_bytes())
font = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 17)
small = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 14)
board = Image.new('RGB', (1260, 690), '#20252c')
draw = ImageDraw.Draw(board)
for col, (name, file) in enumerate([
    ('原发布图（保留）', released), ('上一版本地稿（保留）', before), ('新稿 · 蚀心入魔画法', selected),
]):
    image = Image.open(file).convert('RGB')
    x = col * 420 + 10
    draw.text((x, 9), name, fill='#f1e7cd', font=font)
    board.paste(image, (x, 38))
    for size, offset in [(100, 0), (42, 130)]:
        avatar = ImageOps.fit(image, (size, size), method=Image.Resampling.LANCZOS, centering=(0.5, 0))
        board.paste(avatar, (x+offset, 529))
        draw.text((x+offset, 637), f'{size}px', fill='#c4cbd1', font=small)
out = root / 'docs/audit/ui/haozhao-sxrm'
out.mkdir(parents=True, exist_ok=True)
board.save(out / 'comparison.jpg', quality=94)
if args.install:
    if sha(target) not in {sha(before), sha(selected)}:
        raise ValueError('Portrait changed since this batch backup; refusing overwrite')
    target.write_bytes(selected.read_bytes())
metadata = {'source': str(source), 'source_size': dimensions, 'source_sha256': sha(source),
            'previous_sha256': sha(before), 'released_sha256': sha(released), 'selected': str(selected),
            'selected_sha256': sha(selected), 'installed': args.install,
            'operation': 'aspect-preserving top crop to 400x472; no creative repaint or upscale',
            'comparison': str(out / 'comparison.jpg')}
(work / 'derivatives.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(metadata, ensure_ascii=False))
