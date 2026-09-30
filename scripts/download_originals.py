"""Download the already-catalogued public IPA originals for read-only audit."""
import json, hashlib, urllib.request, concurrent.futures
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=Path('/tmp/ipass-originals');OUT.mkdir(exist_ok=True)
catalog=json.loads((ROOT/'data/catalog.json').read_text())
def download(job):
    exam,kind=job
    suffix='qs' if kind=='question' else 'ans'
    path=OUT/f"{exam['id']}_ip_{suffix}.pdf"
    url=exam.get('retrieved'+kind.title()+'Url') or exam[kind+'Url']
    if not path.exists():
        with urllib.request.urlopen(url,timeout=45) as response:data=response.read()
        if not data.startswith(b'%PDF'):raise ValueError(f'{url}: not a PDF')
        path.write_bytes(data)
    assert hashlib.sha256(path.read_bytes()).hexdigest()==exam[kind+'Sha256'],path
    return str(path)
if __name__=='__main__':
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for result in pool.map(download,[(e,k) for e in catalog['exams'] for k in ['question','answer']]):print(result,flush=True)
