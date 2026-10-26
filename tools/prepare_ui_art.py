"""Convert generated transparent source assets into small offline game derivatives."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageOps


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--sources', type=Path, required=True, help='JSON map of asset id to generated source path')
    parser.add_argument('--archive', type=Path, required=True, help='External original-source archive')
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    root, archive = args.root.resolve(), args.archive.resolve()
    if archive == root or root in archive.parents:
        parser.error('Full-size generated source archive must be outside extension')
    archive.mkdir(parents=True, exist_ok=True)
    out = root/'image/ui/art-v1'
    out.mkdir(parents=True, exist_ok=True)
    data = json.loads(args.sources.read_text(encoding='utf-8'))
    metadata = []
    for asset_id, source in data.items():
        if asset_id not in {'debug-workshop', 'war-record', 'interaction-strategy', 'button-primary',
                            'button-secondary', 'button-danger', 'copy-scroll', 'transfer-chest',
                            'search-lens', 'inspect-compass', 'clear-brazier', 'target-banner'}:
            raise ValueError(f'Unreviewed asset id: {asset_id}')
        source = Path(source)
        archived = archive / f'{asset_id}-source.png'
        if archived.exists() and sha(archived) != sha(source):
            raise ValueError(f'Source archive already exists and differs: {archived}')
        archived.write_bytes(source.read_bytes())
        with Image.open(source) as image:
            image = image.convert('RGBA')
            alpha = image.getchannel('A')
            extrema = alpha.getextrema()
            if extrema[0] != 0 or extrema[1] == 0:
                raise ValueError(f'Asset lacks genuine transparent pixels or visible subject: {source}')
            # Ignore near-invisible alpha wisps when locating the subject, preserve the original alpha.
            # Particularly important for nine-slice: transparent top/bottom margins are not an edge.
            box = alpha.point(lambda value: 255 if value >= 8 else 0).getbbox()
            if box is None:
                raise ValueError('Entire source transparent')
            box = (max(0, box[0]-8), max(0, box[1]-8), min(image.width, box[2]+8), min(image.height, box[3]+8))
            visible = image.crop(box)
            if asset_id.startswith('button-'):
                target = ImageOps.contain(visible, (1024, 256), Image.Resampling.LANCZOS)
            else:
                subject = ImageOps.contain(visible, (176, 176), Image.Resampling.LANCZOS)
                target = Image.new('RGBA', (192, 192))
                target.alpha_composite(subject, ((192-subject.width)//2, (192-subject.height)//2))
            target_path = out/f'{asset_id}.png'
            target.save(target_path, optimize=True)
            metadata.append({'asset_id': asset_id, 'tool': 'built-in image_gen__imagegen',
                             'source': str(archived), 'source_sha256': sha(archived),
                             'source_size': list(image.size), 'source_alpha_extrema': list(extrema),
                             'source_visible_bbox': list(box), 'bbox_alpha_threshold': 8,
                             'file': target_path.relative_to(root).as_posix(),
                             'size': list(target.size), 'bytes': target_path.stat().st_size,
                             'sha256': sha(target_path), 'alpha_extrema': list(target.getchannel('A').getextrema())})
    (root/'docs/audit/ART_GENERATED_ASSETS.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(metadata, ensure_ascii=False))


if __name__ == '__main__':
    main()
