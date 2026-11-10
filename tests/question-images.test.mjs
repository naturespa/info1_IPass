import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {questionImage,installQuestionImages} from '../question-images.js';
const load=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url)));
const catalog=load('data/catalog.json'),meta=load('data/question-meta.json');

test('全1500問：独立PNGの寸法・表示範囲・元画像への復旧先が正しい',()=>{
 let count=0;
 for(const exam of catalog.exams)for(const q of load('data/'+exam.id+'.json').questions){
  const {src,width,height}=q.image,displayHeight=meta.questions[q.id]?.displayHeight??height;
  const png=readFileSync(new URL(`../assets/questions/${q.id}.png`,import.meta.url));
  assert.equal(png.subarray(1,4).toString(),'PNG');
  assert.equal(png.readUInt32BE(16),width);assert.equal(png.readUInt32BE(20),height);
  assert.ok(displayHeight>0&&displayHeight<=height);
  const html=questionImage(q,{displayHeight,deferred:true});
  assert.ok(html.includes(`data-src="assets/questions/${q.id}.png"`));
  assert.ok(html.includes(`data-image-fallback="${src}"`));
  assert.ok(html.includes(`aspect-ratio:${width}/${displayHeight}`));
  assert.ok(html.includes('style="top:0"'));
  assert.doesNotMatch(html,/(?<![\w-])src="|loading="lazy"|onerror=/);
  assert.ok(questionImage(q).includes(` src="assets/questions/${q.id}.png"`));count++;
 }
 assert.equal(count,1500);
});

function fixture({deferred=false,complete=false,width=0}={}){
 const events=new Map(),timers=new Map(),notice={hidden:true};let id=0,scan;
 const frame={querySelector:()=>notice},figure={querySelector:()=>img};
 const img={dataset:{imageSource:'assets/questions/test.png',imageFallback:'assets/test.svg',imageHeight:'200',spriteHeight:'2000',imageY:'600',displayHeight:'200',...(deferred?{src:'assets/questions/test.png'}:{})},isConnected:true,hidden:false,src:deferred?'':'assets/questions/test.png',style:{},complete,naturalWidth:width,matches:s=>s==='img[data-question-image]',closest:()=>frame};
 const root={addEventListener:(name,handler)=>events.set(name,handler),querySelectorAll:()=>img.src?[img]:[]};
 class Observer{constructor(fn){scan=fn;}observe(){}}
 installQuestionImages(root,{schedule:fn=>{timers.set(++id,fn);return id;},cancel:key=>timers.delete(key),now:()=>123,Observer});
 return {emit:(name,target)=>events.get(name)({target}),img,notice,timers,scan,
  expire:()=>{const [key,fn]=timers.entries().next().value;timers.delete(key);fn();},
  click:(legacy=false)=>events.get('click')({target:{closest:()=>({closest:()=>figure,hasAttribute:()=>legacy})}})};
}

test('復習を開くまで取得せず、開くと独立PNGを読み込む',()=>{
 const f=fixture({deferred:true}),details={matches:s=>s==='details',open:false,querySelectorAll:()=>f.img.dataset.src?[f.img]:[]};
 f.emit('toggle',details);assert.equal(f.img.src,'');assert.equal(f.timers.size,0);
 details.open=true;f.emit('toggle',details);assert.equal(f.img.src,'assets/questions/test.png');assert.equal(f.img.dataset.src,undefined);
 assert.equal(f.timers.size,1);f.img.src='already-loaded';f.emit('toggle',details);assert.equal(f.img.src,'already-loaded');
});

test('通信エラーは1回自動再試行し、連続失敗後もPNG・原本SVGで復旧できる',()=>{
 const f=fixture();f.emit('error',f.img);assert.equal(f.img.src,'assets/questions/test.png?image-retry=123');
 f.emit('error',f.img);assert.equal(f.timers.size,0);assert.equal(f.notice.hidden,false);assert.equal(f.img.hidden,true);
 f.click(true);assert.equal(f.img.src,'assets/test.svg?image-retry=123');assert.equal(f.img.height,2000);assert.equal(f.img.style.top,'-300%');
 f.emit('load',f.img);assert.equal(f.notice.hidden,true);assert.equal(f.img.hidden,false);assert.equal(f.timers.size,0);
 f.click();assert.equal(f.img.src,'assets/questions/test.png?image-retry=123');assert.equal(f.img.height,200);assert.equal(f.img.style.top,'0px');
});

test('loadもerrorも来ない停止を検知し、再試行後は空白で放置しない',()=>{
 const f=fixture();assert.equal(f.timers.size,1);f.expire();assert.match(f.img.src,/image-retry=/);
 f.expire();assert.equal(f.notice.hidden,false);assert.equal(f.img.hidden,true);assert.equal(f.timers.size,0);
});

test('キャッシュ済み画像・問題移動後のタイマー・遅れて成功した画像を扱う',()=>{
 const cached=fixture({complete:true,width:860});assert.equal(cached.timers.size,0);
 const f=fixture();f.img.isConnected=false;f.scan();assert.equal(f.timers.size,0);
 const g=fixture();g.emit('error',g.img);g.emit('error',g.img);assert.equal(g.notice.hidden,false);
 g.emit('load',g.img);assert.equal(g.notice.hidden,true);assert.equal(g.img.hidden,false);
 const h=fixture();h.img.complete=true;h.img.naturalWidth=860;h.expire();assert.equal(h.timers.size,0);assert.equal(h.notice.hidden,true);
});
