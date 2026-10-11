import { readdir, realpath, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { APP_SIZE_LIMIT, measureDirectory, requireSizeBudget } from './app-size.mjs';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(import.meta.dirname, '..');
  const checkout = await realpath(path.join(root, 'vendor/code-oss'));
  const packaged = path.join(path.dirname(checkout), `VSCode-${process.platform}-${process.arch}`);
  let appPath = packaged;
  if (process.platform === 'darwin') {
    const apps = (await readdir(packaged)).filter(name => name.endsWith('.app'));
    if (apps.length !== 1) throw new Error('无法确定打包后的应用');
    appPath = path.join(packaged, apps[0]);
  }
  const size = await measureDirectory(appPath);
  const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const report = { version, platform: process.platform, arch: process.arch, appPath, limitBytes: APP_SIZE_LIMIT, ...size, passed: Math.max(size.bytes, size.allocatedBytes) <= APP_SIZE_LIMIT };
  const output = path.join(root, 'dist/validation'); await mkdir(output, { recursive: true });
  await writeFile(path.join(output, 'app-size.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`DSU IDE：文件 ${(size.bytes / 1e6).toFixed(1)} MB；磁盘占用 ${(size.allocatedBytes / 1e6).toFixed(1)} MB；上限 500 MB。`);
  requireSizeBudget(size);
}
