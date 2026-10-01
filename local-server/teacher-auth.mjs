import {randomBytes,scrypt as scryptCallback,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(scryptCallback),SESSION_MS=8*60*60*1000;
export function createTeacherAuth(db){
 const sessions=new Map();let failures=0,blockedUntil=0,setting=false;
 const get=()=>db.prepare('SELECT value FROM settings WHERE key=?').get('teacher-password')?.value;
 const hash=token=>createHash('sha256').update(token).digest('hex');
 const token=req=>(req.headers.cookie??'').split(';').map(s=>s.trim()).find(s=>s.startsWith('ipass_teacher='))?.slice('ipass_teacher='.length)??'';
 const authenticated=req=>{const key=hash(token(req)),expires=sessions.get(key);if(!expires||expires<=Date.now()){sessions.delete(key);return false;}return true;};
 const cookie=(res,value,maxAge)=>res.setHeader('Set-Cookie',`ipass_teacher=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`);
 const issue=res=>{for(const [k,v] of sessions)if(v<=Date.now())sessions.delete(k);const value=randomBytes(32).toString('hex');sessions.set(hash(value),Date.now()+SESSION_MS);cookie(res,value,SESSION_MS/1000);};
 const verify=async password=>{const saved=get();if(!saved||typeof password!=='string'||password.length>256)return false;const {salt,key}=JSON.parse(saved),actual=await scrypt(password,salt,64);return timingSafeEqual(actual,Buffer.from(key,'hex'));};
 const set=async password=>{if(typeof password!=='string'||password.length<8||password.length>256)throw new Error('パスワードは8〜256文字で設定してください。');const salt=randomBytes(16).toString('hex'),key=(await scrypt(password,salt,64)).toString('hex');db.prepare('INSERT OR REPLACE INTO settings VALUES (?,?)').run('teacher-password',JSON.stringify({salt,key}));sessions.clear();failures=0;blockedUntil=0;};
 return {authenticated,status(req){return {configured:!!get(),authenticated:authenticated(req)};},
  async setup(password,res){if(get()||setting)throw new Error('パスワードは設定済み、または設定中です。ログインしてください。');setting=true;try{await set(password);issue(res);}finally{setting=false;}},
  async login(password,res){if(Date.now()<blockedUntil){const e=new Error('入力失敗が続いたため、1分後にもう一度お試しください。');e.status=429;throw e;}if(!await verify(password)){if(++failures>=5){blockedUntil=Date.now()+60000;failures=0;}throw new Error('パスワードが違います。');}failures=0;issue(res);},
  async change(req,current,password,res){if(!authenticated(req)||!await verify(current))throw new Error('現在のパスワードを確認してください。');await set(password);issue(res);},
  logout(req,res){sessions.delete(hash(token(req)));cookie(res,'',0);}
 };
}
