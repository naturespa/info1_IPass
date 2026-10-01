import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {parseRosterCsv} from '../roster.js';
export async function readRosterFile(filename){
 let buffer;try{buffer=await readFile(filename);}catch(e){if(e.code==='ENOENT')throw new Error('名簿CSVが見つかりません。 '+filename+' を確認してください。');throw e;}
 if(buffer.length>1024*1024)throw new Error('名簿CSVは1MB以内にしてください。');
 let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(buffer);}catch{text=new TextDecoder('shift_jis',{fatal:true}).decode(buffer);}
 return {filename:path.basename(filename),fileHash:createHash('sha256').update(buffer).digest('hex'),rows:parseRosterCsv(text)};
}
