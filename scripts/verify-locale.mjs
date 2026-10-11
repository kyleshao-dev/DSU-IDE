import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkout = await realpath(path.join(root, 'vendor/code-oss'));
const product = JSON.parse(await readFile(path.join(checkout, 'product.json'), 'utf8'));
const packaged = path.join(path.dirname(checkout), `VSCode-${process.platform}-${process.arch}`);
let executablePath;
if (process.platform === 'darwin') {
  const apps = (await readdir(packaged)).filter(n => n.endsWith('.app'));
  assert.equal(apps.length, 1);
  executablePath = path.join(packaged, apps[0], 'Contents/MacOS', product.nameShort);
} else executablePath = path.join(packaged, process.platform === 'win32' ? product.nameShort + '.exe' : product.applicationName);
const output = path.join(root, 'dist/validation');
await mkdir(output, { recursive: true });
const reports = [];
// Two clean profiles verify the product default and explicit English override.
for (const { locale, withWorkspace } of [{ locale: undefined, withWorkspace: true }, { locale: 'en', withWorkspace: true }, { locale: undefined, withWorkspace: false }]) {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'dsu-locale-'));
  let app;
  try {
    const workspace = path.join(temp, 'workspace'); await mkdir(workspace);
    const args = [...(withWorkspace ? [workspace] : []), '--user-data-dir=' + path.join(temp, 'profile'), '--extensions-dir=' + path.join(temp, 'extensions'), '--skip-welcome', '--skip-release-notes', '--disable-workspace-trust', '--use-inmemory-secretstorage'];
    if (locale) args.push('--locale=' + locale);
    if (process.platform === 'linux' && process.env.CI) args.push('--no-sandbox');
    app = await electron.launch({ executablePath, args, timeout: 60000 });
    const window = await app.firstWindow();
    await expect.poll(() => app.evaluate(() => JSON.parse(process.env.VSCODE_NLS_CONFIG || '{}').resolvedLanguage), { timeout: 60000 }).toBe(locale || 'zh-cn');
    await expect.poll(async () => {
      for (const frame of window.frames()) {
        if (await frame.getByRole('heading', { name: '从一道题开始' }).count()) return true;
      }
      return false;
    }, { timeout: 60000 }).toBe(true);
    await expect(window.getByRole('tab', { name: /^(Chat|聊天)(\s|$)/ })).toHaveCount(0);
    await expect(window.getByRole('button', { name: /^(Sign In|登录)$/ })).toHaveCount(0);
    await window.screenshot({ path: path.join(output, withWorkspace ? `locale-${locale || 'zh-cn'}.png` : 'home-empty.png') });
    let restored = false;
    if (!locale && withWorkspace) {
      await app.close();
      app = await electron.launch({ executablePath, args, timeout: 60000 });
      const reopened = await app.firstWindow();
      await expect.poll(async () => {
        for (const frame of reopened.frames()) if (await frame.getByRole('heading', { name: '从一道题开始' }).count()) return true;
        return false;
      }, { timeout: 60000 }).toBe(true);
      restored = true;
    }
    reports.push({ requested: locale || 'default', language: locale || 'zh-cn', home: true, withWorkspace, restored, passed: true });
  } finally {
    await app?.close();
    await rm(temp, { recursive: true, force: true });
  }
}
await writeFile(path.join(output, 'locale-smoke.json'), JSON.stringify(reports, null, 2));
console.log(reports);
