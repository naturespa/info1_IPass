import test from 'node:test';import assert from 'node:assert/strict';
import {grade,remainingSeconds,selectQuestions,normalizeName,validStudent,parseCsv,toCsv,advice} from '../core.js';
const q=[{id:'a',domain:'ストラテジ系',answer:0},{id:'b',domain:'テクノロジ系',answer:3},{id:'c',domain:'テクノロジ系',answer:2}];
test('採点は未解答を0点とし分野の対象外を区別する',()=>{const r=grade(q,{a:0,b:1});assert.equal(r.score,33);assert.equal(r.correct,1);assert.equal(r.byDomain[1].rate,null);assert.equal(r.answers[2].picked,-1);});
test('再開時も同じ締切から残り時間を求める',()=>{assert.equal(remainingSeconds(40000,10000),30);assert.equal(remainingSeconds(40000,45000),0);assert.equal(remainingSeconds(40000,39999),1);});
test('出題は分野を守り重複せず不足時は明示する',()=>{const a=selectQuestions(q,{mode:'practice',domain:'テクノロジ系',count:2},()=>.1);assert.equal(new Set(a.map(x=>x.id)).size,2);assert.ok(a.every(x=>x.domain==='テクノロジ系'));assert.throws(()=>selectQuestions(q,{count:4}));});
test('氏名の空白とCSVの引用符、数式を扱う',()=>{assert.equal(normalizeName(' 岡田　 太郎 '),'岡田 太郎');assert.equal(validStudent('1215','岡田 太郎'),true);assert.equal(validStudent('12','岡田太郎'),false);assert.deepEqual(parseCsv('"1215","岡田 太郎"\r\n"1216","姓,名"'),[['1215','岡田 太郎'],['1216','姓,名']]);assert.ok(toCsv([['=1+1']]).includes("'=1+1"));});
test('満点では到達を肯定して応用学習を示す',()=>{assert.match(advice(grade(q,{a:0,b:3,c:2})),/全問正解/);});
