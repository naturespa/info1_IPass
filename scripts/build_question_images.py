"""Build portable, per-question PNGs from the existing embedded WebP sprites.

Usage: python scripts/build_question_images.py [--check]
Requires Pillow. --check decodes every PNG and compares its pixels with the source.
No resampling or lossy recompression is performed.
"""
import argparse
import base64
import io
import json
import re
from pathlib import Path
from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('--check', action='store_true')
args = parser.parse_args()
out = ROOT / 'assets' / 'questions'
if not args.check:
    out.mkdir(exist_ok=True)
count = 0
for exam in json.loads((ROOT / 'data/catalog.json').read_text())['exams']:
    sprites = {}
    for q in json.loads((ROOT / f"data/{exam['id']}.json").read_text())['questions']:
        spec = q['image']
        src = spec['src']
        if src not in sprites:
            svg = (ROOT / src).read_text()
            encoded = re.search(r'href="data:image/webp;base64,([^"]+)"', svg)[1]
            im = Image.open(io.BytesIO(base64.b64decode(encoded))).convert('RGB')
            assert im.size == (spec['width'], spec['spriteHeight']), src
            sprites[src] = im
        crop = sprites[src].crop((0, spec['y'], spec['width'], spec['y'] + spec['height']))
        path = out / f"{q['id']}.png"
        if args.check:
            with Image.open(path) as actual:
                actual.load()
                assert actual.size == crop.size, q['id']
                assert ImageChops.difference(actual.convert('RGB'), crop).getbbox() is None, q['id']
        else:
            crop.save(path, optimize=True)
        # Inspect the actual visible region, including reviewed display-height overrides.
        gray = crop.convert('L')
        assert sum(gray.histogram()[:220]) >= 100, f"blank: {q['id']}"
        count += 1
assert count == 1500, count
assert len(list(out.glob('*.png'))) == count
print(f"{'Verified pixel-for-pixel' if args.check else 'Built'}: {count} question PNGs")
