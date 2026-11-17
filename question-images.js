const escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function questionImage(q,{displayHeight=q.image.height,deferred=false}={}){
 const {src,width,height,spriteHeight,y}=q.image,primary=`assets/questions/${q.id}.png`;
 // Keep the normal PNG in document flow; only the original sprite needs cropping.
 return `<div class="question-figure"><div class="q-image" data-image-layout="single" style="aspect-ratio:${width}/${displayHeight}"><img data-question-image data-image-source="${escapeHtml(primary)}" data-image-fallback="${escapeHtml(src)}" data-image-height="${height}" data-sprite-height="${spriteHeight}" data-image-y="${y}" data-display-height="${displayHeight}" ${deferred?'data-src':'src'}="${escapeHtml(primary)}" width="${width}" height="${height}" loading="eager" style="top:0" alt="${escapeHtml(q.source)}の問題文・図表・選択肢"></div><p class="image-load-error" role="status" hidden>問題画像を表示できませんでした。通信を確認し、「画像を再読み込み」または「簡易表示」を押してください。</p><div class="question-image-tools"><span>画像が表示されないとき：</span><button type="button" class="secondary" data-image-retry>画像を再読み込み</button><button type="button" class="secondary" data-image-fallback>別形式で表示</button><button type="button" class="secondary" data-image-simple>簡易表示</button></div></div>`;
}

export function installQuestionImages(root,{schedule=setTimeout,cancel=clearTimeout,now=Date.now,Observer=globalThis.MutationObserver,timeout=8000,fetchImage=globalThis.fetch?.bind(globalThis),urls=globalThis.URL}={}){
 const states=new WeakMap(),pending=new Set(),blobs=new Set();
 const isImage=el=>el?.matches?.('img[data-question-image]');
 const status=img=>img.closest('.question-figure').querySelector('.image-load-error');
 function state(img){if(!states.has(img))states.set(img,{retries:0,timer:null,legacy:false,token:0,blob:null,controller:null});return states.get(img);}
 function stop(img){const s=state(img);if(s.timer!==null)cancel(s.timer);s.timer=null;pending.delete(img);}
 function release(img){const s=state(img);s.controller?.abort();s.controller=null;if(s.blob){urls.revokeObjectURL(s.blob);s.blob=null;blobs.delete(img);}}
 function loaded(img){if(state(img).controller)return;stop(img);img.hidden=false;status(img).hidden=true;}
 function watch(img){
  stop(img);if(!img.isConnected)return;
  pending.add(img);state(img).timer=schedule(()=>{
   stop(img);if(!img.isConnected){state(img).token++;release(img);return;}
   if(!state(img).controller&&img.complete&&img.naturalWidth>0){loaded(img);return;}
   failed(img);
  },timeout);
 }
 function request(img,{legacy=false,bust=false,blob=false}={}){
  if(!img.isConnected)return;
  const s=state(img);release(img);s.legacy=legacy;const token=++s.token;
  img.closest('.q-image').dataset.imageLayout=legacy?'sprite':'single';
  if(legacy)img.closest('.question-figure').classList.remove('question-figure-simple');
  img.hidden=false;status(img).hidden=true;
  img.height=Number(legacy?img.dataset.spriteHeight:img.dataset.imageHeight);
  img.style.top=legacy?`-${Number(img.dataset.imageY)/Number(img.dataset.displayHeight)*100}%`:'0px';
  const src=legacy?img.dataset.imageFallback:img.dataset.imageSource;
  delete img.dataset.src;
  watch(img);
  const address=src+(bust?(src.includes('?')?'&':'?')+'image-retry='+now():'');
  if(!blob){img.src=address;return;}
  // A fresh fetch + object URL avoids reusing a broken browser image-cache entry.
  if(!fetchImage||!urls?.createObjectURL){failed(img);return;}
  const controller=new AbortController();s.controller=controller;
  Promise.resolve().then(()=>fetchImage(address,{cache:'reload',signal:controller.signal})).then(response=>{
   if(!response.ok)throw new Error('Image request failed');
   return response.blob();
  }).then(data=>{
   if(token!==s.token||!img.isConnected||controller.signal.aborted)return;
   s.controller=null;s.blob=urls.createObjectURL(data);blobs.add(img);img.src=s.blob;
  }).catch(()=>{if(token===s.token&&img.isConnected&&!controller.signal.aborted)failed(img);});
 }
 function failed(img){
  stop(img);if(!img.isConnected)return;
  const s=state(img);
  if(s.retries===0){s.retries=1;request(img,{bust:true});return;}
  if(s.retries===1){s.retries=2;request(img,{blob:true,bust:true});return;}
  if(s.retries===2){s.retries=3;request(img,{legacy:true,bust:true});return;}
  release(img);s.token++;img.hidden=true;status(img).hidden=false;
 }
 function scan(){
  for(const img of blobs)if(!img.isConnected)release(img);
  for(const img of pending)if(!img.isConnected){stop(img);state(img).token++;release(img);}
  for(const img of root.querySelectorAll('img[data-question-image][src]')){
   if(states.has(img))continue;
   state(img);
   if(img.complete){if(img.naturalWidth>0)loaded(img);else failed(img);}else watch(img);
  }
 }
 root.addEventListener('toggle',event=>{
  if(!event.target.matches?.('details')||!event.target.open)return;
  for(const img of event.target.querySelectorAll('img[data-question-image][data-src]'))request(img);
 },true);
 root.addEventListener('error',event=>{if(isImage(event.target)&&!state(event.target).controller)failed(event.target);},true);
 root.addEventListener('load',event=>{if(isImage(event.target))loaded(event.target);},true);
 root.addEventListener('click',event=>{
  const button=event.target.closest?.('[data-image-retry],button[data-image-fallback],button[data-image-simple]');if(!button)return;
  const img=button.closest('.question-figure').querySelector('img[data-question-image]');
  img.closest('.question-figure').classList.toggle('question-figure-simple',button.hasAttribute('data-image-simple'));
  state(img).retries=button.hasAttribute('data-image-fallback')?3:button.hasAttribute('data-image-simple')?2:0;
  request(img,{legacy:button.hasAttribute('data-image-fallback'),blob:button.hasAttribute('data-image-simple'),bust:true});
 });
 // Images are inserted through innerHTML while changing questions/results.
 // Watch stalled requests too: they may emit neither load nor error.
 if(Observer){const observer=new Observer(scan);observer.observe(root,{childList:true,subtree:true});scan();}
}
