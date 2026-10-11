import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, symlink, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { defaultConfig, validateConfig } from '../src/core/config';
import { importProblem, recordForFile, safeName } from '../src/core/problems';
import { compare, runSamples } from '../src/core/runner';
import { createBridge, SubmissionQueue } from '../src/core/bridge';
import type { Problem, Submission } from '../src/core/types';

const problem: Problem = { oj: 'Codeforces', id: '1-A', title: 'A. Theatre Square', url: 'https://codeforces.com/problemset/problem/1/A', statement: 'test', samples: [{ input: '2 3\n', output: '5\n' }] };
test('default configuration is valid; invalid commands and cross-origin submission are rejected', () => {
  validateConfig(defaultConfig);
  const cfg = structuredClone(defaultConfig); (cfg.languages[0].run as any) = 'sh -c malicious';
  assert.throws(() => validateConfig(cfg));
  const next = structuredClone(defaultConfig); next.adapters[0].submit!.url = 'https://other.example/submit';
  assert.throws(() => validateConfig(next));
});
test('imports preserve code, isolate same-title problems, and reject symlink escapes', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dsu-test-'));
  const other = await mkdtemp(path.join(os.tmpdir(), 'dsu-outside-'));
  try {
    const first = await importProblem(root, problem, defaultConfig);
    const file = path.join(root, first.file); await writeFile(file, 'my code');
    const same = await importProblem(root, problem, defaultConfig);
    assert.equal(same.file, first.file); assert.equal(await readFile(file, 'utf8'), 'my code');
    const python = await importProblem(root, problem, defaultConfig, 'python');
    const switchedBack = await importProblem(root, problem, defaultConfig, 'cpp');
    assert.equal(switchedBack.file, first.file); assert.equal(await readFile(file, 'utf8'), 'my code');
    assert.equal(recordForFile(switchedBack, root, path.join(root, python.file))?.language, 'python');
    const second = await importProblem(root, { ...problem, url: 'https://codeforces.com/problemset/problem/2/A' }, defaultConfig);
    assert.notEqual(first.file, second.file);
    assert.ok(!safeName('../escape:*').includes('/'));
    await mkdir(path.join(root, 'unsafe'));
    await symlink(other, path.join(root, 'unsafe', 'Codeforces'), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(() => importProblem(path.join(root, 'unsafe'), problem, defaultConfig), /超出/);
  } finally { await rm(root, { recursive: true, force: true }); await rm(other, { recursive: true, force: true }); }
});
test('real processes report AC, WA, RE, TLE, OLE and missing compiler CE', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'dsu-run-'));
  const file = path.join(folder, 'source with spaces.js');
  const language = defaultConfig.languages.find(l => l.id === 'javascript')!;
  try {
    await writeFile(file, "const s=require('fs').readFileSync(0,'utf8');console.log(s.trim().split(/\\s+/).map(Number).reduce((a,b)=>a+b,0))");
    const good = await runSamples(file, language, problem.samples, defaultConfig); assert.equal(good[0].status, 'AC');
    const bad = await runSamples(file, language, [{ input: '2 3', output: '6' }], defaultConfig); assert.equal(bad[0].status, 'WA');
    await writeFile(file, 'process.exit(2)'); assert.equal((await runSamples(file, language, problem.samples, defaultConfig))[0].status, 'RE');
    await writeFile(file, 'while(true){}'); assert.equal((await runSamples(file, language, problem.samples, { ...defaultConfig, timeoutMs: 150 }))[0].status, 'TLE');
    await writeFile(file, "process.stdout.write('x'.repeat(2000000))"); assert.equal((await runSamples(file, language, problem.samples, defaultConfig))[0].status, 'OLE');
    assert.equal((await runSamples(file, { ...language, compile: ['dsu-nonexistent-compiler'] }, problem.samples, defaultConfig))[0].status, 'CE');
    await assert.rejects(() => runSamples(file, language, [], defaultConfig), /没有样例/);
  } finally { await rm(folder, { recursive: true, force: true }); }
});
test('comparison modes preserve exact semantics', () => {
  assert.equal(compare('1  2\r\n', '1\n2', 'tokens'), true);
  assert.equal(compare('1\n', '1', 'exact'), false);
  assert.equal(compare('1\r\n', '1\n', 'exact'), true);
  assert.equal(compare(' 1\n', '1', 'trim'), false);
});
test('loopback bridge requires bearer token and rejects ordinary website origins', async () => {
  const server = await createBridge('secret', async op => ({ op }), 0);
  const address = server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}/rpc`;
  try {
    assert.equal((await fetch(url, { method: 'POST', body: '{}' })).status, 401);
    assert.equal((await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer secret', Origin: 'https://codeforces.com' }, body: '{}' })).status, 403);
    const r = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer secret', 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'adapters' }) });
    assert.deepEqual(await r.json(), { ok: true, result: { op: 'adapters' } });
    assert.equal((await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer secret' }, body: 'x'.repeat(2_000_001) })).status, 413);
  } finally { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); }
});
test('submissions are bound to exact target and claimed at most once', () => {
  const queue = new SubmissionQueue();
  const job: Submission = { url: 'https://atcoder.jp/contests/abc/submit?taskScreenName=abc_a', language: 'cpp', code: 'code', codeSelector: 'textarea', languageSelector: 'select', submitSelector: 'button', languageValues: { cpp: 'C++' } };
  queue.enqueue(job);
  assert.throws(() => queue.enqueue(job), /已有/);
  assert.equal(queue.claim('https://atcoder.jp/contests/abc/submit?taskScreenName=abc_b'), null);
  assert.equal(queue.claim(job.url)?.code, 'code'); assert.equal(queue.claim(job.url), null);
});
