const $ = id => document.getElementById(id);
$('version').textContent = chrome.runtime.getManifest().version;
let current, checking = false, importing = false;
async function check() {
  if (checking || importing) return;
  checking = true; current = undefined; $('import').disabled = true;
  $('connection').textContent = '正在检查连接…'; $('result').textContent = '';
  try {
    const reply = await chrome.runtime.sendMessage({ op: 'companionStatus' });
    if (!reply?.ok) throw new Error(reply?.error || '无法检查连接，请重新加载扩展');
    current = reply.result;
    $('connection').textContent = `已连接 · ${current.count} 个 OJ 配置`;
    $('site').textContent = current.site || '当前页面';
    $('hint').textContent = current.hint;
    $('import').textContent = current.original ? '打开原站题目' : '导入当前题目';
    $('import').disabled = !current.supported;
  } catch (error) {
    $('connection').textContent = '尚未连接'; $('site').textContent = '连接 DSU IDE';
    $('hint').textContent = error.message; current = undefined;
  } finally { checking = false; }
}
$('import').addEventListener('click', async () => {
  if (!current?.supported || importing) return;
  importing = true; $('import').disabled = true; $('result').textContent = '正在读取题目与样例…';
  try {
    const reply = await chrome.runtime.sendMessage({ op: 'importActive', payload: { tabId: current.tabId, url: current.url } });
    if (!reply?.ok) throw new Error(reply?.error || '导入失败，请重试');
    $('result').textContent = reply.result.redirected ? '已打开原站，重新打开面板即可导入。' : `已导入：${reply.result.file}`;
    if (reply.result.redirected) current.supported = false;
  } catch (error) { $('result').textContent = error.message; }
  finally { importing = false; $('import').disabled = !current?.supported; }
});
$('retry').addEventListener('click', () => void check());
$('settings').addEventListener('click', () => void chrome.runtime.openOptionsPage());
void check();
