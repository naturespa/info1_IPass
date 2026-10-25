import {normalizeName,validStudent} from './core.js';
import {isUuid,isCancelled,isChallenge,comparisonKey} from './progress.js';
export function applyIdentity(record,identity){
 if(!identity)return record;
 return {...record,studentCode:identity.studentCode,studentName:identity.studentName,identityOriginal:{studentCode:record.identityOriginal?.studentCode??record.studentCode,studentName:record.identityOriginal?.studentName??record.studentName},identityChanges:identity.history};
}
export function makeIdentityChange(records,request,previous=null,now=new Date().toISOString()){
 const record=records.find(r=>r.attemptId===request.attemptId);
 if(!record)throw new Error('対象の受験記録がありません。');
 if(!isUuid(request.attemptId))throw new Error('受験IDが不正です。');
 if(record.studentCode!==request.expectedCode||normalizeName(record.studentName)!==normalizeName(request.expectedName))throw new Error('対象の番号・氏名が変わっています。再読込してください。');
 const code=String(request.studentCode??'').trim(),name=normalizeName(String(request.studentName??'')),reason=String(request.reason??'').trim();
 if(!/^[123][1-9][0-9]{2}$/.test(code)||Number(code.slice(2))<1||!validStudent(code,name))throw new Error('番号は学年1〜3・組1〜9・出席番号01〜99、氏名は「姓 名」で入力してください。');
 if(!reason||reason.length>500)throw new Error('修正理由を1〜500文字で入力してください。');
 if(code===record.studentCode&&name===normalizeName(record.studentName))throw new Error('変更がありません。');
 const conflicts=records.filter(r=>r.attemptId!==record.attemptId&&r.studentCode===code&&!isCancelled(r)&&!isCancelled(record)&&isChallenge(r)===isChallenge(record)&&r.round===record.round&&comparisonKey(r)===comparisonKey(record));
 if(code!==record.studentCode&&conflicts.length)throw new Error('修正先に同じ出題条件・実施回の記録があります。既存記録は上書きしません。');
 return {attemptId:record.attemptId,studentCode:code,studentName:name,history:[...(previous?.history??record.identityChanges??[]),{fromCode:record.studentCode,fromName:record.studentName,toCode:code,toName:name,reason,changedAt:now}]};
}
