import { lstat, readdir } from 'node:fs/promises';
import path from 'node:path';

export const APP_SIZE_LIMIT = 500_000_000;

// Count real files once and never follow framework links or links outside the app.
export async function measureDirectory(directory) {
  let bytes = 0, allocatedBytes = 0, files = 0;
  const visited = new Set();
  async function visit(file) {
    const stat = await lstat(file);
    const identity = `${stat.dev}:${stat.ino}`;
    if (stat.ino && visited.has(identity)) return;
    if (stat.ino) visited.add(identity);
    allocatedBytes += (stat.blocks ?? Math.ceil(stat.size / 512)) * 512;
    if (stat.isDirectory()) {
      for (const name of await readdir(file)) await visit(path.join(file, name));
    } else { bytes += stat.size; files++; }
  }
  await visit(directory);
  return { bytes, allocatedBytes, files };
}

export function requireSizeBudget(size, limit = APP_SIZE_LIMIT) {
  if (Math.max(size.bytes, size.allocatedBytes) > limit) throw new Error(`应用超过 ${limit / 1e6} MB 上限：文件 ${Math.ceil(size.bytes / 1e6)} MB，磁盘占用 ${Math.ceil(size.allocatedBytes / 1e6)} MB`);
}
