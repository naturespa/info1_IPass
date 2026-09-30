import {DOMAINS} from './core.js';
const colors=['#17365e','#a35b05','#176c61','#7953a3'],labels=['総合',...DOMAINS];
export function drawProgressChart(target,records,visible=new Set(labels)){
 const w=Math.max(280,target.clientWidth||680),h=265,left=44,right=20,top=25,bottom=45,x=n=>left+(n-1)*(w-left-right)/4,y=v=>h-bottom-v*(h-top-bottom)/100;
 const lines=[...Array(6)].map((_,i)=>{const v=i*20;return '<line x1="'+left+'" y1="'+y(v)+'" x2="'+(w-right)+'" y2="'+y(v)+'" stroke="#d6dfe6"/><text x="'+(left-9)+'" y="'+(y(v)+4)+'" text-anchor="end" font-size="12" fill="#53677a">'+v+'%</text>';}).join('');
 const ticks=[1,2,3,4,5].map(n=>'<text x="'+x(n)+'" y="'+(h-16)+'" text-anchor="middle" font-size="12" fill="#53677a">第'+n+'回</text>').join('');
 const series=labels.map((label,i)=>{
  if(!visible.has(label))return '';
  const points=records.map(a=>({round:a.round,rate:i===0?a.result.score:a.result.byDomain.find(d=>d.domain===label)?.rate})).filter(p=>p.rate!=null&&p.round<=5);
  const line=points.length>1?'<polyline points="'+points.map(p=>x(p.round)+','+y(p.rate)).join(' ')+'" fill="none" stroke="'+colors[i]+'" stroke-width="'+(i===0?3:2)+'" '+(i===0?'':'stroke-dasharray="'+(i*2+2)+' 3"')+' />':'';
  return line+points.map(p=>'<circle cx="'+x(p.round)+'" cy="'+y(p.rate)+'" r="5" fill="'+colors[i]+'" stroke="white" stroke-width="1.5"><title>'+label+' 第'+p.round+'回 '+p.rate+'%</title></circle>').join('');
 }).join('');
 target.innerHTML='<svg viewBox="0 0 '+w+' '+h+'" width="100%" role="img" aria-label="総合と各分野の正答率を第1回から第5回まで比較。数値の詳細は下の受験記録表に表示。">'+lines+ticks+series+'</svg>';
}
export function chartLegend(target,redraw){
 let visible=new Set(labels);
 target.innerHTML=labels.map((l,i)=>'<button type="button" aria-pressed="true" data-series="'+i+'" style="--series-color:'+colors[i]+'"><span aria-hidden="true"></span>'+l+'</button>').join('');
 target.querySelectorAll('button').forEach(b=>b.onclick=()=>{const l=labels[+b.dataset.series];if(visible.has(l))visible.delete(l);else visible.add(l);b.setAttribute('aria-pressed',String(visible.has(l)));redraw(visible);});
 return ()=>visible;
}
