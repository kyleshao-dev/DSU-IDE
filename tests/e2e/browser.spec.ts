import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHarness, cfUrl, cfSubmit, luoguUrl, type Transport } from './fixtures';

for (const transport of ['extension', 'native-cdp'] as Transport[]) {
  test.describe(transport, () => {
    let app: Awaited<ReturnType<typeof createHarness>>;
    test.beforeEach(async () => {
      app = await createHarness(transport);
      if (app.pair) { const options = await app.pair(); await expect(options.locator('#status')).toContainText('已连接'); await options.close(); }
    });
    test.afterEach(async () => { await app?.close(); });

    test('trusted browser click imports real files and repeat import preserves code', async () => {
      await app.page.goto(luoguUrl);
      await app.page.locator('#dsu-ide-button').click();
      await expect.poll(() => app.imports.length).toBe(1);
      expect(app.imports[0].samples).toEqual([{ input: '20 30\n', output: '50\n' }]);
      expect(app.imports[0].file).toBe(path.join('Luogu', 'A+B Browser Test.cpp'));
      await writeFile(path.join(app.folder, app.imports[0].file), '// user code');
      await app.page.locator('#dsu-ide-button').click();
      await expect.poll(() => app.imports.length).toBe(2);
      expect(await app.importedCode()).toBe('// user code');
      expect(await app.page.evaluate(() => typeof (window as any).dsuNativeCall)).toBe('undefined');
    });

    test('Luogu async submission reaches receipt once through the real browser transport', async ({}, info) => {
      await app.page.goto(luoguUrl);
      await expect(app.page.locator('#dsu-ide-button')).toBeVisible();
      app.enqueue(luoguUrl);
      await expect.poll(() => app.receipts.length).toBe(1);
      expect(app.receipts[0]).toEqual({ ok: true, state: 'accepted', recordId: '876543', recordUrl: 'https://www.luogu.com.cn/record/876543' });
      expect(app.posts).toHaveLength(1);
      expect(app.posts[0].headers['x-csrf-token']).toBe('fixture-csrf');
      expect(JSON.parse(app.posts[0].body)).toEqual({ lang: 27, code: 'int main() { return 0; }', enableO2: 1 });
      await app.page.screenshot({ path: info.outputPath('accepted.png') });
      await app.page.reload();
      await expect(app.page.locator('#dsu-ide-button')).toBeVisible();
      await app.page.waitForTimeout(3000); // Cross one production polling interval: no replay after reload.
      expect(app.posts).toHaveLength(1); expect(app.receipts).toHaveLength(1);
    });

    test('captcha receipt is delivered and never resubmitted automatically', async () => {
      app.setMode('captcha'); await app.page.goto(luoguUrl); app.enqueue(luoguUrl);
      await expect.poll(() => app.receipts.length).toBe(1);
      expect(app.receipts[0]).toMatchObject({ ok: false, state: 'action-required' });
      await app.page.waitForTimeout(3000);
      expect(app.posts).toHaveLength(1);
    });

    test('form submit sets source, problem and compiler and dispatches one request', async () => {
      await app.page.goto(cfSubmit); app.enqueue(cfUrl, 'int main() { return 42; }');
      await expect.poll(() => app.receipts.length).toBe(1);
      await expect.poll(() => app.posts.length).toBe(1);
      expect(app.receipts[0]).toEqual({ ok: true, state: 'dispatched' });
      const form = new URLSearchParams(app.posts[0].body);
      expect(Object.fromEntries(form)).toEqual({ submittedProblemIndex: 'A', programTypeId: '89', source: 'int main() { return 42; }' });
    });

    test('VJudge opens the original site and imports under the original OJ', async () => {
      await app.page.goto('https://vjudge.net/problem/CodeForces-1A');
      await app.page.locator('#dsu-ide-button').click();
      await expect.poll(() => app.context.pages().find(p => p.url() === cfUrl)?.url()).toBe(cfUrl);
      const origin = app.context.pages().find(p => p.url() === cfUrl)!;
      await origin.locator('#dsu-ide-button').click();
      await expect.poll(() => app.imports.length).toBe(1);
      expect(app.imports[0].oj).toBe('Codeforces');
    });
  });
}

test('extension rejects a bad pairing token and recovers after repairing', async () => {
  const app = await createHarness('extension');
  try {
    const bad = await app.pair!('invalid-token'); await expect(bad.locator('#status')).toContainText('配对令牌不正确'); await bad.close();
    await app.page.goto(cfUrl); await expect(app.page.locator('#dsu-ide-button')).toBeVisible();
    await app.page.locator('#dsu-ide-button').click(); expect(app.imports).toHaveLength(0);
    const good = await app.pair!(); await expect(good.locator('#status')).toContainText('已连接'); await good.close();
    // The content script's retry must recover without reloading the OJ page.
    await app.page.waitForTimeout(3000);
    await app.page.locator('#dsu-ide-button').click();
    await expect.poll(() => app.imports.length).toBe(1);
  } finally { await app.close(); }
});
test('extension can disconnect and pair again without reinstalling', async () => {
  const app = await createHarness('extension');
  try {
    const options = await app.pair!();
    await expect(options.locator('#status')).toContainText('已连接');
    await expect(options.locator('#version')).toHaveText('0.1.2');
    await options.getByRole('button', { name: '断开配对' }).click();
    await expect(options.locator('#token')).toHaveValue('');
    await expect(options.locator('#status')).toContainText('已断开配对');
    await options.reload();
    await expect(options.locator('#token')).toHaveValue('');
    const repaired = await app.pair!();
    await expect(repaired.locator('#status')).toContainText('已连接');
  } finally { await app.close(); }
});

test('toolbar imports a problem, preserves code, and rejects a stale page', async ({}, info) => {
  const app = await createHarness('extension');
  try {
    const settings = await app.pair!(JSON.stringify({ dsu: 1, token: app.token, port: app.port }));
    await expect(settings.locator('#status')).toContainText('已连接');
    await expect(settings.locator('#port')).toHaveValue(String(app.port)); await settings.close();
    await app.page.goto(luoguUrl);
    const popup = await app.popup!();
    await expect(popup.locator('#connection')).toContainText('已连接');
    await expect(popup.locator('#site')).toHaveText('洛谷');
    await popup.getByRole('button', { name: '导入当前题目' }).click();
    await expect(popup.locator('#result')).toContainText('已导入：Luogu');
    expect(app.imports).toHaveLength(1);
    await writeFile(path.join(app.folder, app.imports[0].file), '// retained from toolbar');
    await popup.getByRole('button', { name: '导入当前题目' }).click();
    await expect.poll(() => app.imports.length).toBe(2);
    expect(await app.importedCode()).toBe('// retained from toolbar');
    await popup.screenshot({ path: info.outputPath('companion-popup.png'), clip: { x: 0, y: 0, width: 320, height: 350 } });
    await app.page.goto(cfUrl);
    await popup.getByRole('button', { name: '导入当前题目' }).click();
    await expect(popup.locator('#result')).toContainText('页面已变化');
    expect(app.imports).toHaveLength(2);
    await popup.getByRole('button', { name: '重新检查' }).click();
    await expect(popup.locator('#site')).toHaveText('Codeforces');
  } finally { await app.close(); }
});

test('toolbar diagnoses pairing and non-problem pages and resolves VJudge', async () => {
  const app = await createHarness('extension');
  try {
    await app.page.goto(cfUrl);
    const popup = await app.popup!();
    await expect(popup.locator('#connection')).toHaveText('尚未连接');
    await expect(popup.locator('#hint')).toContainText('配对令牌');
    await expect(popup.locator('#import')).toBeDisabled();
    const settings = await app.pair!(); await expect(settings.locator('#status')).toContainText('已连接'); await settings.close();
    await app.page.goto(cfSubmit);
    await app.page.bringToFront();
    await popup.getByRole('button', { name: '重新检查' }).click();
    await expect(popup.locator('#hint')).toContainText('当前不是已配置的题目页');
    await expect(popup.locator('#import')).toBeDisabled();
    await app.page.goto('https://vjudge.net/problem/CodeForces-1A');
    await app.page.bringToFront();
    await popup.getByRole('button', { name: '重新检查' }).click();
    await expect(popup.locator('#import')).toHaveText('打开原站题目');
    await popup.getByRole('button', { name: '打开原站题目' }).click();
    await expect(popup.locator('#result')).toContainText('已打开原站');
    await expect(app.page).toHaveURL(cfUrl);
    expect(app.imports).toHaveLength(0);
  } finally { await app.close(); }
});

test('page and toolbar share an import lock and recover after pairing is repaired', async () => {
  const app = await createHarness('extension');
  try {
    const settings = await app.pair!(); await expect(settings.locator('#status')).toContainText('已连接'); await settings.close();
    await app.page.goto(luoguUrl);
    const popup = await app.popup!();
    await expect(popup.locator('#import')).toBeEnabled(); app.setImportDelay(2000);
    await app.page.locator('#dsu-ide-button').click();
    await popup.getByRole('button', { name: '导入当前题目' }).click();
    await expect(popup.locator('#result')).toContainText('正在导入，请稍候');
    await expect.poll(() => app.imports.length).toBe(1);
    app.setImportDelay(0);
    const bad = await app.pair!('invalid-token'); await expect(bad.locator('#status')).toContainText('配对令牌不正确'); await bad.close();
    await popup.getByRole('button', { name: '重新检查' }).click();
    await expect(popup.locator('#hint')).toContainText('配对令牌不正确');
    const good = await app.pair!(); await expect(good.locator('#status')).toContainText('已连接'); await good.close();
    await app.page.bringToFront();
    await popup.getByRole('button', { name: '重新检查' }).click();
    await expect(popup.locator('#import')).toBeEnabled();
    await popup.getByRole('button', { name: '导入当前题目' }).click();
    await expect.poll(() => app.imports.length).toBe(2);
  } finally { await app.close(); }
});

test('bad connection data never replaces an existing pairing', async () => {
  const app = await createHarness('extension');
  try {
    const settings = await app.pair!(); await expect(settings.locator('#status')).toContainText('已连接');
    await settings.locator('#token').fill('{"dsu":1,"token":"different","port":1}');
    await settings.getByRole('button', { name: '保存并测试连接' }).click();
    await expect(settings.locator('#status')).toContainText('端口需为');
    await settings.reload();
    await expect(settings.locator('#token')).toHaveValue(app.token);
    await expect(settings.locator('#status')).toContainText('已连接');
  } finally { await app.close(); }
});
