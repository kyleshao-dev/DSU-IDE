import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { defaultConfig } from '../src/core/config';
import { importProblem, listProblems, saveSamples } from '../src/core/problems';
import { inspectToolchains, findExecutable } from '../src/core/toolchains';
import { runSamples } from '../src/core/runner';
import { SubmissionQueue } from '../src/core/bridge';

const problem = { oj: 'Luogu', id: 'P1001', title: 'A+B', url: 'https://www.luogu.com.cn/problem/P1001', statement: 'sum', samples: [{ input: '1 2\n', output: '3\n' }] };
test('problem library and sample editing preserve code and language associations', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dsu-library-'));
  try {
    assert.deepEqual(await listProblems(root, defaultConfig), []);
    const first = await importProblem(root, problem, defaultConfig);
    await writeFile(path.join(root, first.file), '// keep');
    await importProblem(root, problem, defaultConfig, 'python');
    const samples = [{ input: '\t2 3\n', output: '5\n\n' }, { input: '-2 1', output: '-1' }];
    const saved = await saveSamples(root, problem.url, samples, defaultConfig);
    assert.deepEqual((await listProblems(root, defaultConfig))[0], saved);
    assert.deepEqual(saved.samples, samples); assert.equal(saved.files?.cpp, first.file);
    assert.equal(await readFile(path.join(root, first.file), 'utf8'), '// keep');
    await assert.rejects(() => saveSamples(root, problem.url, [{ input: 3, output: '' }] as any, defaultConfig), /样例/);
    assert.deepEqual((await listProblems(root, defaultConfig))[0].samples, samples);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('toolchain inspection reports missing tools and paths containing spaces', async () => {
  assert.equal(await findExecutable(process.execPath, process.cwd()), process.execPath);
  const [missing, node] = await inspectToolchains([
    { ...defaultConfig.languages[0], compile: ['dsu-no-compiler-012'] },
    { ...defaultConfig.languages[4], run: [process.execPath, '{source}'] }
  ], process.cwd());
  assert.equal(missing.ready, false); assert.equal(node.ready, true);
  assert.equal(node.tools[0].path, process.execPath);
});
test('cancellation during execution throws instead of reporting RE or AC', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dsu-cancel-'));
  try {
    const file = path.join(root, 'run.js'); await writeFile(file, 'while(true){}');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 100);
    try { await assert.rejects(() => runSamples(file, { ...defaultConfig.languages[4], run: [process.execPath, '{source}'] }, problem.samples, defaultConfig, controller.signal), /用户取消/); }
    finally { clearTimeout(timer); }
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('failed browser open can remove one submission without cancelling other problems', () => {
  const queue = new SubmissionQueue();
  const base = { kind: 'luogu' as const, url: problem.url, pid: 'P1001', enableO2: true, code: 'code', language: 'cpp', languageValues: { cpp: '27' } };
  const first = queue.enqueue(base); const second = queue.enqueue({ ...base, pid: 'P1002', url: 'https://www.luogu.com.cn/problem/P1002' });
  queue.remove(first.id); assert.equal(queue.claim(first.url), null); assert.equal(queue.claim(second.url)?.id, second.id);
});
