import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { defaultConfig } from '../src/core/config';
import { extractProblem, resolveVJudge, submissionFor } from '../src/page/extract';
import { fillSubmission } from '../src/page/fill';
import { buildSync } from 'esbuild';

test('Codeforces div-based multiline and br-based samples keep newlines', () => {
  const doc = new JSDOM('<div class="problem-statement"><div class="title">A. Sum</div><div class="sample-test"><div class="input"><pre><div>2</div><div>1 2</div></pre></div><div class="output"><pre>3<br>4</pre></div></div></div>').window.document;
  const p = extractProblem(doc, 'https://codeforces.com/problemset/problem/1/A', defaultConfig.adapters[0]);
  assert.deepEqual(p.samples, [{ input: '2\n1 2\n', output: '3\n4\n' }]);
});
test('AtCoder bilingual page imports only one language of samples', () => {
  const section = '<section><h3>Sample Input 1</h3><pre>1 2</pre></section><section><h3>Sample Output 1</h3><pre>3</pre></section>';
  const doc = new JSDOM(`<span class="h2">A - Sum</span><div id="task-statement"><div class="lang-ja">${section}</div><div class="lang-en">${section}</div></div>`).window.document;
  const p = extractProblem(doc, 'https://atcoder.jp/contests/abc001/tasks/abc001_1', defaultConfig.adapters[1]);
  assert.equal(p.samples.length, 1); assert.equal(p.samples[0].output, '3\n');
});
test('Luogu embedded JSON is parsed as data', () => {
  const doc = new JSDOM('<script id="lentille-context" type="application/json">{"data":{"problem":{"title":"A+B","content":{"description":"Sum"},"samples":[["1 2","3"]]}}}</script>').window.document;
  const p = extractProblem(doc, 'https://www.luogu.com.cn/problem/P1001', defaultConfig.adapters[2]);
  assert.equal(p.title, 'A+B'); assert.equal(p.samples[0].input, '1 2');
});
test('VJudge resolves known origins and fails closed for unknown sites', () => {
  const doc = new JSDOM('').window.document, a = defaultConfig.adapters[3];
  assert.equal(resolveVJudge(doc, 'https://vjudge.net/problem/CodeForces-1A', a), 'https://codeforces.com/problemset/problem/1/A');
  assert.equal(resolveVJudge(doc, 'https://vjudge.net/problem/Unknown-1', a), undefined);
});
test('submission requires explicit language mapping and targets the correct problem', () => {
  const job = submissionFor('https://codeforces.com/problemset/problem/123/A', 'code', 'cpp', defaultConfig.adapters[0]);
  assert.ok(job.kind !== 'luogu');
  assert.equal(job.url, 'https://codeforces.com/contest/123/submit'); assert.equal(job.problem?.value, 'A');
  assert.throws(() => submissionFor('https://codeforces.com/contest/123/problem/A', '', 'haskell', defaultConfig.adapters[0]), /未配置/);
});
test('form fill checks compiler ambiguity and source before clicking submit', async () => {
  const dom = new JSDOM('<select name="programTypeId"><option value="1">GNU G++20 (64)</option></select><select name="submittedProblemIndex"><option value="A">A</option></select><textarea name="source"></textarea><input type="button" class="submit">', { url: 'https://codeforces.com/contest/123/submit', runScripts: 'outside-only' });
  let clicked = 0; dom.window.document.querySelector('.submit')!.addEventListener('click', () => clicked++);
  // Exercise the production serialization, not tsx's keepNames helper wrappers.
  const compiled = buildSync({ entryPoints: ['src/page/fill.ts'], bundle: true, format: 'iife', globalName: 'DSUFill', write: false }).outputFiles[0].text;
  const serialized = dom.window.eval(compiled + '\nDSUFill.fillSubmission.toString()') as string;
  const job = submissionFor('https://codeforces.com/contest/123/problem/A', 'int main(){}', 'cpp', defaultConfig.adapters[0]);
  const result = await dom.window.eval(`(${serialized})(${JSON.stringify(job)})`) as Awaited<ReturnType<typeof fillSubmission>>;
  assert.equal(result.ok, true); assert.equal(dom.window.document.querySelector('textarea')!.value, 'int main(){}');
  await new Promise(r => setTimeout(r, 350)); assert.equal(clicked, 1);
  dom.window.document.querySelector('select')!.insertAdjacentHTML('beforeend', '<option value="2">GNU G++20 (32)</option>');
  const ambiguous = await dom.window.eval(`(${serialized})(${JSON.stringify(job)})`) as Awaited<ReturnType<typeof fillSubmission>>;
  assert.equal(ambiguous.ok, false); assert.ok(!ambiguous.ok); assert.match(ambiguous.error, /匹配到 2 项/);
  dom.window.close();
});
