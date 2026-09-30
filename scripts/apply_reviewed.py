"""Preserve explicitly reviewed corrections across automatic metadata rebuilds."""
import json,collections
from pathlib import Path
from audit_questions import TOPICS
ROOT=Path(__file__).resolve().parents[1]
def apply_reviewed(meta,report):
    reviewed=json.loads((ROOT/'scripts/reviewed-overrides.json').read_text())
    labels={tid:label for tid,label,*rest in TOPICS}
    for qid,override in reviewed['questions'].items():
        item=meta['questions'][qid]
        item.update(override);item['topic']=labels[item['topicId']];item['topicConfidence']='manual-reviewed';item['keywords']=[]
        if 'displayHeight' in override:item['displayNote']='元試験の次分野案内のみ非表示。問題文・図表・選択肢は保持。'
    report['manualReview']={'questionIds':list(reviewed['questions']),'scope':reviewed['scope']}
    report['topicHintCounts']=dict(collections.Counter(x['topicConfidence'] for x in meta['questions'].values()))
if __name__=='__main__':
    meta=json.loads((ROOT/'data/question-meta.json').read_text());report=json.loads((ROOT/'data/question-audit.json').read_text());apply_reviewed(meta,report)
    (ROOT/'data/question-meta.json').write_text(json.dumps(meta,ensure_ascii=False,separators=(',',':')))
    (ROOT/'data/question-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
