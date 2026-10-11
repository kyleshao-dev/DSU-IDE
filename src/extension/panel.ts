import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import type { ProblemRecord, TestResult, Sample } from '../core/types';

export class ProblemPanel implements vscode.Disposable {
  private panel?: vscode.WebviewPanel;
  private record?: ProblemRecord;
  private results: TestResult[] = [];
  private busy = false;
  private submission = '';
  private hasRecord = false;
  private editing = false;
  constructor(private action: (command: string, payload?: { url: string; samples: Sample[] }) => Promise<unknown>) {}
  show(record: ProblemRecord) {
    if (this.editing && this.record?.url === record.url) return;
    this.editing = false;
    if (this.record?.url !== record.url) { this.results = []; this.submission = ''; this.hasRecord = false; }
    this.record = record;
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel('dsu.samples', 'DSU · 样例', { viewColumn: vscode.ViewColumn.Three, preserveFocus: true }, { enableScripts: true, localResourceRoots: [] });
      this.panel.onDidDispose(() => { this.panel = undefined; });
      this.panel.webview.onDidReceiveMessage(m => {
        if (m.command === 'editSamples' && !this.busy) { this.editing = true; this.render(); }
        else if (m.command === 'discardSamples') { this.editing = false; this.render(); }
        else if (m.command === 'saveSamples' && this.editing && m.url === this.record?.url) {
          void this.action(m.command, { url: m.url, samples: m.samples }).then(saved => {
            if (saved && this.record?.url === m.url) { this.record = saved as ProblemRecord; this.editing = false; this.results = []; this.render(); }
          });
        } else if (['test', 'submit', 'browser', 'cancel', 'record', 'language'].includes(m.command)) void this.action(m.command);
      });
    }
    this.render(); this.panel.reveal(vscode.ViewColumn.Three, true);
  }
  setResults(results: TestResult[]) { this.results = results; if (!this.editing) this.render(); }
  setBusy(value: boolean) { this.busy = value; if (!this.editing) this.render(); }
  setSubmission(message: string, hasRecord: boolean) { this.submission = message; this.hasRecord = hasRecord; if (!this.editing) this.render(); }
  private render() {
    if (!this.panel || !this.record) return;
    if (this.editing) { this.renderEditor(); return; }
    const p = this.record, nonce = randomBytes(16).toString('hex');
    const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
    const badge = (r: TestResult) => `<span class="result ${r.status}">${r.status}<small>${r.elapsedMs} ms</small></span>`;
    const output = (r: TestResult) => `<details class="output" ${r.status === 'AC' ? '' : 'open'}><summary>实际输出</summary><pre>${esc(r.stdout || '(空)')}</pre></details>${r.stderr ? `<details open><summary>诊断信息</summary><pre>${esc(r.stderr)}</pre></details>` : ''}`;
    const passed = this.results.filter(r => r.status === 'AC').length;
    this.panel.webview.html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';"><style nonce="${nonce}">
*{box-sizing:border-box}body{font:13px var(--vscode-font-family);margin:0;padding:16px;color:var(--vscode-foreground);background:var(--vscode-editor-background)}header{position:sticky;top:0;background:var(--vscode-editor-background);padding:4px 0 16px;border-bottom:1px solid var(--vscode-panel-border);z-index:2}h1{font-size:17px;font-weight:550;line-height:1.5;margin:0 0 6px;overflow-wrap:anywhere}.meta{font-size:11px;color:var(--vscode-descriptionForeground)}nav{display:flex;align-items:center;gap:6px;margin-top:14px}button{font:inherit;padding:7px 11px;border:1px solid var(--vscode-panel-border);border-radius:4px;background:transparent;color:var(--vscode-foreground);cursor:pointer}.primary{border-color:transparent;background:var(--vscode-button-background);color:var(--vscode-button-foreground)}button:hover{background:var(--vscode-toolbar-hoverBackground)}.primary:hover{background:var(--vscode-button-hoverBackground)}button:disabled{opacity:.5;cursor:default}button:focus-visible,summary:focus-visible{outline:2px solid var(--vscode-focusBorder);outline-offset:2px}.more{position:relative;margin-left:auto}.more summary{padding:7px;list-style:none;cursor:pointer}.menu{position:absolute;right:0;top:100%;width:145px;padding:4px;border:1px solid var(--vscode-panel-border);background:var(--vscode-menu-background,var(--vscode-editor-background));box-shadow:0 4px 12px var(--vscode-widget-shadow)}.menu button{display:block;width:100%;text-align:left;border:0}article{margin:0;padding:18px 0;border-bottom:1px solid var(--vscode-panel-border)}.sample-title{display:flex;justify-content:space-between;align-items:center;gap:8px;margin:0 0 14px;font-size:12px;font-weight:500}label,summary{font-size:11px;color:var(--vscode-descriptionForeground)}pre{white-space:pre-wrap;overflow-wrap:anywhere;padding:9px 10px;margin:6px 0 12px;border-left:2px solid var(--vscode-panel-border);background:var(--vscode-textCodeBlock-background);font:12px var(--vscode-editor-font-family);line-height:1.6}.result{font-size:12px;font-weight:650;color:var(--vscode-editorWarning-foreground)}.AC{color:var(--vscode-testing-iconPassed)}.WA,.CE,.RE,.TLE,.OLE{color:var(--vscode-testing-iconFailed)}.result small{margin-left:8px;font-size:10px;font-weight:400;color:var(--vscode-descriptionForeground)}.muted{color:var(--vscode-descriptionForeground);line-height:1.7;font-size:11px}.overview{padding:12px 0 0;font-size:12px}details.output{margin:10px 0}footer{margin-top:18px}footer details{margin-top:14px}
</style></head><body><header><h1>${esc(p.title)}</h1><div class="meta">${esc(p.oj)} · ${esc(p.language)} · ${p.samples.length} 组样例</div><nav><button class="primary" data-command="test" ${this.busy ? 'disabled' : ''}>${this.busy ? '测试中…' : '一键测试'}</button><button data-command="submit" ${this.busy ? 'disabled' : ''}>提交</button>${this.busy ? '<button data-command="cancel">停止</button>' : ''}<details class="more"><summary aria-label="更多操作">更多</summary><div class="menu"><button data-command="browser">题面</button><button data-command="editSamples" ${this.busy ? 'disabled' : ''}>编辑样例</button><button data-command="language" ${this.busy ? 'disabled' : ''}>切换语言</button></div></details></nav></header>
${this.results.length && this.results[0].status !== 'CE' ? `<div class="overview" role="status">${passed} / ${p.samples.length} 组样例通过</div>` : ''}
${!p.samples.length ? '<p class="muted">暂无样例。打开「更多 → 编辑样例」添加。</p>' : ''}
${this.submission ? `<article role="status"><p>${esc(this.submission)}</p>${this.hasRecord ? '<button data-command="record">查看 OJ 提交记录</button>' : ''}</article>` : ''}
${this.results[0]?.status === 'CE' ? `<article>${badge(this.results[0])}${output(this.results[0])}</article>` : ''}
${p.samples.map((s, i) => `<article><h3 class="sample-title">样例 ${i + 1}${this.results[i] && this.results[i].status !== 'CE' ? badge(this.results[i]) : ''}</h3><label>输入</label><pre>${esc(s.input)}</pre><label>期望输出</label><pre>${esc(s.output)}</pre>${this.results[i] && this.results[i].status !== 'CE' ? output(this.results[i]) : ''}</article>`).join('')}
<footer><p class="muted">本地样例通过不等于 OJ 判题通过。</p><details><summary>题面文本备份</summary><pre>${esc(p.statement)}</pre></details></footer>
<script nonce="${nonce}">const vscode=acquireVsCodeApi();document.querySelectorAll('button[data-command]').forEach(b=>b.addEventListener('click',()=>{document.querySelector('.more')?.removeAttribute('open');vscode.postMessage({command:b.dataset.command})}));</script></body></html>`;
  }

  private renderEditor() {
    if (!this.panel || !this.record) return;
    const nonce = randomBytes(16).toString('hex');
    const data = JSON.stringify({ url: this.record.url, samples: this.record.samples }).replace(/</g, '\\u003c');
    this.panel.webview.html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'"><style nonce="${nonce}">
body{font:13px var(--vscode-font-family);padding:20px;color:var(--vscode-foreground)}article{margin:18px 0;padding:12px;border:1px solid var(--vscode-panel-border)}label{display:block;margin:8px 0}textarea{box-sizing:border-box;width:100%;min-height:100px;resize:vertical;background:var(--vscode-input-background);color:var(--vscode-input-foreground);font:13px var(--vscode-editor-font-family);border:1px solid var(--vscode-input-border);padding:8px}button{cursor:pointer;margin:4px;padding:8px 12px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:0;border-radius:4px}h1{font-size:17px;font-weight:550}p{color:var(--vscode-descriptionForeground)}</style>
<h1>编辑样例</h1><p>输入和输出保留空格与换行。保存后用于下一次测试。</p><div id="samples"></div><button id="add">添加样例</button><button id="save">保存样例</button><button id="discard">取消</button>
<script nonce="${nonce}">
const vscode=acquireVsCodeApi(), data=${data}, list=document.getElementById('samples');
function add(sample){const row=document.createElement('article'); for(const [field,title] of [['input','输入'],['output','期望输出']]){const label=document.createElement('label');label.textContent=title;const area=document.createElement('textarea');area.dataset.field=field;area.value=sample[field];label.append(area);row.append(label);} const remove=document.createElement('button');remove.textContent='删除样例';remove.onclick=()=>row.remove();row.append(remove);list.append(row);}
data.samples.forEach(add); document.getElementById('add').onclick=()=>add({input:'',output:''});
document.getElementById('save').onclick=()=>vscode.postMessage({command:'saveSamples',url:data.url,samples:[...list.children].map(row=>({input:row.querySelector('[data-field=input]').value,output:row.querySelector('[data-field=output]').value}))});
document.getElementById('discard').onclick=()=>vscode.postMessage({command:'discardSamples'});
</script></html>`;
  }
  dispose() { this.panel?.dispose(); }
}
