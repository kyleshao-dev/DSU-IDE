import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkout = await realpath(path.join(root, 'vendor/code-oss'));
const product = JSON.parse(await readFile(path.join(checkout, 'product.json'), 'utf8'));
const packaged = path.join(path.dirname(checkout), `VSCode-${process.platform}-${process.arch}`);
let executablePath;
if (process.platform === 'darwin') {
  const name = (await readdir(packaged)).find(n => n.endsWith('.app'));
  executablePath = path.join(packaged, name, 'Contents/MacOS', product.nameShort);
} else executablePath = path.join(packaged, process.platform === 'win32' ? product.nameShort + '.exe' : product.applicationName);
const temp = await mkdtemp(path.join(os.tmpdir(), 'dsu-workbench-'));
const workspace = path.join(temp, 'workspace');
const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<!doctype html><title>A+B</title><style>body{font:16px system-ui;max-width:640px;margin:40px auto;padding:20px}pre{padding:16px;background:#eee}</style><h1>A+B</h1><article><p>读入两个整数，输出它们的和。</p></article><h2>样例</h2><pre class="input">20 30\n</pre><pre class="output">50\n</pre>'); });
let app;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/problem/A`;
  await mkdir(path.join(workspace, '.dsu/problems'), { recursive: true });
  await mkdir(path.join(workspace, 'Local'), { recursive: true });
  const cfg = JSON.parse(await readFile(path.join(root, 'config/defaults.json'), 'utf8'));
  cfg.defaultLanguage = 'javascript'; cfg.languages.find(l => l.id === 'javascript').run = [process.execPath, '{source}'];
  cfg.adapters.push({ id: 'Local', name: '本地测试', hosts: ['127.0.0.1'], problemPattern: '^/problem/(A)$', title: 'h1', statement: 'article', inputs: '.input', outputs: '.output' });
  await writeFile(path.join(workspace, '.dsu/config.json'), JSON.stringify(cfg));
  await writeFile(path.join(workspace, 'Local/A+B.js'), "const fs = require('fs');\nconst [a, b] = fs.readFileSync(0, 'utf8').trim().split(/\\s+/).map(Number);\nconsole.log(a + b);\n");
  const record = { oj: 'Local', id: 'A', title: 'A+B', url, statement: '读入两个整数，输出它们的和。', samples: [{ input: '20 30\n', output: '50\n' }], language: 'javascript', file: 'Local/A+B.js' };
  await writeFile(path.join(workspace, '.dsu/problems', createHash('sha256').update(url).digest('hex').slice(0, 24) + '.json'), JSON.stringify(record));
  const args = [workspace, '--user-data-dir=' + path.join(temp, 'profile'), '--extensions-dir=' + path.join(temp, 'extensions'), '--skip-welcome', '--skip-release-notes', '--disable-workspace-trust', '--use-inmemory-secretstorage'];
  if (process.platform === 'linux' && process.env.CI) args.push('--no-sandbox');
  app = await electron.launch({ executablePath, args, timeout: 60000 });
  const window = await app.firstWindow();
  const frameWith = async (selector) => {
    let found;
    await expect.poll(async () => {
      for (const frame of window.frames()) if (await frame.locator(selector).count().catch(() => 0)) { found = frame; return true; }
      return false;
    }, { timeout: 60000 }).toBe(true);
    return found;
  };
  const home = await frameWith('button.problem');
  await home.locator('button.problem').click();
  let samples = await frameWith('button[data-command=test]');
  await samples.getByRole('button', { name: '一键测试' }).click();
  samples = await frameWith('.overview');
  await expect(samples.getByText('1 / 1 组样例通过')).toBeVisible({ timeout: 30000 });
  await expect(samples.locator('.result.AC')).toContainText('AC');
  await expect(samples.locator('details.output')).not.toHaveAttribute('open', '');
  const output = path.join(root, 'dist/validation'); await mkdir(output, { recursive: true });
  await window.screenshot({ path: path.join(output, 'workbench-ac.png') });
  await samples.getByLabel('更多操作').click();
  await samples.getByRole('button', { name: '编辑样例' }).click();
  const editor = await frameWith('#samples textarea');
  await expect(editor.locator('textarea')).toHaveCount(2);
  await editor.getByRole('button', { name: '取消', exact: true }).click();
  await writeFile(path.join(output, 'workbench-smoke.json'), JSON.stringify({ homeOpensProblem: true, sampleButton: 'AC', compactOutput: true, sampleEditor: true }, null, 2));
} catch (error) {
  if (app) {
    const windows = app.windows();
    if (windows[0]) {
      await windows[0].screenshot({path:path.join(root,'dist/validation/workbench-failure.png')});
      for (const frame of windows[0].frames()) console.error((await frame.locator('body').innerText().catch(()=>'')).slice(-1500));
    }
  }
  throw error;
} finally {
  await app?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  await rm(temp, { recursive: true, force: true });
}
