import { parsePairing } from './connection.js';
const $ = id => document.getElementById(id);
$('version').textContent = chrome.runtime.getManifest().version;
let busy = false;
async function testConnection() {
  try { const r = await chrome.runtime.sendMessage({ op: 'adapters' }); $('status').textContent = r.ok ? `已连接 · ${r.result.length} 个 OJ 配置。现在打开题目页，点击页面按钮或工具栏图标即可导入。` : r.error; }
  catch (e) { $('status').textContent = e.message; }
}
$('disconnect').addEventListener('click', async () => {
  await chrome.storage.local.remove('token');
  $('token').value = '';
  $('status').textContent = '已断开配对。重新连接前不会导入题目或领取提交任务。';
});
chrome.storage.local.get(['token', 'port']).then(v => {
  $('token').value = v.token || ''; $('port').value = v.port || 27121;
  if (v.token) void testConnection();
});
$('connect').addEventListener('submit', async e => {
  e.preventDefault();
  if (busy) return;
  busy = true; const submit = $('connect').querySelector('button'); submit.disabled = true;
  try {
    const data = parsePairing($('token').value, $('port').value);
    await chrome.storage.local.set(data);
    $('token').value = data.token; $('port').value = data.port;
    $('status').textContent = '正在检查连接…'; await testConnection();
  }
  catch (e) { $('status').textContent = e.message; }
  finally { busy = false; submit.disabled = false; }
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
    $('status').textContent = '已授权。点击工具栏 DSU 图标即可导入；也可刷新页面使用题目按钮。';
  } catch (e) { $('status').textContent = e.message; }
});
