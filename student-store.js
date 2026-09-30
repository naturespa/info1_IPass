import {previousQuestionIds} from './draw.js';
import {normalizeName} from './core.js';
import {MAX_ATTEMPTS,attemptsFor,attemptFromSession,mergeAttempts,progressPacket,isChallenge,attemptKind} from './progress.js';
const LEDGER='ipass:attempts:v2',ACTIVE='ipass:active:v1';
function read(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
export class StudentStore {
 constructor(){this.error='';try{this.migrate();}catch{this.error='ブラウザ保存を有効にしてください。記録を保存できないため試験を開始できません。';}}
 migrate(){const legacy=read('ipass:history:v1',[]).filter(r=>r?.startedAt).map(r=>({attemptId:r.attemptId,studentCode:r.studentCode,studentName:r.studentName,status:r.abandoned?'abandoned':'completed',title:r.title,settings:r.settings,startedAt:r.startedAt,round:r.round,result:r,finishedAt:r.finishedAt}));const active=read(ACTIVE,null),records=mergeAttempts(this.all(),legacy,active?.startedAt?[attemptFromSession(active)]:[]);if(records.length){this.write(records);const r=records.find(a=>a.attemptId===active?.attemptId);if(r&&active?.startedAt)localStorage.setItem(ACTIVE,JSON.stringify({...active,round:r.round,result:r.result}));}}
 all(){return read(LEDGER,[]);}
 write(records){localStorage.setItem(LEDGER,JSON.stringify(records));}
 forStudent(code){return attemptsFor(this.all(),code);}
 challengeFor(code){return this.forStudent(code).filter(isChallenge);}
 nextRound(code,settings){return this.forStudent(code).filter(a=>attemptKind(a)===attemptKind({settings})).reduce((max,a)=>Math.max(max,a.round),0)+1;}
 checkName(code,name){const existing=this.forStudent(code)[0];if(existing&&normalizeName(existing.studentName)!==normalizeName(name))throw new Error('この受験番号には別の氏名の記録があります。番号・氏名を確認してください。');}
 async start(s){const start=()=>{if(this.error)throw new Error(this.error);this.checkName(s.studentCode,s.studentName);const records=this.forStudent(s.studentCode),challenge=isChallenge(s),round=this.nextRound(s.studentCode,s.settings);if(challenge&&round>MAX_ATTEMPTS)throw new Error('本チャレンジ5回を使い切りました。練習は引き続き無制限で利用できます。');if(records.some(a=>a.status==='running'&&a.attemptId!==s.attemptId))throw new Error('受験中の記録があります。ステータスから再開してください。');if(records.some(a=>a.attemptId===s.attemptId))throw new Error('この試験は開始済みです。続きから再開してください。');const drawing=s.settings?.drawing;if(drawing?.algorithm&&(drawing.studentCode!==s.studentCode||drawing.round!==round))throw new Error('受験履歴が変更されました。表紙から問題を準備し直してください。');if(challenge&&drawing?.algorithm){const used=new Set(this.challengeFor(s.studentCode).flatMap(a=>a.result?.answers?.map(x=>x.id)??a.session?.questionIds??[]));const practiced=new Set(previousQuestionIds(records.filter(a=>!isChallenge(a))));if(s.questionIds.filter(id=>practiced.has(id)).length>Math.floor(s.questionIds.length*.15))throw new Error('練習履歴が変更されました。15%上限を守るため、表紙から問題を準備し直してください。');if(s.questionIds.some(id=>used.has(id)))throw new Error('準備後に履歴が変更されました。問題を準備し直してください。');}const next={...s,round,startedAt:new Date().toISOString(),deadline:Date.now()+s.minutes*60000};this.record(next);localStorage.setItem(ACTIVE,JSON.stringify(next));return next;};return navigator.locks?navigator.locks.request('ipass:start:'+s.studentCode,start):start();}
 record(s){if(s?.startedAt)this.write(mergeAttempts(this.all(),[attemptFromSession(s)]));}
 packet(code,name){return progressPacket(this.all(),code,name);}
 receipts(code){return read('ipass:receipts:v1',[]).filter(r=>r.studentCode===code);}
 saveReceipt(code,receipt,attempts){const records=read('ipass:receipts:v1',[]);records.push({studentCode:code,receiptId:receipt.receiptId,receivedAt:receipt.receivedAt??new Date().toISOString(),attemptIds:attempts.filter(a=>a.result).map(a=>a.attemptId)});localStorage.setItem('ipass:receipts:v1',JSON.stringify(records.slice(-100)));}
}
