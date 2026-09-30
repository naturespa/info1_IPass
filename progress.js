import {DOMAINS,normalizeName} from './core.js';
export const MAX_ATTEMPTS=5;
export function isChallenge(a){const mode=a.settings?.mode??a.result?.settings?.mode;return mode==='school'||mode==null;}
export function attemptKind(a){return isChallenge(a)?'challenge':'practice';}
export function roundLabel(a){return (isChallenge(a)?'本チャレンジ':'練習')+' 第'+a.round+'回';}
export const STATUS_LABELS={running:'受験中',completed:'終了',abandoned:'中断終了'};
export const isUuid=s=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
export function attemptsFor(records,code){return records.filter(x=>x.studentCode===code).sort((a,b)=>(a.round??999)-(b.round??999)||Date.parse(a.startedAt)-Date.parse(b.startedAt)||a.attemptId.localeCompare(b.attemptId));}
export function mergeAttempts(...sets){
 const m=new Map(),rank={running:1,abandoned:2,completed:3};
 for(const record of sets.flat()){
  if(!record||!isUuid(record.attemptId)||!record.startedAt)continue;
  const old=m.get(record.attemptId);
  if(!old||(rank[record.status]??0)>=(rank[old.status]??0))m.set(record.attemptId,{...old,...record});
 }
 const out=[...m.values()];
 for(const code of new Set(out.map(x=>x.studentCode))){
  for(const kind of ['challenge','practice']){
   const a=out.filter(x=>x.studentCode===code&&attemptKind(x)===kind).sort((x,y)=>Date.parse(x.startedAt)-Date.parse(y.startedAt)||(x.round??999)-(y.round??999)||x.attemptId.localeCompare(y.attemptId));
   const stable=a.every(r=>r.kind===kind&&Number.isInteger(r.round)&&r.round>0)&&new Set(a.map(r=>r.round)).size===a.length;
   a.forEach((r,i)=>{r.kind=kind;if(!stable)r.round=i+1;if(r.result)r.result={...r.result,round:r.round};if(r.session)r.session={...r.session,round:r.round};});
  }
 }
 for(const r of out)if(r.status!=='running')delete r.session;
 return out;
}
export function attemptFromSession(s){
 const status=s.result?(s.result.abandoned?'abandoned':'completed'):'running';
 return {attemptId:s.attemptId,studentCode:s.studentCode,studentName:normalizeName(s.studentName),kind:attemptKind(s),round:s.round,status,title:s.title,settings:s.settings,startedAt:s.startedAt,deadline:s.deadline,finishedAt:s.result?.finishedAt??null,result:s.result??null,...(status==='running'?{session:structuredClone(s)}:{})};
}
export function comparisonKey(r){const s=r.settings??r.result?.settings??{};return JSON.stringify([s.mode??'legacy',s.count??r.result?.total,s.domain??'all',s.minutes]);}
export function comparisonLabel(r){const s=r.settings??r.result?.settings??{};return (({school:'本チャレンジ',year:'年度別練習',practice:'練習'})[s.mode]??'過去の受験')+'・'+(s.count??r.result?.total??'—')+'問・'+(s.minutes??'—')+'分・'+(s.domain==='all'?'全分野':s.domain??'全分野');}
export function summarize(records,key){
 const complete=records.filter(x=>x.status==='completed'&&x.result).sort((a,b)=>a.round-b.round);
 const group=key??(complete.length?comparisonKey(complete.at(-1)):null);
 const selected=complete.filter(x=>comparisonKey(x)===group),first=selected[0]?.result,last=selected.at(-1)?.result;
 return {key:group,completed:complete.length,selected,firstRound:selected[0]?.round,lastRound:selected.at(-1)?.round,latest:last?.score??null,gain:first&&last?last.score-first.score:null,
  byDomain:DOMAINS.map(domain=>{const f=first?.byDomain?.find(d=>d.domain===domain),l=last?.byDomain?.find(d=>d.domain===domain);return {domain,latest:l?.rate??null,correct:l?.correct??0,total:l?.total??0,gain:f?.rate!=null&&l?.rate!=null?l.rate-f.rate:null};})};
}
export function progressPacket(records,code,name){return {app:'info1_IPass',kind:'progress',schemaVersion:2,studentCode:code,studentName:normalizeName(name),exportedAt:new Date().toISOString(),maxAttempts:MAX_ATTEMPTS,attempts:attemptsFor(records,code)};}
export function resultItems(data){if(data?.app==='info1_IPass'&&data.kind==='progress'&&data.schemaVersion===2&&Array.isArray(data.attempts))return data.attempts.filter(a=>a.result).map(a=>({...a.result,round:a.round,abandoned:a.status==='abandoned'}));return [data];}
