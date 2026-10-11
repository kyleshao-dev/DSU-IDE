import { readFile, access, realpath, mkdtemp, mkdir, copyFile, rm, writeFile, readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const upstream = JSON.parse(await readFile(path.join(root, 'config/upstream.json'), 'utf8'));
const checkout = await realpath(path.join(root, 'vendor/code-oss'));
if (/\s/.test(checkout)) throw new Error('上游原生模块不支持含空格的构建路径。请按 docs/BUILD.md 配置无空格的上游目录。');
const mode = process.argv[2];
if (!['install', 'build', 'start', 'package', 'smoke', 'smoke-package'].includes(mode)) throw new Error('用法：desktop.mjs install|build|start|package|smoke|smoke-package');
if (process.versions.node !== upstream.node) throw new Error(`桌面构建需要 Node ${upstream.node}，当前 ${process.versions.node}。请先切换 Node。`);
await access(path.join(checkout, 'package.json'));
const run = (command, args, cwd = checkout, env = process.env) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { cwd, env, stdio: 'inherit', shell: false });
  child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${command} 退出码 ${code}`)));
});
// Invoking npm's JavaScript CLI avoids .cmd shell quoting on Windows.
if (!process.env.npm_execpath) throw new Error('请通过 npm run desktop:* 调用此脚本');
const npm = args => run(process.execPath, [process.env.npm_execpath, ...args]);
if (mode === 'install') await npm(['ci']);
else if (mode === 'build') { await run(process.execPath, ['scripts/build.mjs'], root); await run(process.execPath, ['scripts/prepare-fork.mjs', '--sync'], root); await npm(['run', 'compile-client']); }
else if (mode === 'package') {
  await run(process.execPath, ['scripts/build.mjs'], root); await run(process.execPath, ['scripts/prepare-fork.mjs', '--sync'], root);
  if (!['darwin', 'linux', 'win32'].includes(process.platform) || !['arm64', 'x64'].includes(process.arch)) throw new Error('未配置此平台的打包任务');
  // Release builds minify the workbench and strip development source maps.
  await run(process.execPath, [process.env.npm_execpath, 'run', 'gulp', '--', `vscode-${process.platform}-${process.arch}-min`], checkout, { ...process.env, CI: '1' });
  await run(process.execPath, ['scripts/verify-app-size.mjs'], root);
  console.log(`桌面产物位于 ${path.join(path.dirname(checkout), `VSCode-${process.platform}-${process.arch}`)}；尚未签名。`);
} else {
  let temporary;
  let args = process.argv.slice(3);
  if (mode === 'smoke' || mode === 'smoke-package') {
    temporary = await mkdtemp(path.join(os.tmpdir(), 'dsu-desktop-smoke-'));
    const workspace = path.join(temporary, 'workspace'); await mkdir(workspace);
    process.env.DSU_SOURCE_ROOT = root; process.env.DSU_TEST_NODE = process.execPath;
    const harness = path.join(temporary, 'harness'); await mkdir(harness);
    await writeFile(path.join(harness, 'package.json'), JSON.stringify({ name: 'smoke-tests', publisher: 'dsu', version: '0.0.1', engines: { vscode: '^1.110.0' }, enabledApiProposals: ['browser'], main: './desktop-smoke.cjs' }));
    await copyFile(path.join(root, 'scripts/desktop-smoke.cjs'), path.join(harness, 'desktop-smoke.cjs'));
    process.env.DSU_EXPECTED_EXTENSION_ROOT = path.join(checkout, 'extensions/dsu-ide');
    args = [workspace, '--user-data-dir', path.join(temporary, 'profile'), '--extensions-dir', path.join(temporary, 'extensions'), '--disable-workspace-trust', '--use-inmemory-secretstorage', '--skip-welcome', '--skip-release-notes', '--enable-proposed-api=dsu.smoke-tests', '--extensionDevelopmentPath=' + harness, '--extensionTestsPath=' + path.join(harness, 'desktop-smoke.cjs')];
  }
  if (temporary && process.platform === 'linux' && process.env.CI) args.push('--no-sandbox');
  try {
  if (mode === 'smoke-package') {
    process.env.DSU_EXPECTED_LANGUAGE = 'zh-cn';
    const packaged = path.join(path.dirname(checkout), `VSCode-${process.platform}-${process.arch}`);
    const product = JSON.parse(await readFile(path.join(checkout, 'product.json'), 'utf8'));
    let executable, appRoot;
    if (process.platform === 'darwin') {
      const apps = (await readdir(packaged)).filter(name => name.endsWith('.app'));
      if (apps.length !== 1) throw new Error('无法确定打包后的应用路径');
      executable = path.join(packaged, apps[0], 'Contents/MacOS', product.nameShort);
      appRoot = path.join(packaged, apps[0], 'Contents/Resources/app');
    } else { executable = path.join(packaged, process.platform === 'win32' ? product.nameShort + '.exe' : product.applicationName); appRoot = path.join(packaged, 'resources/app'); }
    process.env.DSU_EXPECTED_EXTENSION_ROOT = path.join(appRoot, 'extensions/dsu-ide');
    await run(executable, args, packaged);
  } else if (process.platform === 'win32') await run('cmd.exe', ['/d', '/c', 'scripts\\code.bat', ...args]);
  else await run('bash', ['scripts/code.sh', ...args]);
  if (temporary) { await mkdir(path.join(root, 'dist/validation'), { recursive: true }); await copyFile(path.join(temporary, 'workspace/desktop-smoke.json'), path.join(root, mode === 'smoke-package' ? 'dist/validation/packaged-smoke.json' : 'dist/validation/desktop-smoke.json')); }
  } finally { if (temporary) await rm(temporary, { recursive: true, force: true }); }
}
