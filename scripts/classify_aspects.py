"""Content-based first-pass classification; school rubric, not official IPA labels.
Requires /tmp/ipass-ocr/*.txt from ocr_topics.py. Never relabel to meet a quota.
"""
import json,re,collections
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
RULES=[
 ('quantitative',r'何[円人件秒分時間日個台ビットバイト]|求め[るた]|計算|確率|期待値|損益分岐|稼働率|応答時間|[0-9]+\s*(?:万円|千円|円|%|秒|分|時間|日|件|台|個|ビット|バイト|Mバイト|Gバイト|Mbps|GHz)|マクシミン|利益.*表','条件に基づく計算・数量判断'),
 ('diagram',r'図[のにをで]|表[のにをで]|図に示|表に示|次の表|次の図|流れ図|フローチャート|アローダイアグラム|クリティカルパス|擬似言語|変数.*値|配列.*値|プログラム.*実行','図表・手順・処理結果の読み取り'),
 ('case',r'(?:可能性|許諾|著作権).*(?:全て|すべて)|[A-ZＡ-Ｚ]\s*社|ある(?:企業|会社|部署|組織|店|工場)|次の(?:事例|状況|条件)|事例.*(?:該当|分類|どれ)|次のよう(?:な|に)|に該当する事例|事例に該当|に相当する事例|具体例.*どれ','事例の条件を解釈して分類・判断'),
 ('decision',r'(?:場合|とき|際)[,、\s]*(?:に|の|は)|(?:目的|対策|方法|手段|対応|改善策|施策).*最も適切|(?:選定|選択|採用|導入).*(?:べき|適切)|どのように|どれを.*(?:選|使|用い)','目的・条件に応じた方法の選択'),
]
def classify(text):
 stem=re.split(r'\n\s*[アイウエ]\s',text,maxsplit=1)[0].strip();stem=re.sub(r'^\s*問\s*[0-9]+\s*','',stem)
 for rule,pat,reason in RULES:
  m=re.search(pat,stem)
  if m:return {'aspect':'思考・判断・表現','rule':rule,'reason':reason,'evidence':m.group(),'stem':stem,'reviewStatus':'一次分類・未確定'}
 return {'aspect':'知識・技能','rule':'understanding','reason':'用語・仕組み・性質・手順の理解を問う設問として一次分類','evidence':stem[:100],'stem':stem,'reviewStatus':'一次分類・未確定'}
def main():
 report={'schemaVersion':1,'method':'content-ocr-first-pass-school-rubric','status':'provisional','rubric':{'知識・技能':'用語・仕組み・性質・手順の理解','思考・判断・表現':'条件・事例・図表を用いる計算・比較・方法選択・判断'},'limitations':['IPA公式の観点分類ではない。','OCRの誤読と複数観点を含む問題があるため教員確認が必要。','四肢択一で表現力そのものを十分に測るものではない。'],'questions':{}}
 for file in sorted((ROOT/'data').glob('20*.json')):
  bank=json.loads(file.read_text())
  for q in bank['questions']:
   text=(Path('/tmp/ipass-ocr')/(q['id']+'.txt')).read_text();a=classify(text);a['source']=q['source'];a['domain']=q['domain'];a['textLength']=len(text);a['needsVisualReview']=len(a['stem'])<30 or not re.search(r'問\s*'+str(q['number']),text[:30]);report['questions'][q['id']]=a;q['aspect']=a['aspect'];q['aspectClassification']='provisional-content-v1'
  file.write_text(json.dumps(bank,ensure_ascii=False,separators=(',',':'))+'\n')
 report['counts']=dict(collections.Counter(a['aspect'] for a in report['questions'].values()));all_questions=report.pop('questions');report['papers']=[]
 for e in json.loads((ROOT/'data/catalog.json').read_text())['exams']:
  name='data/aspects-'+e['id']+'.json';report['papers'].append({'id':e['id'],'label':e['label'],'path':name});(ROOT/name).write_text(json.dumps({'questions':{k:v for k,v in all_questions.items() if k.startswith(e['id']+'-')}},ensure_ascii=False,separators=(',',':'))+'\n')
 (ROOT/'data/question-aspects.json').write_text(json.dumps(report,ensure_ascii=False,separators=(',',':'))+'\n');print(report['counts']);print('Domain counts',collections.Counter((a['domain'],a['aspect']) for a in all_questions.values()));print('Visual-review flags',sum(a['needsVisualReview'] for a in all_questions.values()))
if __name__=='__main__':main()
