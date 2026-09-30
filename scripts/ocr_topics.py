"""Use local OCR for topic hints and visual-review candidates; not a transcription product."""
import json,re,base64,io,subprocess,concurrent.futures,os,unicodedata,collections
from pathlib import Path
from PIL import Image
from audit_questions import classify
ROOT=Path(__file__).resolve().parents[1]
OUT=Path('/tmp/ipass-ocr');OUT.mkdir(exist_ok=True)
jobs=[]
for file in sorted((ROOT/'data').glob('20*.json')):
    data=json.loads(file.read_text());sprites={}
    for q in data['questions']:
        src=q['image']['src']
        if src not in sprites:
            svg=(ROOT/src).read_text();sprites[src]=Image.open(io.BytesIO(base64.b64decode(re.search(r'base64,([^"\']+)',svg)[1]))).convert('L')
        image=q['image'];crop=sprites[src].crop((0,image['y'],image['width'],image['y']+image['height']));buf=io.BytesIO();crop.save(buf,format='PNG');jobs.append((q,buf.getvalue()))
def process(job):
    q,png=job;cache=OUT/(q['id']+'.txt')
    if cache.exists():text=cache.read_text()
    else:
        p=subprocess.run(['tesseract','stdin','stdout','--tessdata-dir','/tmp/ipass-tessdata','-l','jpn+eng','--psm','6'],input=png,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env={**os.environ,'OMP_THREAD_LIMIT':'1'},check=True);text=unicodedata.normalize('NFKC',p.stdout.decode());cache.write_text(text)
    return q,text
def main():
    meta=json.loads((ROOT/'data/question-meta.json').read_text());report=json.loads((ROOT/'data/question-audit.json').read_text());review=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        for n,(q,text) in enumerate(pool.map(process,jobs),1):
            item=classify(text,q['domain']);item['timeSensitive']=bool(re.search(r'法律|著作権|特許|個人情報|労働|規格|標準化|制度',text));item['extraction']='local-ocr';meta['questions'][q['id']]=item
            heads=re.findall(r'(?:^|\n)\s*問\s*(\d+)',text);flags=[]
            if not heads or int(heads[0])!=q['number']:flags.append('ocr-heading-unconfirmed')
            if len(set(map(int,heads)))>1:flags.append('ocr-multiple-headings-review')
            if any(letter not in text for letter in 'アイウエ'):flags.append('ocr-choice-label-unconfirmed')
            if flags:review.append({'id':q['id'],'flags':flags})
            if n%100==0:print(n,'OCR topic hints processed',flush=True)
    report['ocrReviewCandidates']=review;report['topicHintCounts']=dict(collections.Counter(x['topicConfidence'] for x in meta['questions'].values()));report['ocrLimits']='OCR-unconfirmed markers are review candidates, not confirmed missing text or figures.'
    from apply_reviewed import apply_reviewed
    apply_reviewed(meta,report)
    (ROOT/'data/question-meta.json').write_text(json.dumps(meta,ensure_ascii=False,separators=(',',':')));(ROOT/'data/question-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print('Done:',report['topicHintCounts'],len(review),'OCR review candidates',flush=True)
if __name__=='__main__':main()
