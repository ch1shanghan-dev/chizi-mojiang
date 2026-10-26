"""Read-only portrait inventory and contact sheets; never modifies game assets."""
from __future__ import annotations
import argparse
import csv
import hashlib
import json
import re
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--output', type=Path, required=True, help='External audit directory')
    parser.add_argument('--review-motion', action='store_true', help='Sample suspect animated portraits at four times')
    args = parser.parse_args()
    root, output = args.root.resolve(), args.output.resolve()
    if output == root or root in output.parents:
        parser.error('Contact sheets and inventory must be outside the extension')
    output.mkdir(parents=True, exist_ok=True)
    source = (root / 'character/index.js').read_text(encoding='utf-8')
    section = source.split('character: {', 1)[1].split('translate: {', 1)[0]
    characters = []
    for match in re.finditer(r'"(csh_[\w]+)"\s*:\s*\{([^{}]*)\}', section):
        cid, block = match.groups()
        image_match = re.search(r'img:\s*"extension/池子魔将/([^"]+)"', block)
        if not image_match:
            raise ValueError(f'No explicit image for {cid}')
        name_match = re.search(r'"' + re.escape(cid) + r'"\s*:\s*"([^"]+)"', source[source.index('translate: {'):])
        characters.append({'id': cid, 'name': name_match.group(1) if name_match else cid,
                           'file': image_match.group(1), 'source_line': source[:source.index(match.group(0))].count('\n') + 1})
    rows = []
    for file in sorted((root / 'image').rglob('*')):
        if not file.is_file():
            continue
        try:
            with Image.open(file) as image:
                rows.append({'file': file.relative_to(root).as_posix(), 'width': image.width,
                             'height': image.height, 'ratio': round(image.width/image.height, 4),
                             'format': image.format, 'frames': getattr(image, 'n_frames', 1),
                             'bytes': file.stat().st_size, 'sha256': hashlib.sha256(file.read_bytes()).hexdigest()})
        except Exception as error:
            rows.append({'file': file.relative_to(root).as_posix(), 'error': str(error)})
    known = {row['file']: row for row in rows}
    for char in characters:
        if char['file'] not in known or 'error' in known[char['file']]:
            raise ValueError(f'Missing/unreadable registered portrait {char}')
        char.update({k: v for k, v in known[char['file']].items() if k != 'file'})
    (output / 'image-inventory.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding='utf-8')
    (output / 'character-inventory.json').write_text(json.dumps(characters, ensure_ascii=False, indent=2), encoding='utf-8')
    with (output / 'character-inventory.csv').open('w', encoding='utf-8-sig', newline='') as handle:
        writer = csv.DictWriter(handle, fieldnames=list(characters[0]))
        writer.writeheader()
        writer.writerows(characters)
    font = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 16)
    small = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 12)
    for start in range(0, len(characters), 25):
        sheet = Image.new('RGB', (1250, 1575), '#20252c')
        draw = ImageDraw.Draw(sheet)
        for offset, char in enumerate(characters[start:start+25]):
            x, y = (offset % 5) * 250, (offset // 5) * 315
            with Image.open(root / char['file']) as image:
                thumb = ImageOps.contain(image.convert('RGB'), (238, 260))
                sheet.paste(thumb, (x + (250-thumb.width)//2, y))
            draw.text((x+6, y+263), f'{start+offset+1:03} {char["name"]}', font=font, fill='#eee8d9')
            draw.text((x+6, y+288), char['id'], font=small, fill='#b3c3cd')
        sheet.save(output / f'portraits-{start+1:03}-{min(start+25,len(characters)):03}.jpg', quality=92)
    if args.review_motion:
        selected = [char for char in characters if char['id'] in {
            'csh_msmy', 'csh_ae', 'csh_vxs', 'csh_simahui', 'csh_lifeng', 'csh_diaochan', 'csh_guansuo'}]
        sheet = Image.new('RGB', (1000, len(selected)*260), '#20252c')
        draw = ImageDraw.Draw(sheet)
        for row, char in enumerate(selected):
            with Image.open(root / char['file']) as source_image:
                frame_indices = [0, source_image.n_frames//3, source_image.n_frames*2//3, source_image.n_frames-1]
                for col, frame in enumerate(frame_indices):
                    source_image.seek(frame)
                    thumb = ImageOps.contain(source_image.convert('RGB'), (240, 230))
                    sheet.paste(thumb, (col*250, row*260))
                    draw.text((col*250, row*260+233), f'{char["name"]} frame {frame}', font=font, fill='white')
        sheet.save(output / 'animated-review.jpg', quality=94)
    print(json.dumps({'registered_characters': len(characters), 'image_files': len(rows),
                      'missing_registered': 0, 'output': str(output)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
