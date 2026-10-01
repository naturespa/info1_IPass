import {networkInterfaces} from 'node:os';
export function submissionAddresses(interfaces){
 if(interfaces===undefined){try{interfaces=networkInterfaces();}catch{return [];}}
 const found=new Set(),rows=[];for(const [name,addresses] of Object.entries(interfaces))for(const a of addresses??[]){if(!['IPv4',4].includes(a.family)||a.internal||!a.address||a.address.startsWith('127.')||a.address.startsWith('169.254.')||found.has(a.address))continue;found.add(a.address);rows.push({name,address:a.address});}return rows;
}
export function startupMessage({port,storage,rosterFile,addresses=submissionAddresses()}){
 return [`確認用画面 http://localhost:${port}/`,`管理画面 http://localhost:${port}/admin.html`,`成績の保存先: ${storage}`,`名簿の読込先: ${rosterFile}`,'','生徒が「学校サーバのIPアドレス」に入力するIPv4アドレス:',...(addresses.length?addresses.map(a=>`  ${a.address}  [${a.name}]`):['  接続できるIPv4アドレスを取得できません。校内ネットワーク接続を確認してください。','  Windowsのコマンドプロンプトで ipconfig を実行し、使用中の接続のIPv4アドレスを確認できます。']),...(addresses.length>1?['複数候補があります。校内ネットワークにつながる接続のアドレスを使用してください。']:[]),'生徒の入力欄にはIPアドレスだけを入力します（http:// や :3000 は不要）。',...addresses.map(a=>`提出受付URL: http://${a.address}:${port}/api/submissions`),'サーバを使用している間は、この画面を開いたままにしてください。'].join('\n');
}
