const escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function questionImage(q,{displayHeight=q.image.height,deferred=false}={}){
 const {src,width,spriteHeight,y}=q.image;
 // A sprite's intrinsic height must be known before loading. Native lazy loading
 // sees an absolutely positioned, negatively offset, zero-height image as offscreen.
 // Review images are instead loaded explicitly when their details element opens.
 return `<div class="q-image" style="aspect-ratio:${width}/${displayHeight}"><img data-question-image data-image-source="${escapeHtml(src)}" ${deferred?'data-src':'src'}="${escapeHtml(src)}" width="${width}" height="${spriteHeight}" loading="eager" style="top:-${y/displayHeight*100}%" alt="${escapeHtml(q.source)}の問題文・図表・選択肢"><p class="image-load-error" role="status" hidden>問題画像を読み込めませんでした。<button type="button" class="secondary" data-image-retry>画像を再読み込み</button></p></div>`;
}

export function installQuestionImages(root,{schedule=setTimeout,now=Date.now}={}){
 const retries=new WeakMap();
 const isImage=el=>el?.matches?.('img[data-question-image]');
 const status=img=>img.closest('.q-image').querySelector('.image-load-error');
 function retry(img){
  if(!img.isConnected)return;
  img.hidden=false;status(img).hidden=true;
  const src=img.dataset.imageSource;
  img.src=src+(src.includes('?')?'&':'?')+'image-retry='+now();
 }
 root.addEventListener('toggle',event=>{
  if(!event.target.matches?.('details')||!event.target.open)return;
  for(const img of event.target.querySelectorAll('img[data-question-image][data-src]')){
   img.src=img.dataset.src;delete img.dataset.src;
  }
 },true);
 root.addEventListener('error',event=>{
  const img=event.target;if(!isImage(img))return;
  if(!retries.get(img)){retries.set(img,1);schedule(()=>retry(img),400);return;}
  img.hidden=true;status(img).hidden=false;
 },true);
 root.addEventListener('load',event=>{
  const img=event.target;if(!isImage(img))return;
  retries.delete(img);img.hidden=false;status(img).hidden=true;
 },true);
 root.addEventListener('click',event=>{
  const button=event.target.closest?.('[data-image-retry]');if(!button)return;
  const img=button.closest('.q-image').querySelector('img[data-question-image]');
  retries.delete(img);retry(img);
 });
}
