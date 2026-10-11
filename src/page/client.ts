import type { Adapter, Problem } from '../core/types';
import { readProblem, matchAdapter, resolveVJudge } from './extract';
import { receiptMessage, validateReceipt } from '../core/submission';
type Call = (op: string, payload?: unknown) => Promise<any>;
declare global { var dsuNativeCall: Call | undefined; var dsuPageInstalled: boolean | undefined }

if (window.top === window.self && !globalThis.dsuPageInstalled) {
  globalThis.dsuPageInstalled = true;
  const call: Call = globalThis.dsuNativeCall || (async (op, payload) => {
    const reply = await chrome.runtime.sendMessage({ op, payload });
    if (!reply?.ok) throw new Error(reply?.error || '请在扩展设置中连接 DSU IDE');
    return reply.result;
  });
  let adapters: Adapter[] = [], loaded = false, pending = false, importing = false, currentUrl = '';
  let button: HTMLButtonElement | undefined;
  let buttonHost: HTMLDivElement | undefined;
  const status = (message: string) => {
    if (button?.isConnected) { button.textContent = message; button.title = message; return; }
    let notice = document.getElementById('dsu-ide-status');
    if (!notice) {
      notice = document.createElement('div'); notice.id = 'dsu-ide-status'; notice.setAttribute('role', 'status');
      Object.assign(notice.style, { position: 'fixed', right: '20px', bottom: '22px', zIndex: '2147483647', maxWidth: '360px', padding: '16px', color: '#fff', background: '#126b52', borderRadius: '12px', font: '14px system-ui' });
      document.documentElement.append(notice);
    }
    notice.textContent = message;
  };
  async function importCurrent(deferOriginal = false) {
    if (importing) throw new Error('正在导入，请稍候');
    importing = true;
    if (button) button.disabled = true;
    status('正在读取题目与样例…');
    try {
      // A manual retry also reconnects immediately and picks up edited OJ settings.
      adapters = await call('adapters'); loaded = true;
      const a = matchAdapter(location.href, adapters);
      if (!a) throw new Error('此页面没有匹配的 OJ 配置');
      if (a.id === 'VJudge') {
        const original = resolveVJudge(document, location.href, a);
        if (!original) throw new Error('无法解析 VJudge 原站地址，请打开题目来源链接');
        if (deferOriginal) return { original };
        await call('openOriginal', { url: original }); status('已打开原站，请在原站创建题目'); return { redirected: true };
      }
      const problem: Problem = await readProblem(document, location.href, a);
      const result = await call('import', problem);
      status(`✓ ${result.file}`); return result;
    } catch (e) { status((e as Error).message); throw e; }
    finally { importing = false; if (button) button.disabled = false; }
  }
  function mount() {
    const supported = Boolean(matchAdapter(location.href, adapters));
    if (!supported) { buttonHost?.remove(); button = undefined; return; }
    if (button?.isConnected) return;
    const host = document.createElement('div'); host.id = 'dsu-ide-button'; buttonHost = host;
    Object.assign(host.style, { position: 'fixed', right: '20px', bottom: '22px', zIndex: '2147483647' });
    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = 'button{font:600 14px system-ui;background:#126b52;color:white;border:1px solid #72d8ac;border-radius:6px;padding:11px 16px;cursor:pointer;max-width:360px;text-align:left}button:hover{background:#198261}button:disabled{opacity:.6;cursor:wait}button:focus-visible{outline:2px solid #72d8ac;outline-offset:3px}';
    button = document.createElement('button'); button.textContent = matchAdapter(location.href, adapters)?.id === 'VJudge' ? '↗ 打开原站题目' : '＋ 在 DSU IDE 创建题目';
    button.addEventListener('click', event => { if (event.isTrusted) void importCurrent().catch(() => {}); });
    shadow.append(style, button); document.documentElement.append(host);
  }
  async function tick() {
    if (pending || importing) return; pending = true;
    try {
      if (!loaded) { adapters = await call('adapters'); loaded = true; buttonHost?.remove(); button = undefined; }
      if (currentUrl !== location.href || !button?.isConnected) { currentUrl = location.href; mount(); }
      if (adapters.some(a => a.hosts.includes(location.hostname) && a.submit)) {
        const job = await call('claim', { url: location.href });
        if (job) {
          let result;
          try { result = validateReceipt(job, await call('fill', { id: job.id })); }
          catch { result = { ok: false as const, state: 'unknown' as const, error: '提交执行或通信异常，结果未知。请先查看 OJ 提交记录' }; }
          status(receiptMessage(result));
          await call('submissionResult', { id: job.id, url: job.url, ...result });
        }
      }
    } catch (e) {
      if (!loaded) {
        // A visible reconnect affordance is useful when IDE starts after the page.
        if (!button && document.documentElement) {
          adapters = [{ id: 'connect', name: 'connect', hosts: [location.hostname], problemPattern: '.', title: 'h1', statement: 'body', inputs: 'pre', outputs: 'pre' }];
          mount();
        }
        status('DSU IDE 未连接 · 请检查扩展设置');
      } else status((e as Error).message);
    } finally { pending = false; }
  }
  if (!globalThis.dsuNativeCall) chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id || sender.tab || message?.op !== 'dsu.import') return;
    if (message.url !== location.href) { sendResponse({ ok: false, error: '页面已变化，请重新检查后导入' }); return; }
    void importCurrent(true).then(result => sendResponse({ ok: true, result }), error => sendResponse({ ok: false, error: error.message }));
    return true;
  });
  void tick(); setInterval(() => void tick(), 2500);
}
