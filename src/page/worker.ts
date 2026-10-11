import { fillSubmission } from './fill';
import type { Adapter } from '../core/types';
import type { SubmissionJob } from '../core/bridge';
import { matchAdapter } from './extract';

async function rpc(op: string, payload?: unknown) {
  const { token, port = 27121 } = await chrome.storage.local.get(['token', 'port']);
  if (!token) throw new Error('请在扩展设置中填写 DSU IDE 配对令牌');
  if (!Number.isInteger(Number(port)) || Number(port) < 1024 || Number(port) > 65535) throw new Error('端口无效');
  let response: Response;
  try { response = await fetch(`http://127.0.0.1:${port}/rpc`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ op, payload }), signal: AbortSignal.timeout(10000)
  }); } catch { throw new Error('无法连接 IDE。请启动 DSU IDE、打开做题文件夹，并检查配对端口。'); }
  if (response.status === 401) throw new Error('配对令牌不正确');
  const body = await response.json(); if (!body.ok) throw new Error(body.error); return body.result;
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void (async () => {
    const { op, payload } = message;
    // Options opened in a browser tab can also have sender.tab. Identify our
    // own settings page by its runtime URL, not by the absence of a tab.
    if (sender.id === chrome.runtime.id && sender.url === chrome.runtime.getURL('options.html')) {
      if (op === 'adapters') return rpc(op);
      throw new Error('只允许题目页面调用');
    }
    if (sender.id === chrome.runtime.id && sender.url === chrome.runtime.getURL('popup.html')) {
      if (op === 'companionStatus') {
        const adapters: Adapter[] = await rpc('adapters');
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        const url = tab?.url;
        if (!url || !/^https?:\/\//.test(url)) return { count: adapters.length, supported: false, hint: '请打开支持的 OJ 题目页。自定义站点需先在连接设置中授权。' };
        const adapter = matchAdapter(url, adapters);
        const site = adapter || adapters.find(a => a.hosts.includes(new URL(url).hostname));
        return { count: adapters.length, tabId: tab.id, url, supported: Boolean(adapter), site: site?.name,
          original: adapter?.id === 'VJudge', hint: adapter ? (adapter.id === 'VJudge' ? '先跳转到原站，再按原站归档代码与样例。' : '导入题面与样例，已有代码会保留。') : '当前不是已配置的题目页。请打开题目，或在 IDE 添加 OJ 配置。' };
      }
      if (op === 'importActive') {
        if (!Number.isInteger(payload?.tabId)) throw new Error('请重新打开扩展面板');
        const tab = await chrome.tabs.get(payload.tabId);
        if (!tab.url || tab.url !== payload.url) throw new Error('页面已变化，请重新检查后导入');
        const adapters: Adapter[] = await rpc('adapters');
        const adapter = matchAdapter(tab.url, adapters);
        if (!adapter) throw new Error('当前不是已配置的题目页');
        const message = { op: 'dsu.import', url: tab.url };
        let reply;
        try { reply = await chrome.tabs.sendMessage(tab.id!, message, { frameId: 0 }); }
        catch (error) {
          if (!/Receiving end does not exist/i.test((error as Error).message)) throw new Error('导入通信中断，请先检查 IDE 中的文件，再重新检查页面');
          // Existing tabs after installation need the bundled content script once.
          await chrome.scripting.executeScript({ target: { tabId: tab.id! }, files: ['page.js'] });
          reply = await chrome.tabs.sendMessage(tab.id!, message, { frameId: 0 });
        }
        if (!reply?.ok) throw new Error(reply?.error || '页面未响应，请刷新题目页后重试');
        if (adapter.id === 'VJudge') {
          const target = new URL(reply.result?.original);
          if (!['http:', 'https:'].includes(target.protocol) || !matchAdapter(target.href, adapters)) throw new Error('原站题目未配置');
          await chrome.tabs.update(tab.id!, { url: target.href });
          return { redirected: true };
        }
        return reply.result;
      }
      throw new Error('不允许的面板操作');
    }
    if (!sender.tab) throw new Error('只允许题目页面调用');
    const page = new URL(sender.url || sender.tab.url || '');
    const adapters: Adapter[] = await rpc('adapters');
    if (!adapters.some(a => a.hosts.includes(page.hostname))) throw new Error('页面不在 OJ 配置中');
    if (op === 'import' && payload?.url !== page.href) throw new Error('题目地址与当前页面不一致');
    if (op === 'claim' && payload?.url !== page.href) throw new Error('提交页地址不一致');
    if (op === 'openOriginal') {
      if (page.hostname !== 'vjudge.net') throw new Error('仅允许 VJudge 跳转');
      const target = new URL(payload.url);
      if (!['http:', 'https:'].includes(target.protocol) || !adapters.some(a => a.hosts.includes(target.hostname))) throw new Error('原站未配置');
      await chrome.tabs.update(sender.tab.id!, { url: target.href }); return true;
    }
    if (op === 'fill') {
      // Never accept arbitrary code/selector jobs from a content script: use the worker's claimed copy.
      const key = `claim:${sender.tab.id}`;
      const data = await chrome.storage.session.get(key); const job = data[key] as SubmissionJob | undefined;
      await chrome.storage.session.remove(key);
      if (!job || job.id !== payload?.id || job.expires < Date.now() || new URL(job.url).origin !== page.origin) throw new Error('提交任务过期或不属于此页面');
      const results = await chrome.scripting.executeScript({ target: { tabId: sender.tab.id! }, world: 'MAIN', func: fillSubmission, args: [job] });
      return results[0]?.result || { ok: false, state: 'unknown', error: '提交脚本没有返回结果，请先检查 OJ 提交记录' };
    }
    if (!['adapters', 'import', 'claim', 'submissionResult'].includes(op)) throw new Error('不允许的操作');
    const result = await rpc(op, payload);
    if (op === 'claim' && result) await chrome.storage.session.set({ [`claim:${sender.tab.id}`]: result });
    return result;
  })().then(result => sendResponse({ ok: true, result }), error => sendResponse({ ok: false, error: error.message }));
  return true;
});
chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === 'install') void chrome.runtime.openOptionsPage();
});
