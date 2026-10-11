import { chromium, type BrowserContext, type Page, type Route } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { defaultConfig } from '../../src/core/config';
import { createBridge, makeToken, SubmissionQueue, type RpcHandler, type SubmissionJob } from '../../src/core/bridge';
import { importProblem } from '../../src/core/problems';
import { submissionFor } from '../../src/page/extract';
import { validateReceipt } from '../../src/core/submission';
import type { ProblemRecord, SubmissionResult } from '../../src/core/types';

export type Transport = 'extension' | 'native-cdp';
export const luoguUrl = 'https://www.luogu.com.cn/problem/P1001';
export const cfUrl = 'https://codeforces.com/problemset/problem/1/A';
export const cfSubmit = 'https://codeforces.com/contest/1/submit';
const luoguData = {
  template: 'problem.show', user: { uid: 123 }, data: { contest: null, problem: {
    pid: 'P1001', name: 'A+B Browser Test', content: { description: 'Add two integers.', formatI: 'Two integers.', formatO: 'The sum.' },
    acceptLanguages: [27], samples: [['20 30\n', '50\n']]
  } }
};
const layout = (body: string) => `<!doctype html><meta charset="utf-8"><style>body{font:16px system-ui;max-width:850px;margin:80px auto;background:#f3f5f4;color:#18362b}pre{background:white;padding:16px}h1{font-size:32px}</style>${body}`;
const luoguHTML = () => layout(`<h1>P1001 · A+B Browser Test</h1><p>Browser integration fixture · no live OJ requests</p><pre>20 30 → 50</pre><meta name="csrf-token" content="fixture-csrf"><script id="lentille-context" type="application/json">${JSON.stringify(luoguData)}</script>`);
const cfHTML = layout('<div class="problem-statement"><h1 class="title">A. Browser Sum</h1><p>Add two integers.</p><div class="sample-test"><div class="input"><pre>20 30</pre></div><div class="output"><pre>50</pre></div></div></div>');
const cfForm = layout('<h1>Submit fixture</h1><form action="/contest/1/submit" method="post"><select name="submittedProblemIndex"><option value="A">A</option></select><select name="programTypeId"><option value="89">GNU G++20 (64 bit)</option></select><textarea name="source"></textarea><input class="submit" type="submit" value="Submit"></form>');

export async function createHarness(transport: Transport) {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'dsu-browser-test-'));
  const queue = new SubmissionQueue();
  const jobs = new Map<string, SubmissionJob>();
  const imports: ProblemRecord[] = [];
  const receipts: SubmissionResult[] = [];
  const posts: { url: string; body: string; headers: Record<string, string> }[] = [];
  const logs: string[] = [];
  let mode: 'accepted' | 'captcha' = 'accepted';
  const token = makeToken();
  const handler: RpcHandler = async (op, value) => {
    const payload = value as any;
    if (op === 'adapters') return defaultConfig.adapters;
    if (op === 'import') {
      const record = await importProblem(folder, payload, defaultConfig);
      imports.push(record); return { file: record.file };
    }
    if (op === 'claim') return queue.claim(payload.url);
    if (op === 'submissionResult') {
      const job = jobs.get(payload.id);
      if (!job || payload.url !== job.url) throw new Error('Unknown receipt');
      receipts.push(validateReceipt(job, payload)); jobs.delete(job.id); return true;
    }
    throw new Error(`Unexpected operation ${op}`);
  };
  const server = await createBridge(token, handler, 0);
  const port = (server.address() as { port: number }).port;
  let context: BrowserContext | undefined;
  let integration: { dispose(): void; open(url: string): Promise<void> } | undefined;
  const close = async () => {
    integration?.dispose();
    await context?.close();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(folder, { recursive: true, force: true });
  };
  try {
    const extension = path.resolve('dist/browser');
    context = await chromium.launchPersistentContext(path.join(folder, 'profile'), {
      channel: 'chromium', headless: true, viewport: { width: 1200, height: 800 },
      args: transport === 'extension' ? [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] : []
    });
    const route = async (route: Route) => {
      const request = route.request(), u = new URL(request.url());
      if (u.hostname === '127.0.0.1' || u.protocol === 'chrome-extension:') return route.continue();
      const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      const html = (body: string) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body });
      if (u.hostname === 'www.luogu.com.cn') {
        if (u.pathname === '/problem/P1001') return html(luoguHTML());
        if (u.pathname === '/_lfe/config') return json({ CodeLanguage: { '27': { id: 27, disabled: false, canO2: true } } });
        if (u.pathname === '/fe/api/problem/submit/P1001' && request.method() === 'POST') {
          posts.push({ url: u.href, body: request.postData() || '', headers: request.headers() });
          return mode === 'captcha' ? json({ errorType: 'CaptchaNotMatchException' }, 403) : json({ rid: 876543 });
        }
      }
      if (u.hostname === 'codeforces.com') {
        if (u.pathname === '/problemset/problem/1/A') return html(cfHTML);
        if (u.pathname === '/contest/1/submit') {
          if (request.method() === 'POST') {
            posts.push({ url: u.href, body: request.postData() || '', headers: request.headers() });
            return html('<h1>Fixture submission received</h1>');
          }
          return html(cfForm);
        }
      }
      if (u.hostname === 'vjudge.net') return html(layout('<h1 id="prob-title">A</h1><a id="source" href="https://codeforces.com/problemset/problem/1/A">Origin</a>'));
      // All OJ requests are fulfilled locally or blocked, including unexpected endpoints.
      return route.abort('blockedbyclient');
    };
    await context.route('**/*', route);
    const page = await context.newPage();
    let pair: ((value?: string) => Promise<Page>) | undefined;
    if (transport === 'extension') {
      const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
      const id = new URL(worker.url()).host;
      pair = async (value = token) => {
        const options = await context!.newPage();
        await options.goto(`chrome-extension://${id}/options.html`);
        await options.locator('#token').fill(value); await options.locator('#port').fill(String(port));
        await options.getByRole('button', { name: '保存并测试连接' }).click();
        return options;
      };
    } else {
      const entry = path.join(folder, 'native.cjs');
      await build({ entryPoints: ['tests/e2e/native-entry.ts'], bundle: true, platform: 'node', format: 'cjs', alias: { vscode: path.resolve('tests/e2e/vscode.ts') }, outfile: entry });
      const { BrowserIntegration, window: editorWindow, EventEmitter } = createRequire(path.resolve('package.json'))(entry);
      const tabs = new Map<Page, any>();
      const opened = new EventEmitter(), changed = new EventEmitter(), closed = new EventEmitter();
      const register = (p: Page) => {
        const tab = { get url() { return p.url(); }, startCDPSession: async () => {
          const cdp = await context!.newCDPSession(p);
          const messages = new EventEmitter(), end = new EventEmitter();
          cdp.on('Runtime.bindingCalled', params => messages.fire({ method: 'Runtime.bindingCalled', params, sessionId: 'test-page' }));
          return {
            onDidReceiveMessage: messages.event, onDidClose: end.event,
            sendMessage: async (m: any) => {
              try {
                const result = m.method === 'Target.getTargets' ? { targetInfos: [{ type: 'page', targetId: 'test-target', url: p.url() }] } :
                  m.method === 'Target.attachToTarget' ? { sessionId: 'test-page' } : await cdp.send(m.method, m.params);
                messages.fire({ id: m.id, result });
              } catch (e) { messages.fire({ id: m.id, error: { message: (e as Error).message } }); }
            },
            close: async () => { end.fire(undefined); await cdp.detach().catch(() => {}); }
          };
        } };
        tabs.set(p, tab);
        p.on('framenavigated', frame => { if (frame === p.mainFrame()) changed.fire(tab); });
        p.on('close', () => { tabs.delete(p); closed.fire(tab); });
        opened.fire(tab); return tab;
      };
      Object.assign(editorWindow, {
        browserTabs: [], onDidOpenBrowserTab: opened.event, onDidChangeBrowserTabState: changed.event, onDidCloseBrowserTab: closed.event,
        openBrowserTab: async (url: string) => { const p = await context!.newPage(); const tab = register(p); await p.goto(url); return tab; }
      });
      integration = new BrowserIntegration(path.resolve('packages/dsu-ide'), handler, async () => defaultConfig.adapters, (message: string) => logs.push(message));
      (integration as any).start(); register(page);
    }
    return {
      context, page, folder, token, port, imports, receipts, posts, logs, pair, close,
      setMode(value: typeof mode) { mode = value; },
      enqueue(url: string, code = 'int main() { return 0; }') {
        const adapter = defaultConfig.adapters.find(a => a.hosts.includes(new URL(url).hostname))!;
        const job = queue.enqueue(submissionFor(url, code, 'cpp', adapter)); jobs.set(job.id, job); return job;
      },
      async importedCode(index = 0) { return readFile(path.join(folder, imports[index].file), 'utf8'); }
    };
  } catch (e) { await close(); throw e; }
}
