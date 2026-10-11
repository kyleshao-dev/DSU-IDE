import { spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir, cp, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { brandProduct, disableGallery, galleryPath, restoreUpstreamOnboarding, onboardingPath, preserveCopilotRuntime, extensionPackagingPath } from './fork-patches.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const upstream = JSON.parse(await readFile(path.join(root, 'config/upstream.json'), 'utf8'));
const checkout = path.join(root, 'vendor/code-oss');
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: false });
  if (result.error || result.status !== 0) throw result.error || new Error(`${command} 失败 (${result.status})`);
}
async function exists(file) { try { await access(file); return true; } catch { return false; } }
if (!await exists(path.join(root, 'packages/dsu-ide/package.json'))) throw new Error('请先执行 npm run build');
if (!await exists(path.join(checkout, '.git'))) {
  if (process.argv.includes('--sync')) throw new Error('请先执行 npm run fork:prepare');
  await mkdir(checkout, { recursive: true });
  run('git', ['init'], checkout);
  run('git', ['remote', 'add', 'origin', upstream.repository], checkout);
}
let head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: checkout, encoding: 'utf8' });
if (head.status !== 0) {
  run('git', ['fetch', '--depth=1', 'origin', upstream.commit], checkout);
  run('git', ['checkout', '--detach', 'FETCH_HEAD'], checkout);
  head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: checkout, encoding: 'utf8' });
}
if (head.stdout.trim() !== upstream.commit) throw new Error('vendor/code-oss 不在固定上游提交。不会重置你的修改，请先手动确认。');
const productFile = path.join(checkout, 'product.json');
const product = JSON.parse(await readFile(productFile, 'utf8'));
// Repair earlier DSU checkouts that removed metadata required by the upstream
// account service. Read it from the pinned revision, never invent identifiers.
if (!product.defaultChatAgent) {
  const original = spawnSync('git', ['show', 'HEAD:product.json'], { cwd: checkout, encoding: 'utf8' });
  if (original.status !== 0) throw new Error('无法读取固定版本的产品配置');
  product.defaultChatAgent = JSON.parse(original.stdout).defaultChatAgent;
}
await writeFile(productFile, JSON.stringify(brandProduct(product, upstream.dsuVersion), null, '\t') + '\n');
const galleryFile = path.join(checkout, galleryPath);
await writeFile(galleryFile, disableGallery(await readFile(galleryFile, 'utf8')));
const onboardingFile = path.join(checkout, onboardingPath);
await writeFile(onboardingFile, restoreUpstreamOnboarding(await readFile(onboardingFile, 'utf8')));
const packagingFile = path.join(checkout, extensionPackagingPath);
await writeFile(packagingFile, preserveCopilotRuntime(await readFile(packagingFile, 'utf8')));
await cp(path.join(root, 'packages/dsu-ide'), path.join(checkout, 'extensions/dsu-ide'), { recursive: true });
console.log(`DSU IDE ${upstream.dsuVersion} 源码已准备：${checkout}`);
console.log(`请使用上游要求的 Node ${upstream.node}，按 docs/BUILD.md 安装依赖、编译和运行。`);
