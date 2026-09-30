import {grade,validStudent,normalizeName} from './core.js';
import {isUuid,attemptKind} from './progress.js';
export function validateSubmission(p,bank){
 if(p?.app!=='info1_IPass'||p.kind!=='progress'||p.schemaVersion!==2||!validStudent(p.studentCode,p.studentName)||!Array.isArray(p.attempts)||!p.attempts.length||p.attempts.length>10000)throw new Error('履歴JSONの形式が正しくありません。');
 const ids=new Set(),rounds=new Set(),results=[];
 for(const a of p.attempts){
  if(!isUuid(a.attemptId)||ids.has(a.attemptId)||!Number.isInteger(a.round)||a.round<1||rounds.has(attemptKind(a)+':'+a.round)||a.studentCode!==p.studentCode||normalizeName(a.studentName)!==normalizeName(p.studentName)||!Number.isFinite(Date.parse(a.startedAt))||!['running','completed','abandoned'].includes(a.status))throw new Error('受験記録の形式が正しくありません。');ids.add(a.attemptId);rounds.add(attemptKind(a)+':'+a.round);
  if(a.status==='running'){if(a.result)throw new Error('受験中の記録に終了結果があります。');continue;}
  const r=a.result;if(!r||r.app!=='info1_IPass'||r.schemaVersion!==1||r.attemptId!==a.attemptId||r.studentCode!==p.studentCode||normalizeName(r.studentName)!==normalizeName(p.studentName)||!Array.isArray(r.answers)||r.answers.length<1||r.answers.length>1500||typeof r.title!=='string'||r.title.length>200||!Number.isFinite(Date.parse(r.finishedAt))||Date.parse(r.finishedAt)<Date.parse(a.startedAt))throw new Error('結果JSONの形式が正しくありません。');
  const qs=[],picked={},seen=new Set();for(const x of r.answers){if(!bank.has(x.id)||seen.has(x.id)||!Number.isInteger(x.picked)||x.picked< -1||x.picked>3)throw new Error('解答データが正しくありません。');seen.add(x.id);qs.push(bank.get(x.id));if(x.picked>=0)picked[x.id]=x.picked;}
  results.push({...r,round:a.round,abandoned:a.status==='abandoned',...grade(qs,picked)});
 }
 return results;
}
