import {issueCorrection,verifyCorrection} from './correction-auth.mjs';
import {normalizeName} from '../core.js';
import {isUuid,isCancelled} from '../progress.js';
import http from 'node:http';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {validateSubmission} from '../submission-validation.js';
import {readRosterFile} from './roster-file.mjs';
import {DatabaseSync} from 'node:sqlite';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {grade,validStudent} from '../core.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),port=Number(process.env.PORT||3000);
const storage=process.env.STORAGE_DIR||path.join(root,'local-server','storage');await mkdir(storage,{recursive:true});
const rosterFile=process.env.ROSTER_CSV_PATH||(process.platform==='win32'?'C:\\cbt\\meibo.csv':path.join(root,'local-server','meibo.csv'));
const db=new DatabaseSync(path.join(storage,'ipass.sqlite'));db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS results (attempt_id TEXT PRIMARY KEY, student_code TEXT NOT NULL, student_name TEXT NOT NULL, finished_at TEXT NOT NULL, result_json TEXT NOT NULL);');
db.exec('CREATE TABLE IF NOT EXISTS submissions (receipt_id TEXT PRIMARY KEY, student_code TEXT NOT NULL, received_at TEXT NOT NULL, packet_json TEXT NOT NULL);');
if(!db.prepare('PRAGMA table_info(submissions)').all().some(c=>c.name==='packet_hash'))db.exec('ALTER TABLE submissions ADD COLUMN packet_hash TEXT');
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS submissions_hash ON submissions(packet_hash); CREATE TABLE IF NOT EXISTS reports (report_id TEXT PRIMARY KEY, report_json TEXT NOT NULL, status TEXT NOT NULL); CREATE TABLE IF NOT EXISTS corrections (correction_id TEXT PRIMARY KEY, token_json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY,value TEXT NOT NULL);`);
if(!db.prepare('SELECT value FROM settings WHERE key=?').get('correction-key'))db.prepare('INSERT INTO settings VALUES (?,?)').run('correction-key',randomBytes(32).toString('hex'));
const correctionKey=()=>db.prepare('SELECT value FROM settings WHERE key=?').get('correction-key').value;
const digest=p=>createHash('sha256').update(JSON.stringify({studentCode:p.studentCode,studentName:normalizeName(p.studentName),attempts:[...p.attempts].sort((a,b)=>a.attemptId.localeCompare(b.attemptId)),reports:[...(p.reports??[])].sort((a,b)=>a.reportId.localeCompare(b.reportId))})).digest('hex');
async function jsonBody(req,max=5*1024*1024){let bytes=0,chunks=[];for await(const c of req){bytes+=c.length;if(bytes>max)throw new Error('ファイルが大きすぎます。');chunks.push(c);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
function checkedReport(r,code){if(!r||!isUuid(r.reportId)||r.studentCode!==code||!validStudent(r.studentCode,r.studentName)||!bank.has(r.questionId)||!isUuid(r.attemptId)||typeof r.kind!=='string'||r.kind.length>100||typeof r.text!=='string'||!r.text.trim()||r.text.length>1000||!Number.isFinite(Date.parse(r.createdAt)))throw new Error('問題報告の形式が不正です。');return r;}
function validateCorrections(p,key=correctionKey()){for(const a of p.attempts)if(isCancelled(a)){const c=verifyCorrection(a.correction??a.result?.correction,key);if(c.attemptId!==a.attemptId||c.studentCode!==a.studentCode||normalizeName(c.studentName)!==normalizeName(a.studentName))throw new Error('修正の対象が一致しません。');}}
const catalog=JSON.parse(await readFile(path.join(root,'data/catalog.json'),'utf8'));const bank=new Map();
for(const e of catalog.exams){const b=JSON.parse(await readFile(path.join(root,'data',e.id+'.json'),'utf8'));for(const q of b.questions)bank.set(q.id,q);}
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp'};
const server=http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');const reply=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
 try{
  const u=new URL(req.url,'http://localhost');const pathname=decodeURIComponent(u.pathname);
  if(pathname.startsWith('/api/admin/')||pathname==='/admin.html'||pathname==='/admin.js'||pathname==='/compare.html'||pathname==='/compare.js'||pathname==='/analytics.html'||pathname==='/analytics.js'){
   const local=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)&&/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(req.headers.host||'');
   if(!local)return reply(403,{error:'管理画面はサーバPCでのみ利用できます。'});
   if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)return reply(403,{error:'Invalid origin'});
  }
  if(['/api/submissions','/api/corrections/verify'].includes(pathname)){
   const origin=req.headers.origin,allowed=origin===`http://${req.headers.host}`||origin==='https://naturespa.github.io';
   if(origin&&!allowed)return reply(403,{error:'この送信元は許可されていません。'});
   if(allowed){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');if(req.headers['access-control-request-private-network']==='true')res.setHeader('Access-Control-Allow-Private-Network','true');}
   if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
   if(req.method!=='POST')return reply(405,{error:'POST required'});
   const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>5*1024*1024)return reply(413,{error:'ファイルが大きすぎます。'});chunks.push(chunk);}
   if(pathname==='/api/corrections/verify'){try{const token=JSON.parse(Buffer.concat(chunks).toString('utf8'));verifyCorrection(token,correctionKey());return reply(200,{ok:true});}catch(e){return reply(400,{error:e.message});}}
   let p,results;try{p=JSON.parse(Buffer.concat(chunks).toString('utf8'));validateCorrections(p);results=validateSubmission(p,bank);if(p.reports!=null&&(!Array.isArray(p.reports)||p.reports.length>10000))throw new Error('報告件数が不正です。');for(const r of p.reports??[])checkedReport(r,p.studentCode);}catch(e){return reply(400,{error:e.message});}
   const packetHash=digest(p),previous=db.prepare('SELECT receipt_id,received_at FROM submissions WHERE packet_hash=?').get(packetHash);if(previous)return reply(200,{ok:true,studentCode:p.studentCode,receiptId:previous.receipt_id,receivedAt:previous.received_at,duplicate:true});
   const receiptId=randomUUID(),receivedAt=new Date().toISOString();
   db.exec('BEGIN');try{db.prepare('INSERT INTO submissions(receipt_id,student_code,received_at,packet_json,packet_hash) VALUES (?,?,?,?,?)').run(receiptId,p.studentCode,receivedAt,JSON.stringify(p),packetHash);for(const r of results){const old=db.prepare('SELECT student_code,student_name,result_json FROM results WHERE attempt_id=?').get(r.attemptId);if(old&&(old.student_code!==r.studentCode||normalizeName(old.student_name)!==normalizeName(r.studentName)))throw new Error('受験IDが他の受験者と重複しています。');if(old){const prior=JSON.parse(old.result_json);if(JSON.stringify(prior.answers.map(a=>[a.id,a.picked]))!==JSON.stringify(r.answers.map(a=>[a.id,a.picked]))||prior.finishedAt!==r.finishedAt||!!prior.abandoned!==!!r.abandoned)throw new Error('同じ受験IDに異なる結果があります。');if(isCancelled(r))db.prepare('UPDATE results SET result_json=? WHERE attempt_id=?').run(JSON.stringify(r),r.attemptId);}else db.prepare('INSERT INTO results VALUES (?,?,?,?,?)').run(r.attemptId,r.studentCode,r.studentName,r.finishedAt,JSON.stringify(r));}for(const report of p.reports??[])db.prepare('INSERT OR IGNORE INTO reports VALUES (?,?,?)').run(report.reportId,JSON.stringify(report),'未確認');db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');return reply(400,{error:e.message});}
   return reply(200,{ok:true,studentCode:p.studentCode,receiptId,receivedAt});
  }
  if(pathname==='/api/admin/corrections'&&req.method==='POST'){
   try{const b=await jsonBody(req,20000),old=db.prepare('SELECT student_code,student_name FROM results WHERE attempt_id=?').get(b.attemptId);if(old&&(old.student_code!==b.studentCode||normalizeName(old.student_name)!==normalizeName(b.studentName)))throw new Error('対象の生徒と受験IDが一致しません。');const token=issueCorrection({app:'info1_IPass',kind:'correction',schemaVersion:1,action:'cancel',correctionId:randomUUID(),studentCode:b.studentCode,studentName:normalizeName(b.studentName),attemptId:b.attemptId,reason:b.reason,issuedAt:new Date().toISOString()},correctionKey());db.prepare('INSERT INTO corrections VALUES (?,?)').run(token.payload.correctionId,JSON.stringify(token));if(old){const r=JSON.parse(db.prepare('SELECT result_json FROM results WHERE attempt_id=?').get(b.attemptId).result_json);db.prepare('UPDATE results SET result_json=? WHERE attempt_id=?').run(JSON.stringify({...r,cancelled:true,correction:token}),b.attemptId);}return reply(200,token);}catch(e){return reply(400,{error:e.message});}
  }
  if(pathname==='/api/admin/reports'&&req.method==='GET')return reply(200,db.prepare('SELECT * FROM reports').all().map(r=>({...JSON.parse(r.report_json),status:r.status})));
  if(pathname==='/api/admin/reports'&&req.method==='POST'){try{const b=await jsonBody(req,20000);if(!isUuid(b.reportId)||!['未確認','確認中','対応済み'].includes(b.status))throw new Error('確認状態が不正です。');const r=db.prepare('UPDATE reports SET status=? WHERE report_id=?').run(b.status,b.reportId);if(!r.changes)throw new Error('報告がありません。');return reply(200,{ok:true});}catch(e){return reply(400,{error:e.message});}}
  if(pathname==='/api/admin/backup'&&req.method==='GET')return reply(200,{app:'info1_IPass',kind:'server-backup',schemaVersion:1,createdAt:new Date().toISOString(),results:db.prepare('SELECT result_json FROM results').all().map(r=>JSON.parse(r.result_json)),submissions:db.prepare('SELECT * FROM submissions').all(),reports:db.prepare('SELECT * FROM reports').all(),corrections:db.prepare('SELECT * FROM corrections').all(),correctionKey:correctionKey()});
  if(pathname==='/api/admin/restore'&&req.method==='POST'){
   try{const b=await jsonBody(req,100*1024*1024);if(b.app!=='info1_IPass'||b.kind!=='server-backup'||b.schemaVersion!==1||!['results','submissions','reports','corrections'].every(k=>Array.isArray(b[k]))||!/^[0-9a-f]{64}$/.test(b.correctionKey))throw new Error('サーババックアップの形式が不正です。');const ids=new Set();for(const r of b.results){if(ids.has(r.attemptId))throw new Error('受験IDが重複しています。');ids.add(r.attemptId);const p={app:'info1_IPass',kind:'progress',schemaVersion:2,studentCode:r.studentCode,studentName:r.studentName,attempts:[{...r,status:r.abandoned?'abandoned':'completed',result:r}]};validateCorrections(p,b.correctionKey);const validated=validateSubmission(p,bank)[0];Object.assign(r,validated);}const receipts=new Set(),hashes=new Set();for(const row of b.submissions){if(!isUuid(row.receipt_id)||receipts.has(row.receipt_id)||!Number.isFinite(Date.parse(row.received_at)))throw new Error('受付履歴が不正です。');receipts.add(row.receipt_id);const p=JSON.parse(row.packet_json);if(row.student_code!==p.studentCode)throw new Error('受付番号が一致しません。');validateCorrections(p,b.correctionKey);validateSubmission(p,bank);if(row.packet_hash){if(row.packet_hash!==digest(p)||hashes.has(row.packet_hash))throw new Error('受付ハッシュが不正です。');hashes.add(row.packet_hash);}}const reports=new Set();for(const row of b.reports){const r=JSON.parse(row.report_json);checkedReport(r,r.studentCode);if(row.report_id!==r.reportId||reports.has(r.reportId)||!['未確認','確認中','対応済み'].includes(row.status))throw new Error('報告データが不正です。');reports.add(r.reportId);}const corrections=new Set();for(const row of b.corrections){const c=verifyCorrection(JSON.parse(row.token_json),b.correctionKey);if(row.correction_id!==c.correctionId||corrections.has(c.correctionId))throw new Error('修正履歴が不正です。');corrections.add(c.correctionId);}
    db.exec('BEGIN');try{for(const table of ['results','submissions','reports','corrections'])db.exec('DELETE FROM '+table);for(const r of b.results)db.prepare('INSERT INTO results VALUES (?,?,?,?,?)').run(r.attemptId,r.studentCode,r.studentName,r.finishedAt,JSON.stringify(r));for(const r of b.submissions)db.prepare('INSERT INTO submissions(receipt_id,student_code,received_at,packet_json,packet_hash) VALUES (?,?,?,?,?)').run(r.receipt_id,r.student_code,r.received_at,r.packet_json,r.packet_hash??null);for(const r of b.reports)db.prepare('INSERT INTO reports VALUES (?,?,?)').run(r.report_id,r.report_json,r.status);for(const r of b.corrections)db.prepare('INSERT INTO corrections VALUES (?,?)').run(r.correction_id,r.token_json);db.prepare('UPDATE settings SET value=? WHERE key=?').run(b.correctionKey,'correction-key');db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return reply(200,{ok:true});
   }catch(e){return reply(400,{error:e.message});}
  }
  if(pathname==='/api/admin/roster-file'&&req.method==='GET'){
   try{const data=await readRosterFile(rosterFile);if(u.searchParams.has('fileHash')&&u.searchParams.get('fileHash')!==data.fileHash)return reply(409,{error:'確認後に meibo.csv が変わりました。名簿を再確認してください。'});return reply(200,data);}catch(e){return reply(400,{error:e.message});}
  }
  if(pathname==='/api/admin/results'&&req.method==='GET'){return reply(200,db.prepare('SELECT result_json FROM results ORDER BY finished_at DESC').all().map(r=>JSON.parse(r.result_json)));}
  if(pathname==='/api/results'&&req.method==='POST'){
   if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)return reply(403,{error:'Invalid origin'});
   const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>512*1024)return reply(413,{error:'Too large'});chunks.push(chunk);}
   let r;try{r=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return reply(400,{error:'Invalid JSON'});}
   if(r.app!=='info1_IPass'||r.schemaVersion!==1||!validStudent(r.studentCode,r.studentName)||!/^[0-9a-f-]{36}$/i.test(r.attemptId)||!Array.isArray(r.answers)||r.answers.length<1||r.answers.length>1500||typeof r.title!=='string'||r.title.length>200||!Number.isFinite(Date.parse(r.finishedAt)))return reply(400,{error:'Invalid result'});
   const qs=[],picked={};for(const a of r.answers){if(!bank.has(a.id)||qs.some(q=>q.id===a.id)||!Number.isInteger(a.picked)||a.picked< -1||a.picked>3)return reply(400,{error:'Invalid answer'});qs.push(bank.get(a.id));if(a.picked>=0)picked[a.id]=a.picked;}
   const result={...r,...grade(qs,picked)};
   db.prepare('INSERT OR IGNORE INTO results VALUES (?,?,?,?,?)').run(r.attemptId,r.studentCode,r.studentName,r.finishedAt,JSON.stringify(result));return reply(200,{ok:true,attemptId:r.attemptId});
  }
  if(pathname.startsWith('/api/'))return reply(404,{error:'Not found'});
  if(req.method!=='GET'&&req.method!=='HEAD')return reply(405,{error:'GET required'});
  const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));const relative=path.relative(root,file);
  if(relative.startsWith('..')||path.isAbsolute(relative)||relative.split(path.sep).some(p=>p.startsWith('.'))||relative.startsWith('local-server')||relative.startsWith('scripts')||relative.startsWith('tests'))return reply(403,{error:'Forbidden'});
  const ext=path.extname(file);if(!types[ext])return reply(403,{error:'Forbidden'});
  const content=await readFile(file);res.writeHead(200,{'Content-Type':types[ext],'Cache-Control':ext==='.html'?'no-cache':'public, max-age=300'});res.end(req.method==='HEAD'?undefined:content);
 }catch(e){if(e.code==='ENOENT')return reply(404,{error:'Not found'});console.error(e.name,e.message);reply(500,{error:'Server error'});}
});
server.listen(port,'0.0.0.0',()=>console.log(`確認用画面 http://localhost:${server.address().port}/\n管理画面 http://localhost:${server.address().port}/admin.html\n提出先は http://学校サーバIP:${port}/api/submissions です。受験管理はブラウザ側で行います。`));
