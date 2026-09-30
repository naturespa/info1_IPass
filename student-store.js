import {normalizeName} from './core.js';
import {MAX_ATTEMPTS,attemptsFor,attemptFromSession,mergeAttempts,progressPacket} from './progress.js';
const LEDGER='ipass:attempts:v2',ACTIVE='ipass:active:v1';
function read(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
export class StudentStore {
 constructor(){this.error='';try{this.migrate();}catch{this.error='ブラウザ保存を有効にしてください。記録を保存できないため試験を開始できません。';}}
 migrate(){const legacy=read('ipass:history:v1',[]).filter(r=>r?.startedAt).map(r=>({attemptId:r.attemptId,studentCode:r.studentCode,studentName:r.studentName,status:r.abandoned?'abandoned':'completed',title:r.title,settings:r.settings,startedAt:r.startedAt,round:r.round,result:r,finishedAt:r.finishedAt}));const active=read(ACTIVE,null);if(legacy.length||active?.startedAt)this.write(mergeAttempts(this.all(),legacy,active?.startedAt?[attemptFromSession(active)]:[]));}
 all(){return read(LEDGER,[]);}
 write(records){localStorage.setItem(LEDGER,JSON.stringify(records));}
 forStudent(code){return attemptsFor(this.all(),code);}
 checkName(code,name){const existing=this.forStudent(code)[0];if(existing&&normalizeName(existing.studentName)!==normalizeName(name))throw new Error('この受験番号には別の氏名の記録があります。番号・氏名を確認してください。');}
 async start(s){const start=()=>{if(this.error)throw new Error(this.error);this.checkName(s.studentCode,s.studentName);const records=this.forStudent(s.studentCode);if(records.length>=MAX_ATTEMPTS)throw new Error('5回のチャレンジを使い切りました。ステータスで記録を確認してください。');if(records.some(a=>a.status==='running'&&a.attemptId!==s.attemptId))throw new Error('受験中の記録があります。ステータスから再開してください。');if(records.some(a=>a.attemptId===s.attemptId))throw new Error('この試験は開始済みです。続きから再開してください。');const drawing=s.settings?.drawing;if(drawing?.algorithm&&(drawing.studentCode!==s.studentCode||drawing.round!==records.length+1))throw new Error('受験履歴が変更されました。表紙から問題を準備し直してください。');if(drawing?.algorithm){const used=new Set(records.flatMap(a=>a.result?.answers?.map(x=>x.id)??a.session?.questionIds??[]));if(s.questionIds.some(id=>used.has(id)))throw new Error('準備後に履歴が変更されました。問題を準備し直してください。');}const next={...s,round:records.length+1,startedAt:new Date().toISOString(),deadline:Date.now()+s.minutes*60000};this.record(next);localStorage.setItem(ACTIVE,JSON.stringify(next));return next;};return navigator.locks?navigator.locks.request('ipass:start:'+s.studentCode,start):start();}
 record(s){if(s?.startedAt)this.write(mergeAttempts(this.all(),[attemptFromSession(s)]));}
 packet(code,name){return progressPacket(this.all(),code,name);}
}
