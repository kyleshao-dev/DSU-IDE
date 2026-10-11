import type { Adapter, Problem, Submission } from '../core/types';
import { luoguProblem } from './luogu';

export function matchAdapter(url: string, adapters: Adapter[]): Adapter | undefined {
  const u = new URL(url);
  return adapters.find(a => a.hosts.includes(u.hostname) && new RegExp(a.problemPattern).test(u.pathname));
}
export function textOf(element: Element | null): string {
  if (!element) return '';
  const copy = element.cloneNode(true) as Element;
  copy.querySelectorAll('script,style,button').forEach(n => n.remove());
  copy.querySelectorAll('br').forEach(n => n.replaceWith('\n'));
  // Codeforces renders sample lines as divs; textContent alone joins them.
  copy.querySelectorAll('div,p,section,h1,h2,h3,h4,li').forEach(n => n.append('\n'));
  return (copy.textContent || '').replace(/\u00a0/g, ' ').replace(/^\n+|\n+$/g, '');
}
export function resolveVJudge(doc: Document, url: string, a: Adapter): string | undefined {
  const link = a.sourceLink ? doc.querySelector<HTMLAnchorElement>(a.sourceLink) : null;
  if (link?.getAttribute('href')) {
    const u = new URL(link.getAttribute('href')!, url);
    if (['http:', 'https:'].includes(u.protocol) && u.hostname !== 'vjudge.net') return u.href;
  }
  const id = new URL(url).pathname.split('/').pop() || '';
  let m;
  if ((m = /^CodeForces-(\d+)([A-Za-z][0-9]?)$/i.exec(id))) return `https://codeforces.com/problemset/problem/${m[1]}/${m[2].toUpperCase()}`;
  if ((m = /^AtCoder-(.+)_([^_]+)$/i.exec(id))) return `https://atcoder.jp/contests/${m[1].replace(/_/g, '-')}/tasks/${m[1]}_${m[2]}`;
  if ((m = /^洛谷-(.+)$|^Luogu-(.+)$/i.exec(id))) return `https://www.luogu.com.cn/problem/${m[1] || m[2]}`;
  if ((m = /^HDU-(\d+)$/i.exec(id))) return `https://acm.hdu.edu.cn/showproblem.php?pid=${m[1]}`;
  if ((m = /^POJ-(\d+)$/i.exec(id))) return `http://poj.org/problem?id=${m[1]}`;
  return undefined;
}
export function extractProblem(doc: Document, url: string, a: Adapter): Problem {
  const u = new URL(url); const match = u.pathname.match(a.problemPattern);
  let title = textOf(doc.querySelector(a.title)).trim();
  let statement = textOf(doc.querySelector(a.statement));
  let inputs = Array.from(doc.querySelectorAll(a.inputs)).map(textOf);
  let outputs = Array.from(doc.querySelectorAll(a.outputs)).map(textOf);
  if (a.id === 'AtCoder') {
    const english = doc.querySelector('#task-statement .lang-en');
    const area = english?.querySelector('pre') ? english : doc.querySelector('#task-statement .lang-ja') || doc.querySelector('#task-statement');
    statement = textOf(area);
    const sections = Array.from(area?.querySelectorAll('section') || []);
    inputs = sections.filter(s => /Sample Input|入力例/i.test(s.querySelector('h3')?.textContent || '')).map(s => textOf(s.querySelector('pre')));
    outputs = sections.filter(s => /Sample Output|出力例/i.test(s.querySelector('h3')?.textContent || '')).map(s => textOf(s.querySelector('pre')));
  }
  if (a.id === 'Luogu') {
    const p = luoguProblem(doc, url);
    if (!p) throw new Error('没有找到洛谷题目数据，请登录或完成验证后刷新页面');
    title = p.title || title; statement = p.statement;
    if (!title) throw new Error('洛谷题目标题为空');
    return { oj: a.id, id: u.pathname.split('/')[2], title, url: u.href, statement, samples: p.samples };
  }
  if (a.id === 'HDU') {
    const panels = Array.from(doc.querySelectorAll('.panel_title'));
    inputs = panels.filter(s => /Sample Input/i.test(s.textContent || '')).map(s => textOf(s.nextElementSibling));
    outputs = panels.filter(s => /Sample Output/i.test(s.textContent || '')).map(s => textOf(s.nextElementSibling));
  }
  if (!title) throw new Error('未找到题目标题，请等待页面加载，或编辑 OJ 选择器');
  if (inputs.length !== outputs.length) throw new Error('样例输入与输出数量不一致，请检查 OJ 配置');
  const line = (s: string) => s.endsWith('\n') ? s : s + '\n';
  return { oj: a.id, id: match?.slice(1).join('-') || u.searchParams.get('id') || u.searchParams.get('pid') || title, title, url: u.href, statement, samples: inputs.map((input, i) => ({ input: line(input), output: line(outputs[i]) })) };
}
/** Luogu is an SPA: reload inert HTML so an old hydration script cannot import the previous problem. */
export async function readProblem(doc: Document, url: string, a: Adapter, fetchPage: typeof fetch = fetch, parseHTML = (html: string) => new DOMParser().parseFromString(html, 'text/html')): Promise<Problem> {
  if (a.id !== 'Luogu') return extractProblem(doc, url, a);
  const u = new URL(url);
  if (!a.hosts.includes(u.hostname) || u.protocol !== 'https:') throw new Error('洛谷题目地址无效');
  const response = await fetchPage(u.href, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'text/html' }, signal: AbortSignal.timeout(10000) });
  if (!response.ok || new URL(response.url).origin !== u.origin) throw new Error(`读取洛谷题目失败（HTTP ${response.status}），请在网页检查登录和验证状态`);
  return extractProblem(parseHTML(await response.text()), url, a);
}
export function submissionFor(url: string, code: string, language: string, a: Adapter): Submission {
  if (!a.submit) throw new Error(`${a.name} 尚未配置自动提交，请在 .dsu/config.json 添加 submit 配置，或手动提交`);
  const u = new URL(url), matches = u.pathname.match(a.problemPattern);
  if (!matches || !a.hosts.includes(u.hostname) || u.username || u.password) throw new Error('题目 URL 不匹配');
  const expand = (s: string) => s.replace(/\{(\d+)\}/g, (_, i) => matches[Number(i)] || '');
  const target = new URL(expand(a.submit.url), url);
  if (a.id === 'Codeforces' && u.pathname.startsWith('/gym/') && a.submit.url === '/contest/{1}/submit') target.pathname = target.pathname.replace('/contest/', '/gym/');
  if (target.protocol !== 'https:' || !a.hosts.includes(target.hostname)) throw new Error('提交目标不在 OJ 域名内');
  if (!a.submit.languageValues[language]) throw new Error('当前语言未配置 OJ 编译器名称/ID');
  if (a.submit.kind === 'luogu') {
    const pid = u.pathname.match(/^\/problem\/([A-Za-z0-9_]+)\/?$/)?.[1];
    if (!pid || target.pathname !== `/problem/${pid}` || target.origin !== u.origin || target.search) throw new Error('洛谷提交必须使用对应题目页');
    const contests = u.searchParams.getAll('contestId');
    if (contests.length > 1 || (contests.length && !/^[1-9]\d*$/.test(contests[0]))) throw new Error('洛谷 contestId 无效');
    const contestId = contests[0];
    if (contestId) target.searchParams.set('contestId', contestId);
    return { kind: 'luogu', url: target.href, pid, code, language, languageValues: a.submit.languageValues, enableO2: a.submit.enableO2 ?? true, ...(contestId ? { contestId } : {}) };
  }
  return { ...a.submit, url: target.href, code, language, ...(a.submit.problemSelector ? { problem: { selector: a.submit.problemSelector, value: expand(a.submit.problemValue || '') } } : {}) };
}
