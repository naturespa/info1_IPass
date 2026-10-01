import {DOMAINS,domainAllocation,selectQuestions} from './core.js';
import {isChallenge} from './progress.js';
export const DRAW_ALGORITHM='xoshiro128ss-stratified-v2';
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
function balancedSchool(bank,count,random,practiced=new Set()){
 const exams=[...new Set(bank.map(q=>q.examId))].sort();if(count!==75||exams.length!==15)throw new Error('授業用は全15回・75問で出題します。');
 const domainCounts=domainAllocation(count),hasAspects=bank.every(q=>['知識・技能','思考・判断・表現'].includes(q.aspect));
 let allocations=[null];if(hasAspects){allocations=[];for(let ks=0;ks<=26;ks++)for(let km=0;km<=15;km++){const kt=30-ks-km;if(kt<0||kt>34)continue;const k=[ks,km,kt];if(k.every((n,d)=>bank.filter(q=>q.domain===DOMAINS[d]&&q.aspect==='知識・技能').length>=n&&bank.filter(q=>q.domain===DOMAINS[d]&&q.aspect==='思考・判断・表現').length>=domainCounts[d].count-n))allocations.push(k);}allocations.sort((a,b)=>a.reduce((v,n,d)=>v+Math.abs(n-[10,6,14][d]),0)-b.reduce((v,n,d)=>v+Math.abs(n-[10,6,14][d]),0));}
 let lastError='観点別の未出題問題が不足しています。';
 for(const allocation of allocations){
  const demands=allocation?domainCounts.flatMap((d,i)=>[{domain:d.domain,aspect:'知識・技能',count:allocation[i]},{domain:d.domain,aspect:'思考・判断・表現',count:d.count-allocation[i]}]):domainCounts;
  const source=0,yearStart=1+demands.length,managementStart=yearStart+exams.length,sink=managementStart+exams.length,n=sink+1,edges=Array.from({length:n},()=>[]),assigned=[];
  function edge(a,b,capacity,cost){const f={to:b,rev:edges[b].length,capacity,cost},r={to:a,rev:edges[a].length,capacity:0,cost:-cost};edges[a].push(f);edges[b].push(r);return f;}
  for(let d=0;d<demands.length;d++){edge(source,1+d,demands[d].count,0);for(let e=0;e<exams.length;e++){const pool=bank.filter(q=>q.examId===exams[e]&&q.domain===demands[d].domain&&(!demands[d].aspect||q.aspect===demands[d].aspect)),links=[],fresh=pool.filter(q=>!practiced.has(q.id)).length;for(let k=0;k<Math.min(5,pool.length);k++)links.push(edge(1+d,demands[d].domain===DOMAINS[1]?managementStart+e:yearStart+e,1,k*100+Math.floor(random()*50)+(k>=fresh?10000:0)));assigned.push({pool,links});}}
  for(let e=0;e<exams.length;e++) {edge(yearStart+e,sink,5,0);edge(managementStart+e,yearStart+e,1,0);}
  let feasible=true;
  for(let sent=0;sent<count;sent++){const distance=Array(n).fill(Infinity),parent=Array(n),queue=[source],queued=Array(n).fill(false);distance[source]=0;queued[source]=true;for(let qi=0;qi<queue.length;qi++){const u=queue[qi];queued[u]=false;for(let i=0;i<edges[u].length;i++){const f=edges[u][i];if(f.capacity>0&&distance[f.to]>distance[u]+f.cost){distance[f.to]=distance[u]+f.cost;parent[f.to]=[u,i];if(!queued[f.to]){queued[f.to]=true;queue.push(f.to);}}}}if(!parent[sink]){feasible=false;break;}for(let v=sink;v!==source;){const [u,i]=parent[v],f=edges[u][i];f.capacity--;edges[v][f.rev].capacity++;v=u;}}
  if(!feasible)continue;
  const result=[];for(const {pool,links} of assigned){const need=links.filter(f=>f.capacity===0).length;for(let i=pool.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}pool.sort((a,b)=>Number(practiced.has(a.id))-Number(practiced.has(b.id)));result.push(...pool.slice(0,need));}
  const maxOverlap=Math.floor(count*.15);let overlap=result.filter(q=>practiced.has(q.id)).length;if(overlap>maxOverlap){lastError='練習との重複を15%以内に保つための未練習問題が不足しています。';continue;}
  for(let i=0;i<result.length&&overlap<maxOverlap;i++)if(!practiced.has(result[i].id)&&random()<.15){const q=result[i],candidates=bank.filter(x=>x.examId===q.examId&&x.domain===q.domain&&(!hasAspects||x.aspect===q.aspect)&&practiced.has(x.id)&&!result.some(r=>r.id===x.id));if(candidates.length){result[i]=candidates[Math.floor(random()*candidates.length)];overlap++;}}
  return DOMAINS.flatMap(domain=>{const pool=result.filter(q=>q.domain===domain);for(let i=pool.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}return pool;});
 }
 throw new Error(lastError+' 分類を比率合わせのために変更せず、先生に確認してください。');
}
export function drawQuestions(bank,settings,{studentCode,round,records=[],seed=newSeed()}){
 if(settings.mode==='year')return {questions:selectQuestions(bank,settings),drawing:{policy:'original-paper'}};
 const excludedQuestionIds=settings.mode==='school'?previousQuestionIds(records.filter(isChallenge)):[],used=new Set(excludedQuestionIds),available=bank.filter(q=>!used.has(q.id)),random=drawRandom(seed,studentCode,round);
 const practiced=new Set(previousQuestionIds(records.filter(a=>!isChallenge(a))));
 let questions;try{questions=settings.mode==='school'?balancedSchool(available,settings.count,random,practiced):selectQuestions(available,settings,random);}catch(e){throw new Error('出題できません。 '+e.message);}
 return {questions,drawing:{algorithm:DRAW_ALGORITHM,seed,studentCode,round,policy:settings.mode==='school'?'ipa-ratio-aspects40-60-15-papers-no-repeat-practice-overlap15':'unlimited-practice',excludedQuestionIds,...(settings.mode==='school'?{maxPracticeOverlap:Math.floor(settings.count*.15),practiceOverlapQuestionIds:questions.filter(q=>practiced.has(q.id)).map(q=>q.id)}:{})}};
}
