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

function fixture({deferred=false,complete=false,width=0,fetchImage=null}={}){
 const events=new Map(),timers=new Map(),notice={hidden:true},classes=new Set(),revoked=[];let id=0,scan;
 const frame={dataset:{}},figure={querySelector:s=>s==='.image-load-error'?notice:img,classList:{toggle:(c,on)=>on?classes.add(c):classes.delete(c),remove:c=>classes.delete(c)}};
 const img={dataset:{imageSource:'assets/questions/test.png',imageFallback:'assets/test.svg',imageHeight:'200',spriteHeight:'2000',imageY:'600',displayHeight:'200',...(deferred?{src:'assets/questions/test.png'}:{})},isConnected:true,hidden:false,src:deferred?'':'assets/questions/test.png',style:{},complete,naturalWidth:width,matches:s=>s==='img[data-question-image]',closest:s=>s==='.q-image'?frame:figure};
 const root={addEventListener:(name,handler)=>events.set(name,handler),querySelectorAll:()=>img.src?[img]:[]};
 class Observer{constructor(fn){scan=fn;}observe(){}}
 installQuestionImages(root,{schedule:fn=>{timers.set(++id,fn);return id;},cancel:key=>timers.delete(key),now:()=>123,Observer,fetchImage,urls:{createObjectURL:()=> 'blob:test',revokeObjectURL:url=>revoked.push(url)}});
 return {emit:(name,target)=>events.get(name)({target}),img,notice,timers,scan,frame,classes,revoked,
  expire:()=>{const [key,fn]=timers.entries().next().value;timers.delete(key);fn();},
  click:(mode='retry')=>events.get('click')({target:{closest:()=>({closest:()=>figure,hasAttribute:attr=>attr===`data-image-${mode}`})}})};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('復習を開くまで取得せず、開くと独立PNGを読み込む',()=>{
 const f=fixture({deferred:true}),details={matches:s=>s==='details',open:false,querySelectorAll:()=>f.img.dataset.src?[f.img]:[]};
 f.emit('toggle',details);assert.equal(f.img.src,'');assert.equal(f.timers.size,0);
 details.open=true;f.emit('toggle',details);assert.equal(f.img.src,'assets/questions/test.png');assert.equal(f.img.dataset.src,undefined);
 assert.equal(f.timers.size,1);f.img.src='already-loaded';f.emit('toggle',details);assert.equal(f.img.src,'already-loaded');
});

test('通信失敗は自動再試行し、取得APIが使えなくても原本へ自動切替',()=>{
 const f=fixture();f.emit('error',f.img);assert.equal(f.img.src,'assets/questions/test.png?image-retry=123');
 f.emit('error',f.img);assert.equal(f.img.src,'assets/test.svg?image-retry=123');assert.equal(f.img.height,2000);assert.equal(f.img.style.top,'-300%');assert.equal(f.frame.dataset.imageLayout,'sprite');
 f.emit('error',f.img);assert.equal(f.timers.size,0);assert.equal(f.notice.hidden,false);assert.equal(f.img.hidden,true);
 f.click('fallback');assert.equal(f.img.src,'assets/test.svg?image-retry=123');
 f.emit('load',f.img);assert.equal(f.notice.hidden,true);assert.equal(f.img.hidden,false);assert.equal(f.timers.size,0);
 f.click();assert.equal(f.img.src,'assets/questions/test.png?image-retry=123');assert.equal(f.img.height,200);assert.equal(f.img.style.top,'0px');assert.equal(f.frame.dataset.imageLayout,'single');
});

test('loadもerrorも来ない停止を検知し、原本も失敗したら枠の外へエラーを表示',()=>{
 const f=fixture();assert.equal(f.timers.size,1);f.expire();assert.match(f.img.src,/image-retry=/);
 f.expire();assert.match(f.img.src,/test.svg/);f.expire();assert.equal(f.notice.hidden,false);assert.equal(f.img.hidden,true);assert.equal(f.timers.size,0);
});

test('キャッシュ済み画像・問題移動後のタイマー・遅れて成功した画像を扱う',()=>{
 const cached=fixture({complete:true,width:860});assert.equal(cached.timers.size,0);
 const f=fixture();f.img.isConnected=false;f.scan();assert.equal(f.timers.size,0);
 const g=fixture();g.emit('error',g.img);g.emit('error',g.img);g.emit('error',g.img);assert.equal(g.notice.hidden,false);
 g.emit('load',g.img);assert.equal(g.notice.hidden,true);assert.equal(g.img.hidden,false);
 const h=fixture();h.img.complete=true;h.img.naturalWidth=860;h.expire();assert.equal(h.timers.size,0);assert.equal(h.notice.hidden,true);
});

test('PNG連続失敗時はキャッシュを更新して取得し、Blob画像で復旧・問題移動時は解放',async()=>{
 const calls=[];const f=fixture({fetchImage:async(url,options)=>{calls.push({url,options});return {ok:true,blob:async()=>new Blob(['png'])};}});
 f.emit('error',f.img);f.emit('error',f.img);await flush();assert.equal(f.img.src,'blob:test');assert.equal(calls[0].options.cache,'reload');
 f.emit('load',f.img);assert.equal(f.timers.size,0);assert.equal(f.notice.hidden,true);
 f.img.isConnected=false;f.scan();assert.deepEqual(f.revoked,['blob:test']);
});

test('簡易表示は同じ画面で全画像を表示し、途中の問題移動や再要求で古い応答を捨てる',async()=>{
 let resolve;const f=fixture({fetchImage:()=>new Promise(r=>resolve=r)});
 f.click('simple');assert.equal(f.classes.has('question-figure-simple'),true);await flush();
 f.click();assert.equal(f.classes.has('question-figure-simple'),false);
 resolve({ok:true,blob:async()=>new Blob(['old'])});await flush();assert.match(f.img.src,/test.png/);assert.notEqual(f.img.src,'blob:test');
});

test('fetch停止・HTTPエラー・Blob画像のデコード失敗は原本へ進む',async()=>{
 const f=fixture({fetchImage:()=>new Promise(()=>{})});f.click('simple');await flush();f.expire();assert.match(f.img.src,/test.svg/);assert.equal(f.classes.has('question-figure-simple'),false);
 const g=fixture({fetchImage:async()=>({ok:false})});g.click('simple');await flush();assert.match(g.img.src,/test.svg/);
 const h=fixture({fetchImage:async()=>({ok:true,blob:async()=>new Blob(['bad'])})});h.click('simple');await flush();assert.equal(h.img.src,'blob:test');h.emit('error',h.img);assert.match(h.img.src,/test.svg/);assert.deepEqual(h.revoked,['blob:test']);
});

test('古い成功イベントで取得中の監視を解除しない',async()=>{
 const f=fixture({complete:true,width:860,fetchImage:()=>new Promise(()=>{})});f.click('simple');await flush();f.emit('load',f.img);assert.equal(f.timers.size,1);f.expire();assert.match(f.img.src,/test.svg/);
});
