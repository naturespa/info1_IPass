import {isChallenge} from './progress.js';
export function createExamFullscreen({doc,getSession,onLock,onEvent}){
 let monitoring=false,owned=false;
 const active=()=>{const s=getSession();return monitoring&&s?.startedAt&&!s.result&&isChallenge(s);};
 function lock(reason){if(!active())return;onEvent?.(reason);onLock(true,reason);}
 doc.addEventListener('fullscreenchange',()=>{if(active()&&!doc.fullscreenElement)lock('fullscreen-exit');});
 doc.addEventListener('visibilitychange',()=>{if(doc.hidden)lock('page-hidden');});
 return {async enter(record){if(!isChallenge(record)||record.result)return;if(!doc.fullscreenEnabled||!doc.documentElement.requestFullscreen)throw new Error('全画面表示を利用できません。対応ブラウザの設定・許可を先生に確認してください。');try{if(doc.fullscreenElement!==doc.documentElement)await doc.documentElement.requestFullscreen();if(doc.fullscreenElement!==doc.documentElement)throw new Error();owned=true;monitoring=true;onLock(false);}catch{monitoring=false;throw new Error('本チャレンジは全画面表示が必要です。全画面表示を許可して、もう一度操作してください。');}},
  async exit(){monitoring=false;onLock(false);if(owned&&doc.fullscreenElement){try{await doc.exitFullscreen();}catch{}}owned=false;},
  check(){if(active()&&(doc.hidden||!doc.fullscreenElement))lock(doc.hidden?'page-hidden':'fullscreen-exit');},
  focusLost(){lock('window-blur');}
 };
}
