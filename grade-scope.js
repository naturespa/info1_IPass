const KEY='ipass:teacher-grade-scope:v1';
export const gradeOfCode=code=>/^[123][1-9][0-9]{2}$/.test(String(code))?String(code)[0]:'';
export function matchesScope(code,{group='1',grade='',classCode=''}={}){
 const g=gradeOfCode(code);
 return (group==='all'||(group==='23'?g==='2'||g==='3':g==='1'))&&(!grade||g===grade)&&(!classCode||String(code).startsWith(classCode));
}
export function scopeLabel(s){return (s.group==='all'?'全学年':s.group==='23'?(s.grade?s.grade+'年':'2・3年'):'1年')+(s.classCode?' ／ '+s.classCode[0]+'年'+s.classCode[1]+'組':'');}
export function createGradeScope({classId,onChange}){
 let state={group:'1',grade:'',classCode:''},people=[],records=[],loaded=false;
 try{const saved=JSON.parse(localStorage.getItem(KEY));if(saved&&['1','23','all'].includes(saved.group))state={...state,...saved};}catch{}
 const params=new URLSearchParams(location.search),code=params.get('code'),c=params.get('class');
 if(params.has('scope')&&['1','23','all'].includes(params.get('scope')))state.group=params.get('scope');
 if(params.has('grade'))state.grade=['2','3'].includes(params.get('grade'))?params.get('grade'):'';
 if(c||code){const value=c||code,g=gradeOfCode(value.length===2?value+'01':value);if(g){state.group=g==='1'?'1':'23';state.grade=g==='1'?'':g;state.classCode=value.slice(0,2);}}
 const box=document.createElement('section');box.className='admin-card';box.setAttribute('aria-label','管理対象の学年');
 const title=document.createElement('h2');title.textContent='管理対象';box.append(title);
 const tabs=document.createElement('div');tabs.className='admin-actions';box.append(tabs);
 const buttons=new Map();
 for(const [value,label]of [['1','1年'],['23','2・3年'],['all','全学年']]){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=()=>{state={group:value,grade:'',classCode:''};refresh();changed();};buttons.set(value,b);tabs.append(b);}
 const fields=document.createElement('div');fields.className='admin-actions';fields.style.marginTop='14px';box.append(fields);
 const gl=document.createElement('label');gl.textContent='学年 ';const gs=document.createElement('select');gs.setAttribute('aria-label','2・3年の学年');for(const [v,t]of [['','2・3年すべて'],['2','2年'],['3','3年']])gs.add(new Option(t,v));gl.append(gs);fields.append(gl);
 let cs=classId?document.getElementById(classId):null;
 if(!cs){cs=document.createElement('select');const l=document.createElement('label');l.textContent='クラス ';l.append(cs);fields.append(l);}else{const l=cs.closest('label');if(l)fields.append(l);}
 cs.setAttribute('aria-label','対象クラス');
 const note=document.createElement('p');note.className='hint';note.setAttribute('role','status');box.append(note);
 const main=document.querySelector('main[data-teacher-content]')??document.querySelector('main[hidden]')??document.querySelector('main');main.querySelector('h1').insertAdjacentElement('afterend',box);
 function save(){try{localStorage.setItem(KEY,JSON.stringify(state));}catch{}}
 function changed(){save();onChange?.();}
 function refresh(){
  if(state.group!=='23')state.grade='';
  for(const [v,b]of buttons){b.className=state.group===v?'primary':'secondary';b.setAttribute('aria-pressed',String(state.group===v));}
  gl.hidden=state.group!=='23';gs.value=state.grade;
  const codes=[...new Set([...people.map(p=>p.code),...records.map(r=>r.studentCode)].filter(c=>matchesScope(c,{...state,classCode:''})).map(c=>c.slice(0,2)))].sort();
  cs.replaceChildren(new Option('全クラス',''));for(const c of codes)cs.add(new Option(c[0]+'年'+c[1]+'組',c));
  if(loaded&&!codes.includes(state.classCode))state.classCode='';cs.value=state.classCode;
  note.textContent='表示・集計・CSVの対象：'+scopeLabel(state)+'。データは削除・移動しません。一括バックアップ・名簿の取込と復元は全学年が対象です。';save();
 }
 gs.onchange=()=>{state.grade=gs.value;state.classCode='';refresh();changed();};
 cs.onchange=()=>{state.classCode=cs.value;refresh();changed();};
 refresh();
 return {
  update(p,r){people=p;records=r;loaded=true;refresh();},
  match:code=>matchesScope(code,state),
  records:rows=>rows.filter(r=>matchesScope(r.studentCode,state)),
  people:rows=>rows.filter(r=>matchesScope(r.code,state)),
  label:()=>scopeLabel(state),state:()=>({...state}),
  selectClass(c){state.classCode=c;refresh();changed();},
  suffix:()=>state.group+(state.grade?'_grade'+state.grade:'')+(state.classCode?'_'+state.classCode:'')
 };
}
