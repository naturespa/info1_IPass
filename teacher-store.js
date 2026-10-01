// Teacher-only local data: shared by admin.html and compare.html, never uploaded automatically.
let cached;
function database(){return cached??=new Promise((resolve,reject)=>{const request=indexedDB.open('ipass-teacher-v1',1);request.onupgradeneeded=()=>{request.result.createObjectStore('records',{keyPath:'attemptId'});request.result.createObjectStore('roster',{keyPath:'code'});};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('教員用データをこのブラウザに保存できません。'));});}
async function run(store,mode,operation){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction(store,mode),s=tx.objectStore(store);let value;try{value=operation(s);}catch(e){tx.abort();reject(e);return;}tx.oncomplete=()=>resolve(value?.result??value);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??new Error('保存を中断しました。'));});}
export const teacherStore={
 records:()=>run('records','readonly',s=>s.getAll()),
 roster:()=>run('roster','readonly',s=>s.getAll()),
 saveRecords:rows=>run('records','readwrite',s=>{for(const row of rows)s.put(row);}),
 saveRoster:rows=>run('roster','readwrite',s=>{s.clear();for(const row of rows)s.put(row);}),
 restore:async data=>{const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction(['records','roster'],'readwrite');for(const key of ['records','roster']){const s=tx.objectStore(key);s.clear();for(const row of data[key])s.put(row);}tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});},
 clearRecords:()=>run('records','readwrite',s=>s.clear())
};
