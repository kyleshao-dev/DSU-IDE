import * as vscode from 'vscode';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Adapter } from '../core/types';
import { fillSubmission } from '../page/fill';
import type { RpcHandler, SubmissionJob } from '../core/bridge';

class CDP implements vscode.Disposable {
  private id = 0;
  private pending = new Map<number, { resolve(v: any): void; reject(e: Error): void; timer: NodeJS.Timeout }>();
  private events = new vscode.EventEmitter<any>();
  readonly onEvent = this.events.event;
  private listener: vscode.Disposable;
  private closer: vscode.Disposable;
  constructor(readonly session: vscode.BrowserCDPSession) {
    this.listener = session.onDidReceiveMessage((raw: any) => {
      const m = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (m.id) {
        const p = this.pending.get(m.id); if (!p) return;
        clearTimeout(p.timer); this.pending.delete(m.id);
        if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result);
      } else this.events.fire(m);
    });
    this.closer = session.onDidClose(() => this.dispose());
  }
  send(method: string, params: unknown = {}, sessionId?: string, timeoutMs = 10000): Promise<any> {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`浏览器操作超时：${method}`)); }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      void this.session.sendMessage({ id, method, params, ...(sessionId ? { sessionId } : {}) }).then(undefined, e => {
        clearTimeout(timer); this.pending.delete(id); reject(e);
      });
    });
  }
  dispose() {
    this.listener.dispose(); this.closer.dispose(); this.events.dispose();
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('浏览器已关闭')); }
    this.pending.clear();
  }
}

export class BrowserIntegration implements vscode.Disposable {
  private sessions = new Map<vscode.BrowserTab, CDP>();
  private attaching = new Set<vscode.BrowserTab>();
  private disposables: vscode.Disposable[] = [];
  private disposed = false;
  constructor(private extensionPath: string, private rpc: RpcHandler, private adapters: () => Promise<Adapter[]>, private log: (s: string) => void) {}
  start() {
    if (!vscode.window.onDidOpenBrowserTab) { this.log('当前编辑器不提供 browser 提案 API；使用定制 Code OSS 或外部浏览器扩展。'); return; }
    const attach = (tab: vscode.BrowserTab) => void this.attach(tab).catch(e => this.log(`浏览器连接失败：${e.message}`));
    this.disposables.push(vscode.window.onDidOpenBrowserTab(attach), vscode.window.onDidChangeBrowserTabState(attach), vscode.window.onDidCloseBrowserTab(tab => { this.sessions.get(tab)?.dispose(); this.sessions.delete(tab); }));
    vscode.window.browserTabs.forEach(attach);
  }
  async open(url: string) {
    if (vscode.window.openBrowserTab) {
      const tab = await vscode.window.openBrowserTab(url, { viewColumn: vscode.ViewColumn.Two }); await this.attach(tab);
    } else await vscode.commands.executeCommand('simpleBrowser.show', url);
  }
  private async attach(tab: vscode.BrowserTab) {
    if (this.disposed || this.sessions.has(tab) || this.attaching.has(tab)) return;
    let u: URL; try { u = new URL(tab.url); } catch { return; }
    this.attaching.add(tab);
    let cdp: CDP | undefined;
    try {
      if (!(await this.adapters()).some(a => a.hosts.includes(u.hostname)) || this.disposed) return;
      cdp = new CDP(await tab.startCDPSession());
      const targets = await cdp.send('Target.getTargets');
      const target = targets.targetInfos.find((t: any) => t.type === 'page');
      if (!target) throw new Error('未找到浏览器页面');
      const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
      const client = cdp;
      let claimed: SubmissionJob | undefined;
      client.onEvent(async event => {
        if (event.method !== 'Runtime.bindingCalled' || event.params.name !== 'dsuBridge' || event.sessionId !== sessionId) return;
        const contextId = event.params.executionContextId;
        let message: any;
        try {
          if (event.params.payload.length > 2_000_000) throw new Error('消息过大');
          message = JSON.parse(event.params.payload);
          const { op, payload } = message;
          const pageUrl = new URL(tab.url);
          const adapters = await this.adapters();
          if (!adapters.some(a => a.hosts.includes(pageUrl.hostname))) throw new Error('当前页面不是已配置 OJ');
          if (['claim', 'import'].includes(op) && payload?.url !== pageUrl.href) throw new Error('页面地址不一致');
          let result;
          if (op === 'fill') {
            const job = claimed; claimed = undefined;
            if (!job || job.id !== payload?.id || job.expires < Date.now()) throw new Error('提交任务无效或过期');
            const evaluation = await client.send('Runtime.evaluate', { expression: `(${fillSubmission.toString()})(${JSON.stringify(job)})`, returnByValue: true, awaitPromise: true }, sessionId, 25000);
            if (evaluation.exceptionDetails) throw new Error('提交脚本运行失败');
            result = evaluation.result.value;
          } else if (op === 'openOriginal') {
            if (pageUrl.hostname !== 'vjudge.net') throw new Error('仅允许 VJudge 跳转');
            const target = new URL(payload.url);
            if (!['http:', 'https:'].includes(target.protocol) || !adapters.some(a => a.hosts.includes(target.hostname))) throw new Error('原站未配置');
            await this.open(target.href); result = true;
          } else {
            result = await this.rpc(op, payload);
            if (op === 'claim') claimed = result as SubmissionJob || undefined;
          }
          await client.send('Runtime.evaluate', { contextId, expression: `globalThis.dsuNativeReply(${JSON.stringify(message.id)},${JSON.stringify({ ok: true, result })})` }, sessionId);
        } catch (e) {
          this.log((e as Error).message);
          if (message?.id) void client.send('Runtime.evaluate', { contextId, expression: `globalThis.dsuNativeReply(${JSON.stringify(message.id)},${JSON.stringify({ ok: false, error: (e as Error).message })})` }, sessionId).catch(() => {});
        }
      });
      await client.send('Page.enable', {}, sessionId);
      await client.send('Runtime.enable', {}, sessionId);
      await client.send('Runtime.addBinding', { name: 'dsuBridge', executionContextName: 'dsu-ide' }, sessionId);
      const bundle = await readFile(path.join(this.extensionPath, 'dist/page.js'), 'utf8');
      const source = `if(!globalThis.dsuNativeCall){const pending=new Map();let next=0;globalThis.dsuNativeReply=(id,r)=>{const p=pending.get(id);if(p){pending.delete(id);clearTimeout(p.timer);r.ok?p.resolve(r.result):p.reject(new Error(r.error))}};globalThis.dsuNativeCall=(op,payload)=>new Promise((resolve,reject)=>{const id=++next;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('DSU 操作超时'))},30000);pending.set(id,{resolve,reject,timer});globalThis.dsuBridge(JSON.stringify({id,op,payload}))});}\n${bundle}`;
      await client.send('Page.addScriptToEvaluateOnNewDocument', { source, worldName: 'dsu-ide', runImmediately: true }, sessionId);
      if (this.disposed) { client.dispose(); await client.session.close(); return; }
      this.sessions.set(tab, client);
    } catch (e) { cdp?.dispose(); if (cdp) void cdp.session.close(); throw e; }
    finally { this.attaching.delete(tab); }
  }
  dispose() { this.disposed = true; for (const d of this.disposables) d.dispose(); for (const c of this.sessions.values()) { c.dispose(); void c.session.close(); } this.sessions.clear(); }
}
