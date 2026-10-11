import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

test('home opens a folder or a problem, safely renders metadata and keeps settings secondary', async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'dsu-home-'));
  try {
    const entry = path.join(folder, 'home.cjs');
    await build({ entryPoints: ['tests/e2e/native-entry.ts'], bundle: true, platform: 'node', format: 'cjs', alias: { vscode: path.resolve('tests/e2e/vscode.ts') }, outfile: entry });
    const { HomePanel, window: host } = createRequire(path.resolve('package.json'))(entry);
    let html = '', receive: (m: any) => void = () => {};
    const actions: { command: string; value?: string }[] = [];
    host.createWebviewPanel = () => ({
      webview: { get html() { return html; }, set html(v) { html = v; }, onDidReceiveMessage: (fn: typeof receive) => { receive = fn; } },
      onDidDispose() {}, reveal() {}, dispose() {}
    });
    const home = new HomePanel(async (command: string, value?: string) => { actions.push({ command, value }); });
    await page.exposeFunction('sendDSU', (m: any) => receive(m));
    await page.addInitScript(() => { (window as any).acquireVsCodeApi = () => ({ setState() {}, postMessage: (m: unknown) => (window as any).sendDSU(m) }); });
    await page.route('https://dsu-home.test/', route => route.fulfill({ contentType: 'text/html', body: html }));
    home.show(undefined, [], 'Python', '0.1.2'); await page.goto('https://dsu-home.test/');
    await expect(page.getByRole('button', { name: '打开做题文件夹' })).toBeVisible();
    await expect(page.getByLabel('题目链接')).toHaveCount(0);
    await page.getByRole('button', { name: '打开做题文件夹' }).click();
    await expect.poll(() => actions[0]?.command).toBe('openFolder');
    const record = { title: '<script>bad()</script> A+B', oj: 'Luogu', language: 'python', url: 'https://www.luogu.com.cn/problem/P1001?x=1&y=2' };
    home.show('practice', [record], 'Python', '0.1.2'); await page.goto('https://dsu-home.test/');
    await expect(page.getByRole('button', { name: 'OJ、语言与模板' })).toBeHidden();
    await expect(page.getByRole('button', { name: /bad/ })).toContainText(record.title);
    await page.getByLabel('题目链接').fill('https://atcoder.jp/contests/abc001/tasks/abc001_1');
    await page.getByRole('button', { name: '打开题目', exact: true }).click();
    await expect.poll(() => actions.at(-1)).toEqual({ command: 'openBrowser', value: 'https://atcoder.jp/contests/abc001/tasks/abc001_1' });
    await page.getByRole('button', { name: /bad/ }).click();
    await expect.poll(() => actions.at(-1)).toEqual({ command: 'openProblem', value: record.url });
    receive({ command: 'executeAnything', value: 'no' }); expect(actions).toHaveLength(3);
    await page.screenshot({ path: test.info().outputPath('home.png') });
    home.dispose();
  } finally { await rm(folder, { recursive: true, force: true }); }
});
