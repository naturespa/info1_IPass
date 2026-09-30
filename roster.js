import {parseCsv,normalizeName} from './core.js';
export function parseRosterCsv(text){
 const fields=parseCsv(text.replace(/^\ufeff/,''));if(!fields.length)throw new Error('名簿CSVにデータがありません。');
 const header=fields[0].map(v=>v.normalize('NFKC').trim()),first=/^\d{4}$/.test(header[0]),rows=first?fields:fields.slice(1);
 if(!first&&(!/^(受験番号|生徒番号|4桁番号|番号)$/.test(header[0])||!/^(氏名|名前|生徒氏名)$/.test(header[1])))throw new Error('名簿はA列「受験番号」、B列「氏名」のCSVにしてください。');
 const seen=new Set(),result=rows.map((r,i)=>{const code=String(r[0]??'').normalize('NFKC').trim(),name=normalizeName(r[1]??'');if(!/^\d{4}$/.test(code)||!name||name.length>60)throw new Error(`名簿の${i+(first?1:2)}行目を確認してください。番号は4桁、氏名は空欄不可です。`);if(seen.has(code))throw new Error(`番号${code}が重複しています。`);seen.add(code);return {code,name};});
 if(!result.length||result.length>5000)throw new Error('名簿は1〜5,000名にしてください。');return result;
}
export function rosterChanges(previous,next){const old=new Map(previous.map(r=>[r.code,r.name])),current=new Map(next.map(r=>[r.code,r.name]));return {added:next.filter(r=>!old.has(r.code)).length,changed:next.filter(r=>old.has(r.code)&&old.get(r.code)!==r.name).length,removed:previous.filter(r=>!current.has(r.code)).length};}
