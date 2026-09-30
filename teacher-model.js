import {normalizeName} from './core.js';
import {isChallenge,comparisonKey} from './progress.js';
export function studentComparison(records,code,name,key){
 const own=records.filter(r=>r.studentCode===code&&(!name||normalizeName(r.studentName)===normalizeName(name))),challenge=own.filter(isChallenge).sort((a,b)=>(a.round??999)-(b.round??999)||Date.parse(a.startedAt)-Date.parse(b.startedAt)),complete=challenge.filter(r=>!r.abandoned),group=key??(complete.length?comparisonKey(complete.at(-1)):null),selected=complete.filter(r=>comparisonKey(r)===group),first=selected[0],latest=selected.at(-1);
 return {own,challenge,complete,selected,key:group,first,latest,best:selected.length?Math.max(...selected.map(r=>r.score)):null,gain:selected.length>1?latest.score-first.score:null,practice:own.filter(r=>!isChallenge(r)),abandoned:challenge.filter(r=>r.abandoned).length};
}
export function submissionOverview(roster,records){return roster.map(person=>{const c=studentComparison(records,person.code,person.name),mismatches=records.filter(r=>r.studentCode===person.code&&normalizeName(r.studentName)!==normalizeName(person.name));return {...person,...c,status:c.complete.length>=5?'本チャレンジ5回完了':c.challenge.length?'提出済み':c.practice.length?'練習のみ提出':mismatches.length?'氏名不一致・要確認':'未提出',missing:!c.challenge.length,mismatches:mismatches.length};}).sort((a,b)=>a.code.localeCompare(b.code));}
