import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, symlink, link, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
// @ts-expect-error Release scripts use native ESM.
import { measureDirectory, requireSizeBudget } from '../scripts/app-size.mjs';

test('size budget includes unpacked bytes and refuses a small ZIP as proof of compliance', () => {
  requireSizeBudget({ bytes: 499_000_000, allocatedBytes: 499_900_000 });
  assert.throws(() => requireSizeBudget({ bytes: 500_000_001, allocatedBytes: 499_900_000 }), /超过/);
  assert.throws(() => requireSizeBudget({ bytes: 499_000_000, allocatedBytes: 500_000_001 }), /超过/);
});

test('application size avoids linked framework duplication and ignores files outside the bundle', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dsu-size-'));
  const outside = path.join(directory, 'outside');
  const app = path.join(directory, 'app');
  const { mkdir } = await import('node:fs/promises');
  try {
    await mkdir(app); await writeFile(outside, Buffer.alloc(100_000));
    const binary = path.join(app, 'binary'); await writeFile(binary, 'DSU');
    await link(binary, path.join(app, 'hardlink'));
    // Windows symlinks require privileges; the build gate still counts all real files there.
    if (process.platform !== 'win32') await symlink(outside, path.join(app, 'framework-link'));
    const size = await measureDirectory(app);
    assert.ok(size.bytes < 1000); assert.ok(size.files <= 2);
    assert.ok(size.allocatedBytes >= size.bytes);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
