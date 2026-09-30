import test from 'node:test';import assert from 'node:assert/strict';
import {parseRosterCsv,rosterChanges} from '../roster.js';
test('名簿はA列4桁番号、B列氏名、BOM・ヘッダ有無・先頭ゼロを保持',()=>{assert.deepEqual(parseRosterCsv('\ufeff受験番号,氏名\r\n0001,岡田 太郎\r\n1215,佐藤 花子'),[{code:'0001',name:'岡田 太郎'},{code:'1215',name:'佐藤 花子'}]);assert.equal(parseRosterCsv('１２１５,岡田　太郎')[0].code,'1215');assert.throws(()=>parseRosterCsv('番号,氏名\n1215,岡田 太郎\n1215,佐藤 花子'),/重複/);assert.throws(()=>parseRosterCsv('番号,氏名\n215,岡田 太郎'),/4桁/);assert.throws(()=>parseRosterCsv('番号,氏名\n1215,'),/空欄/);});
test('取込前に追加・氏名変更・除外を確認する',()=>{assert.deepEqual(rosterChanges([{code:'0001',name:'岡田 太郎'},{code:'1216',name:'佐藤 花子'}],[{code:'0001',name:'岡田 次郎'},{code:'1215',name:'鈴木 一郎'}]),{added:1,changed:1,removed:1});});
