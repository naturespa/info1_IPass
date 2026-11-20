import {DOMAINS,domainAllocation,selectQuestions,shuffle} from './core.js';
import {isChallenge} from './progress.js';
const LEGACY_DRAW_ALGORITHM='xoshiro128ss-stratified-v2';
export const DRAW_ALGORITHM='xoshiro128ss-stratified-v3';
export const practiceOverlapTarget=count=>Math.floor(count*.15);
const ASPECTS=['知識・技能','思考・判断・表現'];
const EXAM_COUNT=15;
const PER_EXAM_COUNT=5;
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
function schoolGroups(bank,exams,domainCounts,practiced,hasAspects){
 return domainCounts.map(({domain,count})=>({
  count,
  groups:(hasAspects?ASPECTS:[null]).map(aspect=>{
   const questions=bank.filter(q=>q.domain===domain&&(!aspect||q.aspect===aspect));
   const fresh=questions.filter(q=>!practiced.has(q.id));
   const papers=exams.map(examId=>questions.filter(q=>q.examId===examId));
   return {
    domain,questions,fresh,papers,
    freshCounts:papers.map(paper=>paper.filter(q=>!practiced.has(q.id)).length)
   };
  })
 }));
}

function schoolAllocations(groups,hasAspects){
 if(!hasAspects){
  const demands=groups.map(({count,groups:[group]})=>({...group,count}));
  return demands.every(d=>d.questions.length>=d.count)?[demands]:[];
 }
 const [strategy,management,technology]=groups.map(g=>g.count);
 const allocations=[];
 for(let s=0;s<=strategy;s++)for(let m=0;m<=management;m++){
  const t=30-s-m;
  if(t<0||t>technology)continue;
  const knowledge=[s,m,t];
  const demands=groups.flatMap(({count,groups:[k,j]},i)=>[
   {...k,count:knowledge[i]},{...j,count:count-knowledge[i]}
  ]);
  if(demands.every(d=>d.questions.length>=d.count)){
   const distance=Math.abs(s-10)+Math.abs(m-6)+Math.abs(t-14);
   allocations.push({demands,distance});
  }
 }
 return allocations.sort((a,b)=>a.distance-b.distance).map(a=>a.demands);
}

function drawFixedPapers(demands,examCount,count,random,practiced){
 const source=0,yearStart=1+demands.length,managementStart=yearStart+examCount;
 const sink=managementStart+examCount,edges=Array.from({length:sink+1},()=>[]);
 const assigned=[];
 function edge(a,b,capacity,cost){
  const forward={to:b,rev:edges[b].length,capacity,cost};
  const reverse={to:a,rev:edges[a].length,capacity:0,cost:-cost};
  edges[a].push(forward);
  edges[b].push(reverse);
  return forward;
 }
 // A practiced question costs more than all other tie-breaking costs combined.
 const overlapPenalty=count*500;
 for(let d=0;d<demands.length;d++){
  const demand=demands[d];
  edge(source,1+d,demand.count,0);
  for(let e=0;e<examCount;e++){
   const pool=demand.papers[e],links=[];
   const target=(demand.domain===DOMAINS[1]?managementStart:yearStart)+e;
   for(let k=0;k<Math.min(PER_EXAM_COUNT,pool.length);k++){
    const overlapCost=k>=demand.freshCounts[e]?overlapPenalty:0;
    links.push(edge(1+d,target,1,k*100+Math.floor(random()*50)+overlapCost));
   }
   assigned.push({pool,links});
  }
 }
 for(let e=0;e<examCount;e++){
  edge(yearStart+e,sink,PER_EXAM_COUNT,0);
  edge(managementStart+e,yearStart+e,1,0);
 }
 for(let sent=0;sent<count;sent++){
  const distance=Array(edges.length).fill(Infinity),parent=[],queue=[source];
  const queued=Array(edges.length).fill(false);
  distance[source]=0;
  queued[source]=true;
  for(let qi=0;qi<queue.length;qi++){
   const u=queue[qi];
   queued[u]=false;
   for(let i=0;i<edges[u].length;i++){
    const link=edges[u][i];
    const candidate=distance[u]+link.cost;
    if(link.capacity<=0||candidate>=distance[link.to])continue;
    distance[link.to]=candidate;
    parent[link.to]=[u,i];
    if(!queued[link.to]){
     queued[link.to]=true;
     queue.push(link.to);
    }
   }
  }
  if(!parent[sink])return null;
  for(let v=sink;v!==source;){
   const [u,i]=parent[v],link=edges[u][i];
   link.capacity--;
   edges[v][link.rev].capacity++;
   v=u;
  }
 }
 return assigned.flatMap(({pool,links})=>{
  const need=links.filter(link=>link.capacity===0).length;
  if(!need)return [];
  return shuffle(pool,random)
   .sort((a,b)=>Number(practiced.has(a.id))-Number(practiced.has(b.id)))
   .slice(0,need);
 });
}

function drawFlexiblePapers(allocations,random,practiced){
 let best,minimum=Infinity;
 for(const demands of allocations){
  // Once per-paper quotas are relaxed, each group fills independently.
  const overlap=demands.reduce((sum,d)=>sum+Math.max(0,d.count-d.fresh.length),0);
  if(overlap<minimum){
   best=demands;
   minimum=overlap;
  }
 }
 if(!best)throw new Error('分野・観点別の未出題問題が不足しています。先生に確認してください。');
 const paperCounts=new Map(),selected=[];
 function pick(pool,count){
  const remaining=shuffle(pool,random);
  for(let n=0;n<count;n++){
   let bestIndex=0;
   for(let i=1;i<remaining.length;i++){
    if((paperCounts.get(remaining[i].examId)??0)<(paperCounts.get(remaining[bestIndex].examId)??0))bestIndex=i;
   }
   const [q]=remaining.splice(bestIndex,1);
   selected.push(q);
   paperCounts.set(q.examId,(paperCounts.get(q.examId)??0)+1);
  }
 }
 for(const d of shuffle(best,random))pick(d.fresh,Math.min(d.count,d.fresh.length));
 for(const d of shuffle(best,random)){
  if(d.fresh.length<d.count)pick(d.questions.filter(q=>practiced.has(q.id)),d.count-d.fresh.length);
 }
 return selected;
}

function balancedSchool(bank,exams,count,random,practiced){
 if(count!==75||exams.length!==EXAM_COUNT)throw new Error('授業用は全15回・75問で出題します。');
 const domainCounts=domainAllocation(count),hasAspects=bank.every(q=>ASPECTS.includes(q.aspect));
 const groups=schoolGroups(bank,exams,domainCounts,practiced,hasAspects);
 const allocations=schoolAllocations(groups,hasAspects);
 const target=practiceOverlapTarget(count);
 const fixedOverlapFloor=exams.reduce((sum,examId,i)=>{
  const fresh=groups.map(({groups})=>groups.reduce((n,g)=>n+g.freshCounts[i],0));
  return sum+Math.max(0,1-fresh[1])+Math.max(0,PER_EXAM_COUNT-1-fresh[0]-fresh[2]);
 },0);
 if(fixedOverlapFloor<=target){
  for(const demands of allocations){
   const result=drawFixedPapers(demands,exams.length,count,random,practiced);
   if(!result)continue;
   let overlap=result.filter(q=>practiced.has(q.id)).length;
   if(overlap>target)continue;
   // Retain the existing mix of practice questions on standard draws.
   for(let i=0;i<result.length&&overlap<target;i++){
    const q=result[i];
    if(practiced.has(q.id)||random()>=.15)continue;
    const candidates=bank.filter(x=>x.examId===q.examId&&x.domain===q.domain&&
     (!hasAspects||x.aspect===q.aspect)&&practiced.has(x.id)&&!result.some(r=>r.id===x.id));
    if(candidates.length){
     result[i]=candidates[Math.floor(random()*candidates.length)];
     overlap++;
    }
   }
   return {selected:result,yearAllocation:'fixed'};
  }
 }
 return {selected:drawFlexiblePapers(allocations,random,practiced),yearAllocation:'flexible'};
}

export function drawQuestions(bank,settings,{studentCode,round,records=[],seed=newSeed()}){
 if(settings.mode==='year')return {questions:selectQuestions(bank,settings),drawing:{policy:'original-paper'}};
 const random=drawRandom(seed,studentCode,round);
 if(settings.mode!=='school'){
  try{
   return {
    questions:selectQuestions(bank,settings,random),
    drawing:{algorithm:LEGACY_DRAW_ALGORITHM,seed,studentCode,round,policy:'unlimited-practice',excludedQuestionIds:[]}
   };
  }catch(e){throw new Error('出題できません。 '+e.message);}
 }
 const excludedQuestionIds=previousQuestionIds(records.filter(isChallenge));
 const used=new Set(excludedQuestionIds),available=bank.filter(q=>!used.has(q.id));
 const practiced=new Set(previousQuestionIds(records.filter(a=>!isChallenge(a))));
 const exams=[...new Set(bank.map(q=>q.examId))].sort();
 try{
  const {selected,yearAllocation}=balancedSchool(available,exams,settings.count,random,practiced);
  const questions=DOMAINS.flatMap(domain=>shuffle(selected.filter(q=>q.domain===domain),random));
  const practiceOverlapQuestionIds=questions.filter(q=>practiced.has(q.id)).map(q=>q.id);
  const targetPracticeOverlap=practiceOverlapTarget(settings.count);
  return {questions,drawing:{
   algorithm:DRAW_ALGORITHM,seed,studentCode,round,policy:'ipa-ratio-aspects40-60-no-repeat-minimize-practice-overlap',
   excludedQuestionIds,yearAllocation,targetPracticeOverlap,
   maxPracticeOverlap:Math.max(targetPracticeOverlap,practiceOverlapQuestionIds.length),
   practiceOverlapQuestionIds
  }};
 }catch(e){throw new Error('出題できません。 '+e.message);}
}
