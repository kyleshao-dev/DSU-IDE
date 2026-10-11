import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { buildSync } from 'esbuild';
import { defaultConfig, updateBuiltinAdapters, validateConfig } from '../src/core/config';
import { extractProblem, readProblem, submissionFor, resolveVJudge } from '../src/page/extract';
import { validateReceipt } from '../src/core/submission';
import type { LuoguSubmission, SubmissionResult } from '../src/core/types';

const adapter = defaultConfig.adapters.find(a => a.id === 'Luogu')!;
const url = 'https://www.luogu.com.cn/problem/P1001';
const fixture = () => ({ template: 'problem.show', user: { uid: 123 }, data: { contest: null as { id: number } | null, problem: {
  pid: 'P1001', name: 'A+B Problem', acceptLanguages: [27, 7],
  content: { name: 'A+B Problem', description: 'Return the sum.', formatI: 'Two integers.', formatO: 'One integer.', hint: 'May be negative.', locale: 'zh-CN' },
  samples: [['20 30\n', '50\n'], ['\n1 2\n\n', '3\n\n']]
} } });
function html(data: unknown, csrf = true) {
  return `${csrf ? '<meta name="csrf-token" content="test-only-token">' : ''}<script id="lentille-context" type="application/json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
}
function response(body: unknown, url: string, status = 200) {
  const r = new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  Object.defineProperty(r, 'url', { value: url }); return r;
}
const compiled = buildSync({ entryPoints: ['src/page/fill.ts'], bundle: true, format: 'iife', globalName: 'DSUFill', write: false }).outputFiles[0].text;
async function execute(options: {
  data?: unknown; csrf?: boolean; status?: number; reply?: unknown; failNetwork?: boolean; job?: LuoguSubmission;
  languageConfig?: unknown; navigateBeforePost?: boolean;
} = {}) {
  const job = options.job || submissionFor(url, 'int main() {}', 'cpp', adapter) as LuoguSubmission;
  const dom = new JSDOM('', { url: job.url, runScripts: 'outside-only' });
  const calls: { url: string; init?: RequestInit }[] = [];
  Object.defineProperty(dom.window, 'fetch', { value: async (target: string, init?: RequestInit) => {
    calls.push({ url: target, init });
    if (init?.method === 'POST') {
      if (options.failNetwork) throw new Error('connection lost');
      return response(options.reply ?? { rid: 987654 }, target, options.status ?? 200);
    }
    if (new URL(target).pathname === '/_lfe/config') {
      if (options.navigateBeforePost) dom.window.history.replaceState(null, '', '/problem/P1002');
      return response(options.languageConfig ?? { CodeLanguage: { '27': { id: 27, disabled: false, canO2: true }, '7': { id: 7, disabled: false, canO2: false } } }, target);
    }
    return response(html(options.data ?? fixture(), options.csrf ?? true), target);
  } });
  try {
    const serialized = dom.window.eval(compiled + '\nDSUFill.fillSubmission.toString()') as string;
    const result = await dom.window.eval(`(${serialized})(${JSON.stringify(job)})`) as SubmissionResult;
    return { result: JSON.parse(JSON.stringify(result)) as SubmissionResult, calls, job };
  } finally { dom.window.close(); }
}

test('current Luogu schema imports name, ordered sections and exact sample whitespace', () => {
  const p = extractProblem(new JSDOM(html(fixture())).window.document, url, adapter);
  assert.deepEqual({ title: p.title, samples: p.samples }, { title: 'A+B Problem', samples: [{ input: '20 30\n', output: '50\n' }, { input: '\n1 2\n\n', output: '3\n\n' }] });
  assert.match(p.statement, /## 输入格式\n\nTwo integers/); assert.doesNotMatch(p.statement, /zh-CN/);
});
test('legacy injection is decoded as JSON, never evaluated', () => {
  const payload = { currentData: { problem: { title: 'Legacy', description: 'Text', samples: [['', '']] } } };
  const doc = new JSDOM(`<script>window._feInjection=JSON.parse(decodeURIComponent("${encodeURIComponent(JSON.stringify(payload))}"));throw new Error('must not execute');</script>`).window.document;
  assert.equal(extractProblem(doc, url, adapter).title, 'Legacy');
});
test('mismatched SPA data, malformed samples and challenge pages are rejected', () => {
  const stale = fixture(); stale.data.problem.pid = 'P1002';
  assert.throws(() => extractProblem(new JSDOM(html(stale)).window.document, url, adapter), /另一道题/);
  const broken = fixture(); (broken.data.problem.samples as unknown[]) = [[12, '3']];
  assert.throws(() => extractProblem(new JSDOM(html(broken)).window.document, url, adapter), /样例格式/);
  assert.throws(() => extractProblem(new JSDOM('<h1>Verify you are human</h1>').window.document, url, adapter), /没有找到/);
});
test('import fetches fresh same-origin page instead of stale SPA hydration data', async () => {
  const stale = fixture(); stale.data.problem.pid = 'P9999';
  const doc = new JSDOM(html(stale)).window.document;
  const fetchPage = (async (target, init) => {
    assert.equal(target, url); assert.equal(init?.credentials, 'same-origin'); assert.equal(init?.cache, 'no-store');
    return response(html(fixture()), url);
  }) as typeof fetch;
  const result = await readProblem(doc, url, adapter, fetchPage, text => new JSDOM(text).window.document);
  assert.equal(result.id, 'P1001');
});
test('Luogu jobs preserve contest identity and reject unsupported language or forged host', () => {
  const job = submissionFor(`${url}?contestId=123#submit`, 'code', 'cpp', adapter);
  assert.ok(job.kind === 'luogu');
  assert.deepEqual({ pid: job.pid, url: job.url, contestId: job.contestId, language: job.languageValues.cpp }, { pid: 'P1001', url: `${url}?contestId=123`, contestId: '123', language: '27' });
  assert.throws(() => submissionFor(url, 'code', 'swift', adapter), /未配置/);
  assert.throws(() => submissionFor('https://evil.example/problem/P1001', 'code', 'cpp', adapter), /URL 不匹配/);
  assert.throws(() => submissionFor(`${url}?contestId=1&contestId=2`, 'code', 'cpp', adapter), /contestId/);
});
test('serialized Luogu submitter uses page session, CSRF and exact language; returns record, not AC', async () => {
  const { result, calls, job } = await execute();
  assert.deepEqual(result, { ok: true, state: 'accepted', recordId: '987654', recordUrl: 'https://www.luogu.com.cn/record/987654' });
  const post = calls.filter(c => c.init?.method === 'POST'); assert.equal(post.length, 1);
  assert.equal(post[0].url, 'https://www.luogu.com.cn/fe/api/problem/submit/P1001');
  assert.equal(post[0].init?.credentials, 'same-origin');
  assert.equal((post[0].init?.headers as Record<string, string>)['X-CSRF-TOKEN'], 'test-only-token');
  assert.deepEqual(JSON.parse(post[0].init?.body as string), { lang: 27, code: job.code, enableO2: 1 });
  assert.deepEqual(validateReceipt(job, result), result);
});
test('Luogu disables O2 for an interpreter and preserves contestId in request', async () => {
  const data = fixture(); data.data.contest = { id: 123 };
  const job = submissionFor(`${url}?contestId=123`, 'print(1)', 'python', adapter) as LuoguSubmission;
  const { calls, result } = await execute({ data, job });
  assert.equal(result.ok, true);
  const post = calls.find(c => c.init?.method === 'POST')!;
  assert.equal(new URL(post.url).searchParams.get('contestId'), '123');
  assert.deepEqual(JSON.parse(post.init?.body as string), { lang: 7, code: 'print(1)', enableO2: 0 });
});
test('logged-out, missing CSRF, disallowed language and wrong contest never POST', async () => {
  const loggedOut = { ...fixture(), user: null };
  const disallowed = fixture(); disallowed.data.problem.acceptLanguages = [7];
  const wrongContest = fixture(); wrongContest.data.contest = { id: 999 };
  for (const options of [{ data: loggedOut }, { csrf: false }, { data: disallowed }, { data: wrongContest }, { navigateBeforePost: true }, { languageConfig: { CodeLanguage: { '27': { id: 27, disabled: true } } } }]) {
    const { result, calls } = await execute(options);
    assert.equal(result.ok, false); assert.equal(calls.filter(c => c.init?.method === 'POST').length, 0);
  }
});
test('captcha/auth failures do not retry; lost response and invalid rid are unknown', async () => {
  for (const [options, state] of [
    [{ status: 403, reply: { errorType: 'CaptchaNotMatchException' } }, 'action-required'],
    [{ status: 401, reply: { message: '请登录' } }, 'action-required'],
    [{ status: 429, reply: { errorMessage: '提交过于频繁' } }, 'failed'],
    [{ reply: { rid: 123, errorMessage: 'rejected' } }, 'failed'],
    [{ status: 500, reply: { message: 'server error' } }, 'unknown'],
    [{ failNetwork: true }, 'unknown'],
    [{ reply: { success: true } }, 'unknown'],
    [{ reply: { rid: '../../evil' } }, 'unknown'],
    [{ reply: '<html>Challenge</html>' }, 'unknown']
  ] as const) {
    const { result, calls } = await execute(options);
    assert.equal(result.state, state); assert.equal(calls.filter(c => c.init?.method === 'POST').length, 1);
  }
});
test('receipt URLs cannot escape the job origin or pretend a form click was accepted', () => {
  const job = submissionFor(url, 'code', 'cpp', adapter);
  assert.throws(() => validateReceipt(job, { ok: true, state: 'accepted', recordId: '1', recordUrl: 'https://evil.example/record/1' }), /无效/);
  assert.throws(() => validateReceipt(job, { ok: true, state: 'dispatched' }), /无效/);
});
test('configuration upgrade updates selected adapters only and rejects forged Luogu endpoints', () => {
  const cfg = structuredClone(defaultConfig); cfg.defaultLanguage = 'python'; cfg.adapters[0].name = 'my-custom-codeforces'; delete cfg.adapters[2].submit;
  const updated = updateBuiltinAdapters(cfg, ['Luogu']);
  assert.equal(updated.adapters[2].submit?.kind, 'luogu'); assert.equal(updated.adapters[0].name, 'my-custom-codeforces'); assert.equal(updated.defaultLanguage, 'python'); assert.deepEqual(updated.templates, cfg.templates); assert.equal(cfg.adapters[2].submit, undefined);
  const bad = structuredClone(updated); bad.adapters[2].hosts.push('evil.example'); assert.throws(() => validateConfig(bad), /官方域名/);
});
test('Codeforces Gym and VJudge AtCoder tasks with underscore contest prefixes resolve correctly', () => {
  const job = submissionFor('https://codeforces.com/gym/100001/problem/A', 'code', 'cpp', defaultConfig.adapters[0]);
  assert.equal(job.url, 'https://codeforces.com/gym/100001/submit');
  assert.equal(resolveVJudge(new JSDOM('').window.document, 'https://vjudge.net/problem/AtCoder-abc042_a', defaultConfig.adapters[3]), 'https://atcoder.jp/contests/abc042/tasks/abc042_a');
  assert.equal(resolveVJudge(new JSDOM('').window.document, 'https://vjudge.net/problem/AtCoder-dp_a', defaultConfig.adapters[3]), 'https://atcoder.jp/contests/dp/tasks/dp_a');
  assert.equal(resolveVJudge(new JSDOM('').window.document, 'https://vjudge.net/problem/AtCoder-math_and_algorithm_a', defaultConfig.adapters[3]), 'https://atcoder.jp/contests/math-and-algorithm/tasks/math_and_algorithm_a');
});
test('AtCoder Japanese-only samples and multiline output are imported without duplication', () => {
  const doc = new JSDOM('<span class="h2">A</span><div id="task-statement"><div class="lang-en"></div><div class="lang-ja"><section><h3>入力例 1</h3><pre>1\n2\n</pre></section><section><h3>出力例 1</h3><pre>3\n4\n</pre></section></div></div>').window.document;
  assert.deepEqual(extractProblem(doc, 'https://atcoder.jp/contests/abc/tasks/abc_a', defaultConfig.adapters[1]).samples, [{ input: '1\n2\n', output: '3\n4\n' }]);
});
