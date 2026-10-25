import test from 'node:test';
import assert from 'node:assert/strict';
import {matchesScope,scopeLabel} from '../grade-scope.js';
import {makeIdentityChange,applyIdentity} from '../identity-model.js';
const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('学年・クラスの境界と全学年、教員番号を分離する',()=>{
 const codes=['1101','2101','2801','3101','3801','0001'];
 assert.deepEqual(codes.filter(c=>matchesScope(c,{group:'1'})),['1101']);
 assert.deepEqual(codes.filter(c=>matchesScope(c,{group:'23'})),['2101','2801','3101','3801']);
 assert.deepEqual(codes.filter(c=>matchesScope(c,{group:'23',grade:'3',classCode:'38'})),['3801']);
 assert.equal(codes.filter(c=>matchesScope(c,{group:'all'})).length,6);
 assert.equal(scopeLabel({group:'23',grade:'3',classCode:'38'}),'3年 ／ 3年8組');
});
const record={attemptId:id(1),studentCode:'1101',studentName:'岡田 太郎',round:1,settings:{mode:'school'},score:80,answers:[{id:'q',picked:1}],finishedAt:'2026-10-01T00:00:00Z'};
const request={attemptId:id(1),expectedCode:'1101',expectedName:'岡田 太郎',studentCode:'3802',studentName:'山田　花子',reason:'番号と氏名の入力誤り'};
test('本人情報修正は元答案・得点を保持し、再修正も履歴に追記する',()=>{
 const original=structuredClone(record),change=makeIdentityChange([record],request),out=applyIdentity(record,change);
 assert.deepEqual(record,original);assert.equal(out.studentCode,'3802');assert.equal(out.studentName,'山田 花子');
 assert.deepEqual(out.answers,record.answers);assert.equal(out.score,80);assert.equal(out.finishedAt,record.finishedAt);
 assert.equal(out.identityOriginal.studentCode,'1101');
 const next=makeIdentityChange([out],{...request,expectedCode:'3802',expectedName:'山田 花子',studentCode:'3803'},change);
 assert.equal(next.history.length,2);assert.equal(applyIdentity(out,next).identityOriginal.studentCode,'1101');
});
test('修正先の重複・古い本人情報・理由なし・不正な番号を拒否する',()=>{
 assert.throws(()=>makeIdentityChange([record,{...record,attemptId:id(2),studentCode:'3802'}],request),/上書き/);
 assert.throws(()=>makeIdentityChange([record],{...request,expectedCode:'1102'}),/再読込/);
 assert.throws(()=>makeIdentityChange([record],{...request,reason:''}),/理由/);
 assert.throws(()=>makeIdentityChange([record],{...request,studentCode:'3800'}),/番号/);
});
