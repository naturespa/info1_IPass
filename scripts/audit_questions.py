"""Audit 1,500 crops/official keys and create transparent keyword topic hints.
Run after download_originals.py. Generated files are data, not human review claims.
"""
import json,re,base64,io,hashlib,unicodedata,datetime
from pathlib import Path
import fitz,numpy as np
from PIL import Image
from build_bank import answer_key
ROOT=Path(__file__).resolve().parents[1];PDF=Path('/tmp/ipass-originals')
TOPICS=[
 ('business','経営戦略・事業','ストラテジ系',['SWOT','PPM','経営戦略','競争戦略','事業戦略','ビジネスモデル','コアコンピタンス','バリューチェーン','アライアンス','M&A','BSC','アンゾフ']),
 ('marketing','マーケティング','ストラテジ系',['マーケティング','市場調査','顧客','販売促進','広告','セグメンテーション','4P','CRM','ブランド']),
 ('finance','会計・財務','ストラテジ系',['損益','貸借対照表','財務','売上','利益','固定費','変動費','損益分岐点','原価','キャッシュフロー','ROI','ROE']),
 ('law','法務・知的財産','ストラテジ系',['著作権','特許','商標','法律','個人情報保護','不正アクセス禁止','労働者派遣','請負','コンプライアンス','営業秘密']),
 ('organization','企業活動・業務改善','ストラテジ系',['組織','企業活動','CSR','BCP','SDGs','在庫','発注','品質管理','ABC分析','パレート','業務改善','SCM','ERP','RPA']),
 ('strategy','システム戦略・要件定義','ストラテジ系',['システム戦略','要件定義','RFP','調達','システム化','業務要件','DX','デジタルトランスフォーメーション']),
 ('project','プロジェクト管理','マネジメント系',['プロジェクト','WBS','クリティカルパス','PERT','ガントチャート','進捗','スコープ','PMBOK','見積り']),
 ('service','サービス管理','マネジメント系',['サービスマネジメント','SLA','SLM','ITIL','サービスデスク','インシデント','可用性','問題管理','変更管理','サービスレベル']),
 ('audit','システム監査・内部統制','マネジメント系',['監査','内部統制','監査証拠','独立性']),
 ('development','開発・テスト','マネジメント系',['ソフトウェア開発','テスト','アジャイル','スクラム','ウォータフォール','レビュー','設計','開発工程','DevOps','保守']),
 ('security','情報セキュリティ','テクノロジ系',['セキュリティ','暗号','認証','パスワード','マルウェア','ウイルス','フィッシング','攻撃','脆弱性','公開鍵','電子署名','ファイアウォール','アクセス制御','バックアップ','ISMS']),
 ('network','ネットワーク','テクノロジ系',['ネットワーク','IPアドレス','TCP','UDP','DNS','HTTP','LAN','ルータ','通信','プロトコル','Wi-Fi','Ethernet','サブネット']),
 ('database','データベース','テクノロジ系',['データベース','SQL','主キー','外部キー','正規化','関係データ','トランザクション','結合','SELECT']),
 ('algorithm','アルゴリズム・基礎理論','テクノロジ系',['アルゴリズム','擬似言語','流れ図','2進','二進','論理','配列','変数','繰返し','ビット','確率','集合','プログラム']),
 ('hardware','ハードウェア・ソフトウェア','テクノロジ系',['CPU','メモリ','OS','SSD','ハードディスク','半導体','入出力','キャッシュ','仮想記憶','デバイス','プロセッサ','オープンソース']),
 ('system','システム構成・性能','テクノロジ系',['クラウド','仮想化','冗長','稼働率','応答時間','スループット','RAID','サーバ','クライアント','SaaS','IaaS','PaaS','IoT']),
 ('data-ai','データ活用・AI','テクノロジ系',['人工知能','機械学習','AI','ディープラーニング','学習データ','教師あり','生成AI','ビッグデータ','相関','回帰','ニューラル','データ分析']),
 ('design','インタフェース・マルチメディア','テクノロジ系',['ユーザビリティ','アクセシビリティ','インタフェース','ユニバーサルデザイン','画像','動画','音声','色','ピクセル','圧縮','JPEG','UX','UI'])]
def classify(text,domain):
    stem=re.split(r'\n\s*[アイウエ]\s',text,maxsplit=1)[0]
    choices=[]
    for tid,label,d,words in TOPICS:
        if d!=domain:continue
        hits=[w for w in words if re.search(r'(?<![A-Za-z])'+re.escape(w)+r'(?![A-Za-z])',text,re.I)]
        score=sum(3 if w.lower() in stem.lower() else 1 for w in hits)
        if score:choices.append((score,tid,label,hits))
    choices.sort(reverse=True)
    if not choices or (len(choices)>1 and choices[0][0]==choices[1][0]):return {'topicId':'general-'+str(['ストラテジ系','マネジメント系','テクノロジ系'].index(domain)),'topic':domain+'の基礎','topicConfidence':'domain-only','keywords':[]}
    best=choices[0];return {'topicId':best[1],'topic':best[2],'topicConfidence':'keyword-hint','keywords':best[3][:5]}
def main():
    catalog=json.loads((ROOT/'data/catalog.json').read_text());bounds=json.loads((ROOT/'scripts/boundaries.json').read_text());metadata={};issues=[];reference_count=0;pixel_max=0;vis=[]
    for e in catalog['exams']:
        stem=e['id'];qf=PDF/f'{stem}_ip_qs.pdf';af=PDF/f'{stem}_ip_ans.pdf'
        assert hashlib.sha256(qf.read_bytes()).hexdigest()==e['questionSha256'];assert hashlib.sha256(af.read_bytes()).hexdigest()==e['answerSha256']
        doc=fitz.open(qf);key=answer_key(af);data=json.loads((ROOT/'data'/f'{stem}.json').read_text());sprites={};pages={};positions=bounds[stem]
        for i,q in enumerate(data['questions']):
            imeta=q['image'];src=imeta['src']
            if src not in sprites:
                svg=(ROOT/src).read_text();sprites[src]=Image.open(io.BytesIO(base64.b64decode(re.search(r'base64,([^"\']+)',svg)[1]))).convert('L')
            sprite=sprites[src];assert sprite.size==(imeta['width'],imeta['spriteHeight']);assert imeta['y']+imeta['height']<=sprite.height;assert q['answer']==key[q['number']]
            actual=sprite.crop((0,imeta['y'],sprite.width,imeta['y']+imeta['height']));chunks=[];texts=[];pn,top=positions[i];end_p,end_top=positions[i+1] if i<99 else (pn+1,0)
            for p in range(pn,end_p+1):
                if p==end_p and (i==99 or end_top<30):break
                page=doc[p]
                if p not in pages:
                    pix=page.get_pixmap(matrix=fitz.Matrix(2,2));pages[p]=Image.frombytes('RGB',(pix.width,pix.height),pix.samples)
                im=pages[p];y0=max(0,int(top-16)) if p==pn else int(im.height*.075);y1=int(end_top-18) if p==end_p else int(im.height*.925);x0=int(im.width*.077);x1=int(im.width*.933)
                if y1<=y0:continue
                texts.append(page.get_text(clip=fitz.Rect(x0/2,y0/2,x1/2,y1/2)))
                a=im.crop((x0,y0,x1,y1)).convert('L');rows=np.where((np.asarray(a)<125).sum(axis=1)>4)[0]
                if len(rows):a=a.crop((0,max(0,int(rows[0])-10),a.width,min(a.height,int(rows[-1])+18)))
                chunks.append(a.resize((860,round(a.height*860/a.width)),Image.Resampling.LANCZOS))
            expected=Image.new('L',(860,sum(c.height for c in chunks)+20*(len(chunks)-1)),255);y=0
            for c in chunks:expected.paste(c,(0,y));y+=c.height+20
            assert actual.size==expected.size,(q['id'],actual.size,expected.size)
            error=float(np.abs(np.asarray(actual,dtype=np.int16)-np.asarray(expected,dtype=np.int16)).mean());pixel_max=max(pixel_max,error)
            text=unicodedata.normalize('NFKC',''.join(texts));heads=re.findall(r'問\s*(\d+)',text)
            flags=[]
            if error>4:flags.append('pixel-difference')
            if not heads or int(heads[0])!=q['number']:flags.append('question-heading-review')
            if len(set(map(int,heads)))>1:flags.append('multiple-question-numbers-review')
            if any(letter not in text for letter in 'アイウエ'):flags.append('choice-label-review')
            topic=classify(text,q['domain']);metadata[q['id']]={**topic,'timeSensitive':bool(re.search(r'法律|著作権|特許|個人情報|労働|規格|標準化|制度',text))}
            if flags:issues.append({'id':q['id'],'flags':flags,'pixelMeanError':round(error,4),'headings':heads})
            # Prioritize unusual sizes and cross-page questions for human inspection.
            if q['image']['height']>900 or (i<99 and positions[i+1][0]>pn) or flags:vis.append(q['id'])
        for src in data['references']:
            svg=(ROOT/src).read_text();im=Image.open(io.BytesIO(base64.b64decode(re.search(r'base64,([^"\']+)',svg)[1])));im.load();assert im.width>500 and im.height>500;reference_count+=1
        print(stem,'100 verified',flush=True)
    payload={'schemaVersion':1,'method':'keyword-hints-not-official-topic-labels','questions':metadata}
    report={'schemaVersion':1,'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'questionCount':len(metadata),'officialAnswerKeysMatched':len(metadata),'originalPdfHashesMatched':30,'questionImagesDecoded':len(metadata),'referenceImagesDecoded':reference_count,'maxPixelMeanError':round(pixel_max,4),'automatedReviewCandidates':issues,'visualReviewCandidates':vis,'manualReview':{'questionIds':[],'scope':'Not a claim that all 1500 questions were manually reviewed.'},'limits':['Keyword topic hints need teacher confirmation.','Current laws and standards are not retroactively certified.','Automated pixel comparison verifies reproduction of saved boundaries, not their semantic completeness.']}
    from apply_reviewed import apply_reviewed
    apply_reviewed(payload,report)
    (ROOT/'data/question-meta.json').write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':')))
    (ROOT/'data/question-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print('Audit complete:',len(metadata),'questions;',len(issues),'review candidates',flush=True)
if __name__=='__main__':main()
