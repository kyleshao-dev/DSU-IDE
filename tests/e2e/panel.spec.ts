import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { defaultConfig } from '../../src/core/config';
import { importProblem, saveSamples, listProblems } from '../../src/core/problems';

test('sample editor adds, deletes, saves exact whitespace and renders source text safely', async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'dsu-panel-'));
  try {
    const entry = path.join(folder, 'panel.cjs');
    await build({ entryPoints: ['tests/e2e/native-entry.ts'], bundle: true, platform: 'node', format: 'cjs', alias: { vscode: path.resolve('tests/e2e/vscode.ts') }, outfile: entry });
    const { ProblemPanel, window: host } = createRequire(path.resolve('package.json'))(entry);
    let html = '', receive: (message: any) => void = () => {};
    host.createWebviewPanel = () => ({
      webview: { get html() { return html; }, set html(value) { html = value; }, onDidReceiveMessage: (fn: typeof receive) => { receive = fn; return { dispose() {} }; } },
      onDidDispose: () => ({ dispose() {} }), reveal() {}, dispose() {}
    });
    const record = await importProblem(folder, { oj: 'Luogu', id: 'P1001', title: 'A+B <script>bad()</script>', url: 'https://www.luogu.com.cn/problem/P1001', statement: '</script><script>bad()</script>', samples: [{ input: '1 2\n', output: '3\n' }] }, defaultConfig);
    const panel = new ProblemPanel(async (command: string, payload: any) => {
      if (command === 'saveSamples') return saveSamples(folder, payload.url, payload.samples, defaultConfig);
    });
    await page.exposeFunction('sendDSU', (message: any) => receive(message));
    await page.addInitScript(() => { (window as any).acquireVsCodeApi = () => ({ postMessage: (m: unknown) => (window as any).sendDSU(m) }); });
    await page.route('https://dsu-panel.test/', route => route.fulfill({ contentType: 'text/html', body: html }));
    panel.show(record); await page.goto('https://dsu-panel.test/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(record.title);
    await page.getByRole('button', { name: '编辑样例' }).click();
    await expect.poll(() => html.includes('id="samples"')).toBe(true); await page.goto('https://dsu-panel.test/');
    await page.getByRole('button', { name: '添加样例' }).click();
    await expect(page.locator('textarea')).toHaveCount(4);
    await page.getByRole('button', { name: '删除样例' }).first().click();
    await page.locator('textarea').nth(0).fill('  20 30\n\n');
    await page.locator('textarea').nth(1).fill('50\n');
    await page.getByRole('button', { name: '保存样例' }).click();
    await expect.poll(() => html.includes('id="samples"')).toBe(false);
    expect((await listProblems(folder, defaultConfig))[0].samples).toEqual([{ input: '  20 30\n\n', output: '50\n' }]);
    await page.goto('https://dsu-panel.test/'); await expect(page.getByRole('button', { name: '一键测试' })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('samples.png') });
    panel.dispose();
  } finally { await rm(folder, { recursive: true, force: true }); }
});
