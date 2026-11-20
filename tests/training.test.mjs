import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {StudentStore} from '../student-store.js';
import {mergeAttempts,progressPacket,comparisonKey} from '../progress.js';
import {studentComparison,submissionOverview} from '../teacher-model.js';
import {reviewPlan} from '../review.js';
import {drawQuestions} from '../draw.js';
import {DOMAINS,grade} from '../core.js';
import {validateSubmission} from '../submission-validation.js';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,bank=DOMAINS.flatMap((domain,d)=>Array.from({length:100},(_,i)=>({id:`q${d}-${i}`,domain,answer:0})));
const base={studentCode:'1215',studentName:'岡田 太郎',title:'練習',minutes:45,questionIds:bank.slice(0,2).map(q=>q.id),answers:{},flags:{},index:0};
const result=(n,mode='school',score=0)=>({...base,app:'info1_IPass',schemaVersion:1,attemptId:id(n),round:n,settings:{mode,count:75,minutes:45,domain:'all'},startedAt:`2026-09-30T00:${String(n).padStart(2,'0')}:00Z`,finishedAt:'2026-09-30T01:00:00Z',...grade(bank.slice(0,2),score?{'q0-0':0}:{}),score});
test('練習は6回以上可能、本チャレンジは別カウント5回、終了後も練習可能',async()=>{
 const mem=new Map();globalThis.localStorage={getItem:k=>mem.get(k)||null,setItem:(k,v)=>mem.set(k,v)};Object.defineProperty(globalThis,'navigator',{value:{},configurable:true});const store=new StudentStore();let n=0;
 for(const mode of [...Array(7).fill('practice'),...Array(5).fill('school'),'practice']){const s=await store.start({...base,attemptId:id(++n),settings:{mode}});assert.equal(s.round,mode==='school'?n-7:n===13?8:n);s.result={...result(n,mode),round:s.round};store.record(s);}
 assert.equal(store.challengeFor('1215').length,5);assert.equal(store.forStudent('1215').length,13);await assert.rejects(()=>store.start({...base,attemptId:id(100),settings:{mode:'school'}}),/5回/);
});
test('旧混在履歴は別々に移行し、移行後の部分履歴は回数を維持する',()=>{const old=['practice','school','practice','school'].map((mode,i)=>({...result(i+1,mode),status:'completed',result:result(i+1,mode)})),merged=mergeAttempts(old);assert.deepEqual(merged.map(r=>r.round),[1,1,2,2]);assert.equal(mergeAttempts([merged[3]])[0].round,2);});
async function schoolBank(){
 const load=async name=>JSON.parse(await readFile(new URL('../data/'+name+'.json',import.meta.url),'utf8'));
 const catalog=await load('catalog');
 return (await Promise.all(catalog.exams.map(e=>load(e.id)))).flatMap(e=>e.questions);
}
const school={mode:'school',count:75,domain:'all',minutes:45};
const drawOptions={studentCode:base.studentCode,round:1,seed:'00000001000000020000000300000004'};
function practiceRecord(questions){
 return {...result(90,'practice'),kind:'practice',round:1,status:'completed',
  result:{...result(90,'practice'),round:1,...grade(questions,{})}};
}
function checkSchoolQuestions(questions){
 assert.equal(new Set(questions.map(q=>q.id)).size,75);
 const scored=grade(questions,{});
 assert.deepEqual(scored.byDomain.map(d=>d.total),[26,15,34]);
 assert.deepEqual(scored.byAspect.map(a=>a.total),[30,45]);
}

test('通常は各回5問・練習との重複は11問以内、練習の再出題は可能',async()=>{
 const bank=await schoolBank(),practiced=bank.filter((q,i)=>i%3===0);
 const records=[practiceRecord(practiced)];
 const {questions,drawing}=drawQuestions(bank,school,{...drawOptions,records});
 checkSchoolQuestions(questions);
 assert.equal(drawing.yearAllocation,'fixed');
 assert.equal(drawing.targetPracticeOverlap,11);
 assert.equal(drawing.maxPracticeOverlap,11);
 const seen=new Set(practiced.map(q=>q.id));
 assert.ok(questions.filter(q=>seen.has(q.id)).length<=11);
 assert.equal(drawQuestions(bank,{mode:'practice',count:10,domain:'all'},{...drawOptions,records}).questions.length,10);
});

test('年度別練習を3回分終えても、出題回を調整して未練習問題で受験できる',async()=>{
 const bank=await schoolBank(),practiced=bank.slice(0,300);
 const {questions,drawing}=drawQuestions(bank,school,{...drawOptions,records:[practiceRecord(practiced)]});
 checkSchoolQuestions(questions);
 assert.equal(drawing.yearAllocation,'flexible');
 assert.deepEqual(drawing.practiceOverlapQuestionIds,[]);
 assert.equal(drawing.maxPracticeOverlap,11);
});

test('未練習の候補が63問のときは必要な12問だけ練習と重複する',async()=>{
 const bank=await schoolBank();
 const fresh=new Set(drawQuestions(bank,school,drawOptions).questions.slice(0,63).map(q=>q.id));
 const records=[practiceRecord(bank.filter(q=>!fresh.has(q.id)))];
 const {questions,drawing}=drawQuestions(bank,school,{...drawOptions,records});
 checkSchoolQuestions(questions);
 assert.equal(drawing.yearAllocation,'flexible');
 assert.equal(drawing.practiceOverlapQuestionIds.length,12);
 assert.equal(drawing.maxPracticeOverlap,12);
 assert.equal(questions.filter(q=>fresh.has(q.id)).length,63);
});

test('全問を練習していても保存済み成績・回数を維持し、5回まで出題と開始ができる',async()=>{
 const bank=await schoolBank(),mem=new Map();
 globalThis.localStorage={getItem:key=>mem.get(key)??null,setItem:(key,value)=>mem.set(key,value)};
 Object.defineProperty(globalThis,'navigator',{value:{},configurable:true});
 const store=new StudentStore();
 const previous=drawQuestions(bank,school,drawOptions).questions;
 const priorResult={...result(1),...grade(previous,{[previous[0].id]:previous[0].answer})};
 store.write(mergeAttempts([practiceRecord(bank),{...priorResult,kind:'challenge',status:'completed',result:priorResult}]));
 const before=store.all();
 const used=new Set(previous.map(q=>q.id));
 for(let round=2;round<=5;round++){
  const currentStore=new StudentStore();
  assert.equal(currentStore.nextRound(base.studentCode,school),round);
  const {questions,drawing}=drawQuestions(bank,school,{...drawOptions,round,records:currentStore.forStudent(base.studentCode)});
  checkSchoolQuestions(questions);
  assert.equal(drawing.practiceOverlapQuestionIds.length,75);
  assert.equal(drawing.maxPracticeOverlap,75);
  assert.equal(questions.some(q=>used.has(q.id)),false);
  questions.forEach(q=>used.add(q.id));
  const session=await currentStore.start({...base,attemptId:id(round),settings:{...school,drawing},questionIds:questions.map(q=>q.id)});
  assert.equal(session.round,round);
  currentStore.record({...session,result:{...result(round),...grade(questions,{})}});
 }
 assert.equal(used.size,375);
 assert.equal(store.nextRound(base.studentCode,school),6);
 const after=store.all();
 assert.deepEqual(before.map(r=>after.find(a=>a.attemptId===r.attemptId)),before);
});

test('開始前に練習履歴が変わったときは再準備を促し、受験回数を消費しない',async()=>{
 const bank=await schoolBank(),mem=new Map();
 globalThis.localStorage={getItem:key=>mem.get(key)??null,setItem:(key,value)=>mem.set(key,value)};
 Object.defineProperty(globalThis,'navigator',{value:{},configurable:true});
 const store=new StudentStore();
 const {questions,drawing}=drawQuestions(bank,school,drawOptions);
 const session={...base,attemptId:id(1),settings:{...school,drawing},questionIds:questions.map(q=>q.id)};
 store.write(mergeAttempts([practiceRecord(questions.slice(0,1))]));
 await assert.rejects(()=>store.start(session),/練習履歴が変更されました/);
 assert.equal(store.nextRound(base.studentCode,school),1);
});

test('提出時、練習1回と本チャレンジ1回は重複回数ではない',()=>{const attempts=['practice','school'].map((mode,i)=>({attemptId:id(i+1),round:1,status:'completed',startedAt:result(i+1,mode).startedAt,studentCode:base.studentCode,studentName:base.studentName,settings:{mode},result:{...result(i+1,mode),round:1}}));assert.equal(validateSubmission(progressPacket(attempts,base.studentCode,base.studentName),new Map(bank.map(q=>[q.id,q]))).length,2);});
test('未提出は名簿と提出結果で判定、氏名不一致・練習だけを区別する',()=>{const names=['岡田 太郎','佐藤 花子','鈴木 次郎','山田 一郎'],roster=names.map((name,i)=>({code:String(1215+i),name})),records=[result(1),{...result(2),studentCode:'1217',studentName:'別の 人'},{...result(3,'practice'),studentCode:'1218',studentName:names[3]}],rows=submissionOverview(roster,records);assert.deepEqual(rows.map(r=>r.missing),[false,true,true,true]);assert.deepEqual(rows.map(r=>r.status),['提出済み','未提出','氏名不一致・要確認','練習のみ提出']);});
test('比較は練習・中断を除外、異なる条件を混ぜない',()=>{const a=result(1,'school',20),b=result(2,'school',60),c={...result(3,'school',90),settings:{...a.settings,minutes:40}},d={...result(4,'school',0),abandoned:true},e=result(5,'practice',100),r=studentComparison([a,b,c,d,e],base.studentCode,base.studentName,comparisonKey(a));assert.equal(r.complete.length,3);assert.equal(r.selected.length,2);assert.equal(r.gain,40);assert.equal(r.best,60);assert.equal(r.practice.length,1);assert.equal(r.abandoned,1);});
test('復習は誤答の多い単元、未解答、法制度注意を示し正解問題は除く',()=>{const r={answers:[{id:'a',domain:DOMAINS[0],picked:-1,correct:false},{id:'b',domain:DOMAINS[0],picked:1,correct:false},{id:'c',domain:DOMAINS[0],picked:0,correct:true}]},m={questions:Object.fromEntries(['a','b','c'].map(id=>[id,{topicId:'law',topic:'法務',keywords:['著作権'],timeSensitive:true}]))},p=reviewPlan(r,m);assert.equal(p[0].wrong,2);assert.equal(p[0].unanswered,1);assert.equal(p[0].total,3);assert.deepEqual(p[0].ids,['a','b']);assert.equal(p[0].timeSensitive,true);assert.match(p[0].steps[1],/現行/);assert.deepEqual(reviewPlan({answers:r.answers.map(a=>({...a,correct:true}))},m),[]);});
test('点検データ1500問と重点目視36問、案内非表示7問を整合確認',async()=>{const load=async f=>JSON.parse(await readFile(new URL('../'+f,import.meta.url),'utf8')),meta=await load('data/question-meta.json'),report=await load('data/question-audit.json'),catalog=await load('data/catalog.json'),all=(await Promise.all(catalog.exams.map(e=>load('data/'+e.id+'.json')))).flatMap(e=>e.questions);assert.equal(Object.keys(meta.questions).length,1500);assert.equal(report.officialAnswerKeysMatched,1500);assert.equal(report.manualReview.questionIds.length,36);assert.equal(report.referenceImagesDecoded,85);let crops=0;for(const q of all){const h=meta.questions[q.id];assert.ok(h.topicId&&h.topic&&h.topicConfidence);if(h.displayHeight){crops++;assert.ok(h.displayHeight>0&&h.displayHeight<q.image.height);assert.match(h.displayNote,/問題文/);}}assert.equal(crops,7);});
