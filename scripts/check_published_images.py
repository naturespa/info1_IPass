"""Check every public question PNG against the checkout (no student data).
Usage: python scripts/check_published_images.py [base URL]
"""
import concurrent.futures
import hashlib
import json
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
base = (sys.argv[1] if len(sys.argv) > 1 else 'https://naturespa.github.io/info1_IPass/').rstrip('/') + '/'
paths = sorted((ROOT / 'assets/questions').glob('*.png'))
assert len(paths) == 1500
# Reference sheets still use the original assets; include all of them too.
catalog = json.loads((ROOT / 'data/catalog.json').read_text())
paths += sorted({ROOT / src for exam in catalog['exams'] for src in exam.get('references', [])})

def check(path):
    relative = path.relative_to(ROOT).as_posix()
    expected = hashlib.sha256(path.read_bytes()).digest()
    for attempt in range(3):
        try:
            with urllib.request.urlopen(base + relative, timeout=30) as response:
                actual = response.read()
                mime = response.headers.get_content_type()
                assert mime == ('image/png' if path.suffix == '.png' else 'image/svg+xml'), (relative, mime)
                assert hashlib.sha256(actual).digest() == expected, relative
            return None
        except Exception as error:
            if attempt == 2:
                return f'{relative}: {error}'
            time.sleep(0.5)

failures = []
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    for count, error in enumerate(pool.map(check, paths), 1):
        if error:
            failures.append(error)
        if count % 100 == 0:
            print(f'{count}/{len(paths)} checked; failures={len(failures)}', flush=True)
print(json.dumps({'checked': len(paths), 'failures': failures}, ensure_ascii=False))
sys.exit(bool(failures))
