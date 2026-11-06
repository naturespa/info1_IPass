import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {questionImage,installQuestionImages} from '../question-images.js';
const load=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url)));
const catalog=load('data/catalog.json'),meta=load('data/question-meta.json');

test('全1500問：切り出し範囲・表示高さ・画像の寸法が一致し、復習画像は開くまで取得しない',()=>{
 let count=0;const sprites=new Map();
 for(const exam of catalog.exams)for(const q of load('data/'+exam.id+'.json').questions){
  const {src,width,height,y,spriteHeight}=q.image;
  if(!sprites.has(src))sprites.set(src,readFileSync(new URL('../'+src,import.meta.url),'utf8'));
  assert.match(sprites.get(src),new RegExp(`width="${width}" height="${spriteHeight}"`));
  const displayHeight=meta.questions[q.id]?.displayHeight??height;
  assert.ok(displayHeight>0&&y+displayHeight<=spriteHeight);
  const html=questionImage(q,{displayHeight,deferred:true});
  assert.ok(html.includes(`width="${width}" height="${spriteHeight}"`));
  assert.ok(html.includes(`aspect-ratio:${width}/${displayHeight}`));
  assert.ok(html.includes(`top:-${y/displayHeight*100}%`));
  assert.ok(html.includes(`data-src="${src}"`));
  assert.doesNotMatch(html,/(?<![\w-])src="|loading="lazy"|onerror=/);
  assert.ok(questionImage(q).includes(` src="${src}"`));count++;
 }
 assert.equal(count,1500);assert.equal(sprites.size,150);
});

function fixture(){
 const events=new Map(),scheduled=[],notice={hidden:true};
 const root={addEventListener:(name,handler)=>events.set(name,handler)};
 const frame={querySelector:selector=>selector==='.image-load-error'?notice:img};
 const img={dataset:{imageSource:'assets/test.svg',src:'assets/test.svg'},isConnected:true,hidden:false,src:'',matches:s=>s==='img[data-question-image]',closest:()=>frame};
 installQuestionImages(root,{schedule:fn=>scheduled.push(fn),now:()=>123});
 return {emit:(name,target)=>events.get(name)({target}),scheduled,img,notice,frame};
}

test('復習を開くと画面外にずらした画像も取得し、閉じた項目は取得しない',()=>{
 const f=fixture(),details={matches:s=>s==='details',open:false,querySelectorAll:()=>f.img.dataset.src?[f.img]:[]};
 f.emit('toggle',details);assert.equal(f.img.src,'');
 details.open=true;f.emit('toggle',details);assert.equal(f.img.src,'assets/test.svg');assert.equal(f.img.dataset.src,undefined);
 f.img.src='already-loaded';f.emit('toggle',details);assert.equal(f.img.src,'already-loaded');
});

test('一時的な画像エラーは1回再試行し、連続失敗後も手動で復旧できる',()=>{
 const f=fixture();f.emit('error',f.img);assert.equal(f.scheduled.length,1);f.scheduled.shift()();
 assert.equal(f.img.src,'assets/test.svg?image-retry=123');
 f.emit('error',f.img);assert.equal(f.scheduled.length,0);assert.equal(f.notice.hidden,false);assert.equal(f.img.hidden,true);
 const button={closest:()=>f.frame};f.emit('click',{closest:()=>button});assert.equal(f.img.hidden,false);assert.equal(f.notice.hidden,true);
 f.emit('load',f.img);assert.equal(f.notice.hidden,true);
 f.emit('error',f.img);f.img.isConnected=false;f.img.src='unchanged';f.scheduled.shift()();assert.equal(f.img.src,'unchanged');
});
