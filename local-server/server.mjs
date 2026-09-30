import http from 'node:http';
import {randomUUID} from 'node:crypto';
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
const catalog=JSON.parse(await readFile(path.join(root,'data/catalog.json'),'utf8'));const bank=new Map();
for(const e of catalog.exams){const b=JSON.parse(await readFile(path.join(root,'data',e.id+'.json'),'utf8'));for(const q of b.questions)bank.set(q.id,q);}
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp'};
const server=http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');const reply=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
 try{
  const u=new URL(req.url,'http://localhost');const pathname=decodeURIComponent(u.pathname);
  if(pathname.startsWith('/api/admin/')||pathname==='/admin.html'||pathname==='/admin.js'||pathname==='/compare.html'||pathname==='/compare.js'){
   const local=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)&&/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(req.headers.host||'');
   if(!local)return reply(403,{error:'管理画面はサーバPCでのみ利用できます。'});
   if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)return reply(403,{error:'Invalid origin'});
  }
  if(pathname==='/api/submissions'){
   const origin=req.headers.origin,allowed=origin===`http://${req.headers.host}`||origin==='https://naturespa.github.io';
   if(origin&&!allowed)return reply(403,{error:'この送信元は許可されていません。'});
   if(allowed){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');if(req.headers['access-control-request-private-network']==='true')res.setHeader('Access-Control-Allow-Private-Network','true');}
   if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
   if(req.method!=='POST')return reply(405,{error:'POST required'});
   const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>5*1024*1024)return reply(413,{error:'ファイルが大きすぎます。'});chunks.push(chunk);}
   let p,results;try{p=JSON.parse(Buffer.concat(chunks).toString('utf8'));results=validateSubmission(p,bank);}catch(e){return reply(400,{error:e.message});}
   const receiptId=randomUUID(),receivedAt=new Date().toISOString();
   db.exec('BEGIN');try{db.prepare('INSERT INTO submissions VALUES (?,?,?,?)').run(receiptId,p.studentCode,receivedAt,JSON.stringify(p));for(const r of results){const old=db.prepare('SELECT student_code,student_name FROM results WHERE attempt_id=?').get(r.attemptId);if(old&&(old.student_code!==r.studentCode||old.student_name!==r.studentName))throw new Error('受験IDが他の受験者と重複しています。');db.prepare('INSERT OR IGNORE INTO results VALUES (?,?,?,?,?)').run(r.attemptId,r.studentCode,r.studentName,r.finishedAt,JSON.stringify(r));}db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');return reply(400,{error:e.message});}
   return reply(200,{ok:true,studentCode:p.studentCode,receiptId,receivedAt});
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
server.listen(port,'0.0.0.0',()=>console.log(`確認用画面 http://localhost:${port}/\n管理画面 http://localhost:${port}/admin.html\n提出先は http://学校サーバIP:${port}/api/submissions です。受験管理はブラウザ側で行います。`));
