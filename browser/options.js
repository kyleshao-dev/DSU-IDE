const $ = id => document.getElementById(id);
chrome.storage.local.get(['token', 'port']).then(v => { $('token').value = v.token || ''; $('port').value = v.port || 27121; });
$('connect').addEventListener('submit', async e => {
  e.preventDefault();
  await chrome.storage.local.set({ token: $('token').value.trim(), port: Number($('port').value) });
  try { const r = await chrome.runtime.sendMessage({ op: 'adapters' }); $('status').textContent = r.ok ? `已连接 · ${r.result.length} 个 OJ 配置。请刷新题目页面。` : r.error; }
  catch (e) { $('status').textContent = e.message; }
});
$('authorize').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    const url = new URL($('origin').value);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('只支持 HTTP/HTTPS');
    const pattern = `${url.origin}/*`;
    if (!await chrome.permissions.request({ origins: [pattern] })) throw new Error('未授权');
    const id = `dsu-${url.protocol.replace(':', '')}-${url.hostname.replace(/\./g, '-')}`;
    const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [id] });
    if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: [id] });
    await chrome.scripting.registerContentScripts([{ id, matches: [pattern], js: ['page.js'], runAt: 'document_idle', persistAcrossSessions: true }]);
    $('status').textContent = '已授权。请刷新题目页面。';
  } catch (e) { $('status').textContent = e.message; }
});
