// Loaded by Code OSS's real extension test host; never contacts a real OJ.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const vscode = require('vscode');
const waitFor = async fn => { for (let i=0;i<100;i++){ const value=await fn();if(value)return value;await new Promise(r=>setTimeout(r,200)); } throw new Error('Desktop smoke timed out'); };
exports.run = async () => {
  const root = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const extension = vscode.extensions.getExtension('dsu.dsu-ide');
  assert.ok(extension, 'DSU built-in extension must be discoverable');
  assert.equal(await fs.realpath(extension.extensionPath), await fs.realpath(process.env.DSU_EXPECTED_EXTENSION_ROOT), 'Must test the built-in DSU module, not a development override');
  await extension.activate();
  const server=http.createServer((req,res)=>res.end('<!doctype html><h1>Desktop A+B</h1><article>Add numbers</article><pre class="input">20 30\n</pre><pre class="output">50\n</pre>'));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let tab, session;
  try {
    const url=`http://127.0.0.1:${server.address().port}/problem/A`;
    const cfg=JSON.parse(await fs.readFile(path.join(process.env.DSU_SOURCE_ROOT,'config/defaults.json'),'utf8'));
    cfg.defaultLanguage='javascript';
    cfg.languages.find(l=>l.id==='javascript').run=[process.env.DSU_TEST_NODE,'{source}'];
    cfg.adapters.push({id:'DesktopFixture',name:'Desktop fixture',hosts:['127.0.0.1'],problemPattern:'^/problem/(A)$',title:'h1',statement:'article',inputs:'pre.input',outputs:'pre.output'});
    cfg.templates.push({name:'Smoke template',prefix:'dsutest',language:'javascript',body:'console.log(42);'});
    await fs.mkdir(path.join(root,'.dsu'),{recursive:true});
    await fs.writeFile(path.join(root,'.dsu/config.json'),JSON.stringify(cfg));
    tab=await vscode.window.openBrowserTab(url); session=await tab.startCDPSession();
    let id=0;const pending=new Map();
    session.onDidReceiveMessage(m=>{if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}});
    const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{pending.delete(n);reject(Error('CDP timeout: '+method));},10000);pending.set(n,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});session.sendMessage({id:n,method,params,...(sessionId?{sessionId}:{})}).then(undefined,e=>{clearTimeout(timer);pending.delete(n);reject(e);});});
    const target=(await send('Target.getTargets')).targetInfos.find(t=>t.type==='page');
    const {sessionId}=await send('Target.attachToTarget',{targetId:target.targetId,flatten:true});
    const point=await waitFor(async()=>{const r=await send('Runtime.evaluate',{expression:'(()=>{const e=document.getElementById("dsu-ide-button");if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()',returnByValue:true},sessionId);return r.result.value;});
    await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1},sessionId);
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1},sessionId);
    const file=path.join(root,'DesktopFixture','Desktop A+B.js');
    await waitFor(async()=>{try{await fs.access(file);return true;}catch{return false;}});
    await fs.writeFile(file,"const a=require('fs').readFileSync(0,'utf8').trim().split(/\\s+/).map(Number);console.log(a[0]+a[1]);");
    const doc=await vscode.workspace.openTextDocument(file);await vscode.window.showTextDocument(doc);
    const results=await vscode.commands.executeCommand('dsu.test');
    assert.equal(results?.[0]?.status,'AC');
    const completion=await vscode.commands.executeCommand('vscode.executeCompletionItemProvider',doc.uri,new vscode.Position(0,0));
    assert.ok(completion.items.some(i=>i.label==='dsutest'));
    await fs.writeFile(path.join(root,'desktop-smoke.json'),JSON.stringify({version:extension.packageJSON.version,import:true,browser:true,test:results[0].status,template:true},null,2));
  } finally {await session?.close();await tab?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
};
