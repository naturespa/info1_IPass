"""Build question images from IPA PDF originals and reviewed page boundaries.
Usage: python scripts/build_bank.py --pdf-dir /path/to/pdfs
Install: pip install pymupdf pillow numpy
OCR is used only to find boundaries during initial preparation. Reviewed boundaries
are checked in; no OCR transcription or third-party explanations are reproduced.
"""
import argparse, hashlib, json, re, io, base64
from pathlib import Path
import fitz
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
LABELS='アイウエ'

def save_image(im,path):
    out=io.BytesIO();im.save(out,format='WEBP',quality=88,method=4)
    data=out.getvalue();assert len(data)>100 and data[:4]==b'RIFF',path
    svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="{im.width}" height="{im.height}" viewBox="0 0 {im.width} {im.height}"><image width="{im.width}" height="{im.height}" href="data:image/webp;base64,{base64.b64encode(data).decode()}"/></svg>'
    temp=path.with_suffix('.tmp');temp.write_text(svg);temp.replace(path)

def answer_key(pdf):
    doc=fitz.open(pdf);page=doc[0]
    # Read geometric coordinates, not text-stream order (some PDFs list columns separately).
    words=page.get_text('words');keys=[];letters=[]
    for w in words:
        text=w[4].replace(' ','')
        m=re.fullmatch(r'問(\d+)',text)
        if m:keys.append((int(m[1]),w))
        elif text in LABELS:letters.append(w)
    if len(keys)!=100:
        # Older originals split the question label from its number.
        keys=[]
        for w in words:
            if re.fullmatch(r'\d+',w[4]) and 1<=int(w[4])<=100:
                keys.append((int(w[4]),w))
    assert len(keys)==100 and len(letters)==100,(pdf,len(keys),len(letters))
    out={}
    for n,w in keys:
        cy=(w[1]+w[3])/2
        opts=[v for v in letters if abs((v[1]+v[3])/2-cy)<5 and 0<v[0]-w[2]<100]
        assert len(opts)==1,(pdf,n,opts)
        out[n]=LABELS.index(opts[0][4])
    assert sorted(out)==list(range(1,101))
    return out

def crop_question(doc,pos,next_pos):
    page_no,top=pos;end_page,end_top=next_pos if next_pos else (page_no+1,0)
    chunks=[]
    for pn in range(page_no,end_page+1):
        if pn==end_page and (next_pos is None or end_top<30):break
        p=doc[pn];pix=p.get_pixmap(matrix=fitz.Matrix(2,2));im=Image.frombytes('RGB',(pix.width,pix.height),pix.samples)
        y0=max(0,int(top-16)) if pn==page_no else int(pix.height*.075)
        y1=int(end_top-18) if pn==end_page else int(pix.height*.925)
        x0=int(pix.width*.077);x1=int(pix.width*.933)
        if y1<=y0:continue # next page begins with the next question; no continuation
        a=im.crop((x0,y0,x1,y1)).convert('L')
        pixels=np.asarray(a);rows=np.where((pixels<125).sum(axis=1)>4)[0]
        if len(rows):a=a.crop((0,max(0,int(rows[0])-10),a.width,min(a.height,int(rows[-1])+18)))
        a=a.resize((860,round(a.height*860/a.width)),Image.Resampling.LANCZOS);chunks.append(a)
    assert chunks
    joined=Image.new('L',(860,sum(c.height for c in chunks)+20*(len(chunks)-1)),255);y=0
    for c in chunks:joined.paste(c,(0,y));y+=c.height+20
    return joined

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--pdf-dir',type=Path,required=True);args=ap.parse_args()
    specs=json.loads((ROOT/'scripts/sources.json').read_text());boundaries=json.loads((ROOT/'scripts/boundaries.json').read_text());catalog=[]
    (ROOT/'assets').mkdir(exist_ok=True);(ROOT/'data').mkdir(exist_ok=True)
    for spec in specs:
        stem=spec['id'];qf=args.pdf_dir/f'{stem}_ip_qs.pdf';af=args.pdf_dir/f'{stem}_ip_ans.pdf'
        assert qf.read_bytes().startswith(b'%PDF') and af.read_bytes().startswith(b'%PDF')
        doc=fitz.open(qf);key=answer_key(af);pos=boundaries[stem];assert len(pos)==100
        if (ROOT/'data'/f'{stem}.json').exists():
            existing=json.loads((ROOT/'data'/f'{stem}.json').read_text())
            catalog.append({**spec,'questionCount':100,'references':existing['references'],'questionSha256':hashlib.sha256(qf.read_bytes()).hexdigest(),'answerSha256':hashlib.sha256(af.read_bytes()).hexdigest()})
            print(stem,'existing images',flush=True);continue
        questions=[];images=[]
        for i,(pn,top) in enumerate(pos):
            nxt=pos[i+1] if i<99 else None;images.append(crop_question(doc,(pn,top),nxt))
        for group in range(10):
            ims=images[group*10:group*10+10];height=sum(a.height for a in ims)
            assert height<16383,(stem,group,height)
            sprite=Image.new('L',(860,height),255);y=0
            for j,im in enumerate(ims):
                n=group*10+j+1;sprite.paste(im,(0,y));domain='ストラテジ系' if n<=spec['strategyEnd'] else 'マネジメント系' if n<=spec['managementEnd'] else 'テクノロジ系'
                questions.append({'id':f'{stem}-{n:03d}','examId':stem,'number':n,'domain':domain,'answer':key[n],'source':f"出典：{spec['label']} ITパスポート試験 公開問題 問{n}",'explanationUrl':f"https://www.itpassportsiken.com/kakomon/{spec['dojoId']}/q{n}.html",'image':{'src':f'assets/{stem}-{group}.svg','width':860,'height':im.height,'y':y,'spriteHeight':height},'originalPage':pos[n-1][0]+1});y+=im.height
            save_image(sprite,ROOT/'assets'/f'{stem}-{group}.svg')
        references=[]
        for pn in range(pos[-1][0]+1,len(doc)):
            pix=doc[pn].get_pixmap(matrix=fitz.Matrix(1.7,1.7));im=Image.frombytes('RGB',(pix.width,pix.height),pix.samples).convert('L');name=f'assets/{stem}-reference-{pn}.svg';save_image(im,ROOT/name);references.append(name)
        (ROOT/'data'/f'{stem}.json').write_text(json.dumps({'id':stem,'label':spec['label'],'questions':questions,'references':references},ensure_ascii=False,separators=(',',':')))
        catalog.append({**spec,'questionCount':100,'references':references,'questionSha256':hashlib.sha256(qf.read_bytes()).hexdigest(),'answerSha256':hashlib.sha256(af.read_bytes()).hexdigest()})
        print(stem,'100 questions',len(references),'reference pages',flush=True)
    (ROOT/'data/catalog.json').write_text(json.dumps({'schemaVersion':1,'totalQuestions':1500,'exams':catalog},ensure_ascii=False,indent=2))
if __name__=='__main__':main()
