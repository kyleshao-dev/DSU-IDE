import { createVSIX } from '@vscode/vsce';
import { zipSync } from 'fflate';
import { readFile, writeFile, mkdir, readdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const output = path.join(root, 'dist/release'); await mkdir(output, { recursive: true });
for (const file of ['config/extension.json', 'browser/manifest.json']) {
  if (JSON.parse(await readFile(path.join(root, file), 'utf8')).version !== version) throw new Error(`版本不一致：${file}`);
}
const vsix = `dsu-ide-${version}.vsix`, companion = `dsu-companion-${version}.zip`;
await createVSIX({ cwd: path.join(root, 'packages/dsu-ide'), packagePath: path.join(output, vsix), dependencies: false, allowMissingRepository: true, allowStarActivation: true, skipLicense: false });
const archive = {};
for (const name of await readdir(path.join(root, 'dist/browser'))) archive[name] = new Uint8Array(await readFile(path.join(root, 'dist/browser', name)));
archive['LICENSE'] = new Uint8Array(await readFile(path.join(root, 'LICENSE')));
await writeFile(path.join(output, companion), zipSync(archive, { level: 9 }));
const documents = ['BUILD.md', 'BROWSER_EXTENSION.md', 'BROWSER_PRIVACY.md', 'UI_DESIGN.md'];
for (const name of documents) await copyFile(path.join(root, 'docs', name), path.join(output, name));
const sums = [];
const screenshots = (await readdir(output)).filter(name => ['companion-settings.png', 'companion-popup.png'].includes(name));
const desktops = (await readdir(output)).filter(name => name.startsWith(`DSU-IDE-${version}-`) && name.endsWith('.zip')).sort();
for (const name of [vsix, companion, ...documents, ...desktops, ...screenshots]) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path.join(output, name))) hash.update(chunk);
  sums.push(`${hash.digest('hex')}  ${name}`);
}
await writeFile(path.join(output, 'SHA256SUMS'), sums.join('\n') + '\n');
console.log(`发布附件已生成：${output}。VSIX 需要 browser 提案 API；桌面 ZIP 校验项：${desktops.length}。`);
