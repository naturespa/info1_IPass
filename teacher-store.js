import {applyIdentity} from './identity-model.js';
// Teacher-only local data: shared by admin.html and compare.html, never uploaded automatically.
let cached;
function database(){return cached??=new Promise((resolve,reject)=>{const request=indexedDB.open('ipass-teacher-v1',2);request.onupgradeneeded=()=>{for(const [name,keyPath]of [['records','attemptId'],['roster','code'],['identities','attemptId']])if(!request.result.objectStoreNames.contains(name))request.result.createObjectStore(name,{keyPath});};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('教員用データをこのブラウザに保存できません。'));});}
async function run(store,mode,operation){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction(store,mode),s=tx.objectStore(store);let value;try{value=operation(s);}catch(e){tx.abort();reject(e);return;}tx.oncomplete=()=>resolve(value?.result??value);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??new Error('保存を中断しました。'));});}
export const teacherStore={
 rawRecords:()=>run('records','readonly',s=>s.getAll()),
 identities:()=>run('identities','readonly',s=>s.getAll()),
 saveIdentity:row=>run('identities','readwrite',s=>s.put(row)),
 records:async()=>{const [rows,ids]=await Promise.all([run('records','readonly',s=>s.getAll()),run('identities','readonly',s=>s.getAll())]);const map=new Map(ids.map(i=>[i.attemptId,i]));return rows.map(r=>applyIdentity(r,map.get(r.attemptId)));},
 roster:()=>run('roster','readonly',s=>s.getAll()),
 saveRecords:rows=>run('records','readwrite',s=>{for(const row of rows)s.put(row);}),
 saveRoster:rows=>run('roster','readwrite',s=>{s.clear();for(const row of rows)s.put(row);}),
 restore:async data=>{const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction(['records','roster','identities'],'readwrite');for(const key of ['records','roster','identities']){const s=tx.objectStore(key);s.clear();for(const row of data[key]??[])s.put(row);}tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});},
 clearRecords:async()=>{await run('records','readwrite',s=>s.clear());await run('identities','readwrite',s=>s.clear());}
};
