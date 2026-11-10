const escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function questionImage(q,{displayHeight=q.image.height,deferred=false}={}){
 const {src,width,height,spriteHeight,y}=q.image,primary=`assets/questions/${q.id}.png`;
 // A normal PNG per question avoids SVG-with-embedded-WebP rendering and
 // loading a ten-question sprite for every visible question. Keep the original
 // sprite as an independent fallback, including for sessions started earlier.
 return `<div class="question-figure"><div class="q-image" style="aspect-ratio:${width}/${displayHeight}"><img data-question-image data-image-source="${escapeHtml(primary)}" data-image-fallback="${escapeHtml(src)}" data-image-height="${height}" data-sprite-height="${spriteHeight}" data-image-y="${y}" data-display-height="${displayHeight}" ${deferred?'data-src':'src'}="${escapeHtml(primary)}" width="${width}" height="${height}" loading="eager" style="top:0" alt="${escapeHtml(q.source)}の問題文・図表・選択肢"><p class="image-load-error" role="status" hidden>問題画像の読み込みが完了しませんでした。下の「画像を再読み込み」または「別形式で表示」を押してください。</p></div><div class="question-image-tools"><span>画像が表示されないとき：</span><button type="button" class="secondary" data-image-retry>画像を再読み込み</button><button type="button" class="secondary" data-image-fallback>別形式で表示</button></div></div>`;
}

export function installQuestionImages(root,{schedule=setTimeout,cancel=clearTimeout,now=Date.now,Observer=globalThis.MutationObserver,timeout=12000}={}){
 const states=new WeakMap(),pending=new Set();
 const isImage=el=>el?.matches?.('img[data-question-image]');
 const status=img=>img.closest('.q-image').querySelector('.image-load-error');
 function state(img){if(!states.has(img))states.set(img,{retries:0,timer:null,legacy:false});return states.get(img);}
 function stop(img){const s=state(img);if(s.timer!==null)cancel(s.timer);s.timer=null;pending.delete(img);}
 function loaded(img){stop(img);img.hidden=false;status(img).hidden=true;}
 function watch(img){
  stop(img);if(!img.isConnected)return;
  pending.add(img);state(img).timer=schedule(()=>{
   stop(img);if(!img.isConnected)return;
   if(img.complete&&img.naturalWidth>0){loaded(img);return;}
   failed(img);
  },timeout);
 }
 function request(img,{legacy=state(img).legacy,bust=false}={}){
  if(!img.isConnected)return;
  const s=state(img);s.legacy=legacy;
  img.hidden=false;status(img).hidden=true;
  img.height=Number(legacy?img.dataset.spriteHeight:img.dataset.imageHeight);
  img.style.top=legacy?`-${Number(img.dataset.imageY)/Number(img.dataset.displayHeight)*100}%`:'0px';
  const src=legacy?img.dataset.imageFallback:img.dataset.imageSource;
  delete img.dataset.src;
  watch(img);
  img.src=src+(bust?(src.includes('?')?'&':'?')+'image-retry='+now():'');
 }
 function failed(img){
  stop(img);if(!img.isConnected)return;
  const s=state(img);
  if(s.retries===0){s.retries=1;request(img,{bust:true});return;}
  img.hidden=true;status(img).hidden=false;
 }
 function scan(){
  for(const img of pending)if(!img.isConnected)stop(img);
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
 root.addEventListener('error',event=>{if(isImage(event.target))failed(event.target);},true);
 root.addEventListener('load',event=>{if(isImage(event.target))loaded(event.target);},true);
 root.addEventListener('click',event=>{
  const button=event.target.closest?.('[data-image-retry],button[data-image-fallback]');if(!button)return;
  const img=button.closest('.question-figure').querySelector('img[data-question-image]');
  state(img).retries=0;request(img,{legacy:button.hasAttribute('data-image-fallback'),bust:true});
 });
 // Images are inserted through innerHTML while changing questions/results.
 // Watch stalled requests too: they may emit neither load nor error.
 if(Observer){const observer=new Observer(scan);observer.observe(root,{childList:true,subtree:true});scan();}
}
