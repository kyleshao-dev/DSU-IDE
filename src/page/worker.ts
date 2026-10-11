import { fillSubmission } from './fill';
import type { Adapter } from '../core/types';
import type { SubmissionJob } from '../core/bridge';

async function rpc(op: string, payload?: unknown) {
  const { token, port = 27121 } = await chrome.storage.local.get(['token', 'port']);
  if (!token) throw new Error('请在扩展设置中填写 DSU IDE 配对令牌');
  if (!Number.isInteger(Number(port)) || Number(port) < 1024 || Number(port) > 65535) throw new Error('端口无效');
  const response = await fetch(`http://127.0.0.1:${port}/rpc`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ op, payload }), signal: AbortSignal.timeout(10000)
  });
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
chrome.action.onClicked.addListener(() => void chrome.runtime.openOptionsPage());
