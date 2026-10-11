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
    const result = (r: TestResult) => `<div class="result ${r.status}">${r.status} <span>${r.elapsedMs} ms</span></div><label>实际输出</label><pre>${esc(r.stdout || '(空)')}</pre>${r.status === 'WA' ? `<label>预期输出</label><pre>${esc(r.expected)}</pre>` : ''}${r.stderr ? `<details open><summary>诊断信息</summary><pre>${esc(r.stderr)}</pre></details>` : ''}`;
    this.panel.webview.html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';"><style nonce="${nonce}">
body{font:13px var(--vscode-font-family);padding:20px;color:var(--vscode-foreground);background:var(--vscode-editor-background)}.tag{font-size:10px;letter-spacing:2px;color:#72cba3}h1{font-size:22px;line-height:1.4}nav{display:flex;gap:8px;flex-wrap:wrap;margin:20px 0}button{padding:9px 13px;border:1px solid var(--vscode-button-border,transparent);border-radius:6px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);cursor:pointer}button:disabled{opacity:.5}article{border:1px solid var(--vscode-panel-border);border-radius:10px;margin:16px 0;padding:16px}label,summary{font-size:11px;color:var(--vscode-descriptionForeground)}pre{white-space:pre-wrap;overflow-wrap:anywhere;padding:10px;background:var(--vscode-textCodeBlock-background);font:12px var(--vscode-editor-font-family)}.result{font-size:16px;font-weight:700;color:#efb174;padding-top:12px}.AC{color:#72cba3}.result span{float:right;font-size:12px;font-weight:400}.muted{color:var(--vscode-descriptionForeground);line-height:1.7}details{margin-top:16px}
</style></head><body><div class="tag">DSU IDE / ${esc(p.oj)} / 0.1.2</div><h1>${esc(p.title)}</h1><p class="muted">${esc(p.language)} · ${p.samples.length} 组样例</p><nav><button data-command="test" ${this.busy ? 'disabled' : ''}>${this.busy ? '测试中…' : '▶ 一键测试'}</button><button data-command="submit" ${this.busy ? 'disabled' : ''}>↑ 提交</button><button data-command="browser">题面</button><button data-command="editSamples" ${this.busy ? 'disabled' : ''}>编辑样例</button><button data-command="language" ${this.busy ? 'disabled' : ''}>切换语言</button>${this.busy ? '<button data-command="cancel">停止</button>' : ''}</nav>
${!p.samples.length ? '<p class="muted">尚无样例。可点击「编辑样例」添加；空样例不会被判为通过。</p>' : ''}
${this.submission ? `<article role="status"><p>${esc(this.submission)}</p>${this.hasRecord ? '<button data-command="record">查看 OJ 提交记录</button>' : ''}</article>` : ''}
${this.results[0]?.status === 'CE' ? result(this.results[0]) : ''}
${p.samples.map((s, i) => `<article><h3>样例 ${i + 1}</h3><label>输入</label><pre>${esc(s.input)}</pre><label>期望输出</label><pre>${esc(s.output)}</pre>${this.results[i] && this.results[i].status !== 'CE' ? result(this.results[i]) : ''}</article>`).join('')}
<p class="muted">样例通过仅代表本地样例结果。最终结果以 OJ 判题为准。</p><details><summary>题面文本备份</summary><pre>${esc(p.statement)}</pre></details>
<script nonce="${nonce}">const vscode=acquireVsCodeApi();document.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>vscode.postMessage({command:b.dataset.command})));</script></body></html>`;
  }
  private renderEditor() {
    if (!this.panel || !this.record) return;
    const nonce = randomBytes(16).toString('hex');
    const data = JSON.stringify({ url: this.record.url, samples: this.record.samples }).replace(/</g, '\\u003c');
    this.panel.webview.html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'"><style nonce="${nonce}">
body{font:13px var(--vscode-font-family);padding:20px;color:var(--vscode-foreground)}article{margin:18px 0;padding:12px;border:1px solid var(--vscode-panel-border)}label{display:block;margin:8px 0}textarea{box-sizing:border-box;width:100%;min-height:100px;resize:vertical;background:var(--vscode-input-background);color:var(--vscode-input-foreground);font:13px var(--vscode-editor-font-family);border:1px solid var(--vscode-input-border);padding:8px}button{cursor:pointer;margin:4px;padding:8px 12px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:0}p{color:var(--vscode-descriptionForeground)}</style>
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
