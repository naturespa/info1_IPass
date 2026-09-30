export const DOMAINS = ['ストラテジ系','マネジメント系','テクノロジ系'];
export const LABELS = ['ア','イ','ウ','エ'];
export const IPA_WEIGHTS = [35,20,45];
export function domainAllocation(count) {
 if(!Number.isInteger(count)||count<1||count>1500)throw new Error('問題数が正しくありません。');
 const exact=IPA_WEIGHTS.map(w=>count*w/100),n=exact.map(Math.floor);
 const order=exact.map((x,i)=>({i,remainder:x-n[i]})).sort((a,b)=>b.remainder-a.remainder||IPA_WEIGHTS[b.i]-IPA_WEIGHTS[a.i]);
 const extra=count-n.reduce((a,b)=>a+b,0);for(let j=0;j<extra;j++)n[order[j].i]++;
 return DOMAINS.map((domain,i)=>({domain,count:n[i]}));
}
export function normalizeName(s) { return String(s).trim().replace(/[\s\u3000]+/g,' '); }
export function validStudent(code,name) {return typeof code==='string' && typeof name==='string' && /^\d{4}$/.test(code) && /^\S+ \S+$/.test(normalizeName(name)) && name.length<=60;}
export function remainingSeconds(deadline,now=Date.now()) {return Math.max(0,Math.ceil((deadline-now)/1000));}
export function clock(seconds) {return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;}
export function shuffle(list,random=Math.random) {const a=[...list];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
export function selectQuestions(bank,{mode,domain='all',count=35},random=Math.random) {
 const filtered=bank.filter(q=>domain==='all'||q.domain===domain);
 if(mode==='year')return filtered;
 if(domain==='all'){
  const selected=[];
  for(const part of domainAllocation(count)){
   const pool=filtered.filter(q=>q.domain===part.domain);
   if(pool.length<part.count)throw new Error(`${part.domain}は${part.count}問必要ですが、選んだ年度には${pool.length}問しかありません。「全15回」など出題範囲を広げてください。`);
   selected.push(...shuffle(pool,random).slice(0,part.count));
  }
  return selected;
 }
 if(filtered.length<count)throw new Error(`選んだ範囲は${filtered.length}問です。問題数を減らしてください。`);
 return shuffle(filtered,random).slice(0,count);
}
export function grade(questions,answers) {
 const rows=questions.map(q=>({id:q.id,examId:q.examId,number:q.number,domain:q.domain,source:q.source,picked:Number.isInteger(answers[q.id])&&answers[q.id]>=0&&answers[q.id]<4?answers[q.id]:-1,correctAnswer:q.answer,correct:answers[q.id]===q.answer}));
 const correct=rows.filter(r=>r.correct).length;
 return {correct,total:rows.length,score:Math.round(correct/rows.length*100),byDomain:DOMAINS.map(domain=>{const a=rows.filter(r=>r.domain===domain),c=a.filter(r=>r.correct).length;return {domain,correct:c,total:a.length,rate:a.length?Math.round(c/a.length*100):null};}),answers:rows};
}
export function advice(result) {
 const present=result.byDomain.filter(r=>r.total>0).sort((a,b)=>a.rate-b.rate);
 if(result.score===100)return '全問正解です。別の年度でも取り組み、正しい選択肢の理由と他の選択肢が違う理由を説明してみましょう。';
 if(result.score>=80)return `よく理解できています。${present[0]?.domain??'誤答'}の間違えた問題を確認し、計算や判断の手順を整理しましょう。`;
 return `${present[0]?.domain??'誤答'}から復習しましょう。用語の意味と具体例を確認し、間違えた問題を翌日にもう一度解いてみましょう。`;
}
export function csvCell(v){let s=String(v??'');if(/^[\s\x00-\x1f]*[=+\-@]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
export function toCsv(rows){return '\ufeff'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n');}
export function parseCsv(text){let rows=[],row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(Boolean))rows.push(row);row=[];cell='';}else cell+=c;}row.push(cell);if(row.some(Boolean))rows.push(row);if(quoted)throw new Error('CSVの引用符が閉じられていません。');return rows;}
