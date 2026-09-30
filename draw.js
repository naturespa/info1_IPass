import {DOMAINS,domainAllocation,selectQuestions} from './core.js';
export const DRAW_ALGORITHM='xoshiro128ss-stratified-v1';
export function newSeed(){return Array.from(crypto.getRandomValues(new Uint32Array(4)),n=>n.toString(16).padStart(8,'0')).join('');}
// Reference: https://prng.di.unimi.it/xoshiro128starstar.c (public domain)
// xoshiro128**: reproducible shuffle, fresh browser-generated entropy for every draw.
export function drawRandom(seed,code,round){
 if(!/^[0-9a-f]{32}$/i.test(seed)||!/^\d{4}$/.test(code)||!Number.isInteger(round)||round<1)throw new Error('抽選情報が正しくありません。');
 const s=seed.match(/.{8}/g).map(x=>parseInt(x,16)>>>0);s[0]=(s[0]^Number(code))>>>0;s[1]=(s[1]^round)>>>0;if(s.every(x=>x===0))s[3]=1;
 const rot=(n,k)=>(n<<k|n>>>(32-k))>>>0;
 return ()=>{const result=Math.imul(rot(Math.imul(s[1],5),7),9)>>>0,t=s[1]<<9;s[2]^=s[0];s[3]^=s[1];s[1]^=s[2];s[0]^=s[3];s[2]^=t;s[3]=rot(s[3],11);return result/4294967296;};
}
export function previousQuestionIds(records){return [...new Set(records.flatMap(a=>a.result?.answers?.map(x=>x.id)??a.session?.questionIds??[]))].sort();}
function balancedSchool(bank,count,random){
 const exams=[...new Set(bank.map(q=>q.examId))].sort();if(count!==75||exams.length!==15)throw new Error('授業用は全15回・75問で出題します。');
 const demands=domainAllocation(count),source=0,sink=4+exams.length,n=sink+1,edges=Array.from({length:n},()=>[]),assigned=[];
 function edge(a,b,capacity,cost){const f={to:b,rev:edges[b].length,capacity,cost},r={to:a,rev:edges[a].length,capacity:0,cost:-cost};edges[a].push(f);edges[b].push(r);return f;}
 for(let d=0;d<3;d++){
  edge(source,1+d,demands[d].count,0);
  for(let e=0;e<exams.length;e++){
   const pool=bank.filter(q=>q.domain===DOMAINS[d]&&q.examId===exams[e]),links=[];
   // Progressive costs balance each domain among years; year quotas stay exactly five.
   for(let k=0;k<Math.min(5,pool.length);k++)links.push(edge(1+d,4+e,1,k*100+Math.floor(random()*50)));
   assigned.push({pool,links});
  }
 }
 for(let e=0;e<exams.length;e++)edge(4+e,sink,5,0);
 for(let sent=0;sent<count;sent++){
  const distance=Array(n).fill(Infinity),parent=Array(n),queue=[source],queued=Array(n).fill(false);distance[source]=0;queued[source]=true;
  for(let qi=0;qi<queue.length;qi++){const u=queue[qi];queued[u]=false;for(let i=0;i<edges[u].length;i++){const f=edges[u][i];if(f.capacity>0&&distance[f.to]>distance[u]+f.cost){distance[f.to]=distance[u]+f.cost;parent[f.to]=[u,i];if(!queued[f.to]){queued[f.to]=true;queue.push(f.to);}}}}
  if(!parent[sink])throw new Error('未出題の問題だけでは、年度・分野の配分を維持できません。出題範囲と受験履歴を確認してください。');
  for(let v=sink;v!==source;){const [u,i]=parent[v],f=edges[u][i];f.capacity--;edges[v][f.rev].capacity++;v=u;}
 }
 const result=[];
 for(const {pool,links} of assigned){const need=links.filter(f=>f.capacity===0).length;for(let i=pool.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}result.push(...pool.slice(0,need));}
 // Keep domain grouping like the official paper; randomize order within each domain.
 return DOMAINS.flatMap(domain=>{const pool=result.filter(q=>q.domain===domain);for(let i=pool.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}return pool;});
}
export function drawQuestions(bank,settings,{studentCode,round,records=[],seed=newSeed()}){
 if(settings.mode==='year')return {questions:selectQuestions(bank,settings),drawing:{policy:'original-paper'}};
 const excludedQuestionIds=previousQuestionIds(records),used=new Set(excludedQuestionIds),available=bank.filter(q=>!used.has(q.id)),random=drawRandom(seed,studentCode,round);
 let questions;try{questions=settings.mode==='school'?balancedSchool(available,settings.count,random):selectQuestions(available,settings,random);}catch(e){throw new Error('過去に出した問題を除くと出題できません。ランダム練習では「全15回」など範囲を広げてください。 '+e.message);}
 return {questions,drawing:{algorithm:DRAW_ALGORITHM,seed,studentCode,round,policy:settings.mode==='school'?'ipa-ratio-15-papers-no-repeat':'ipa-ratio-no-repeat',excludedQuestionIds}};
}
