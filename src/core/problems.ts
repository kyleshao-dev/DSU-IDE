import { mkdir, readFile, writeFile, realpath, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { Config, Problem, ProblemRecord, Sample } from './types';

export async function listProblems(root: string, config: Config): Promise<ProblemRecord[]> {
  const folder = path.join(root, '.dsu/problems');
  try { await inside(root, folder); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []; throw e; }
  const records: ProblemRecord[] = [];
  for (const name of await readdir(folder)) {
    if (!/^[a-f0-9]{24}\.json$/.test(name)) continue;
    const file = path.join(folder, name);
    await inside(root, file);
    const record: ProblemRecord = JSON.parse(await readFile(file, 'utf8'));
    validateProblem(record, config);
    if (recordName(record.url) !== name || typeof record.file !== 'string' || !config.languages.some(l => l.id === record.language)) throw new Error(`题目记录无效：${name}`);
    await inside(root, path.resolve(root, record.file));
    records.push(record);
  }
  return records.sort((a, b) => a.oj.localeCompare(b.oj) || a.title.localeCompare(b.title));
}

export async function saveSamples(root: string, url: string, samples: Sample[], config: Config): Promise<ProblemRecord> {
  const file = path.join(root, '.dsu/problems', recordName(url));
  await inside(root, file);
  const record: ProblemRecord = JSON.parse(await readFile(file, 'utf8'));
  if (record.url !== url) throw new Error('题目记录地址不一致');
  const next = { ...record, samples };
  validateProblem(next, config);
  await writeFile(file, JSON.stringify(next, null, 2) + '\n');
  return next;
}

export function safeName(name: string): string {
  let s = name.normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/^[. ]+|[. ]+$/g, '').slice(0, 100).trim();
  if (!s || /^(CON|PRN|AUX|NUL|COM\d|LPT\d)(\.|$)/i.test(s)) s = '_' + (s || 'problem');
  return s;
}
export function validateProblem(raw: unknown, config: Config): Problem {
  const p = raw as Problem;
  if (!p || typeof p.title !== 'string' || !p.title.trim() || typeof p.oj !== 'string' || typeof p.id !== 'string' || typeof p.statement !== 'string') throw new Error('无效题目数据');
  const u = new URL(p.url);
  const a = config.adapters.find(x => x.id === p.oj && x.hosts.includes(u.hostname));
  if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password || !a || !new RegExp(a.problemPattern).test(u.pathname)) throw new Error('题目地址与 OJ 配置不匹配');
  if (!Array.isArray(p.samples) || p.samples.length > 100 || p.samples.some(s => typeof s.input !== 'string' || typeof s.output !== 'string')) throw new Error('无效样例');
  if (Buffer.byteLength(JSON.stringify(p)) > 2_000_000) throw new Error('题目数据不能超过 2 MB');
  return { oj: p.oj, id: p.id.slice(0, 200), title: p.title.slice(0, 300), url: u.href, statement: p.statement, samples: p.samples, ...(p.sourceUrl ? { sourceUrl: String(p.sourceUrl) } : {}) };
}
export async function inside(root: string, candidate: string): Promise<string> {
  const base = await realpath(root);
  const resolved = await realpath(candidate);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) throw new Error('路径超出工作区，拒绝访问');
  return resolved;
}
export function recordName(url: string): string { return createHash('sha256').update(url).digest('hex').slice(0, 24) + '.json'; }
export function recordForFile(record: ProblemRecord, root: string, file: string): ProblemRecord | undefined {
  const target = path.resolve(file);
  const files = { ...record.files, [record.language]: record.file };
  for (const [language, relative] of Object.entries(files)) {
    if (typeof relative === 'string' && path.resolve(root, relative) === target) return { ...record, language, file: relative };
  }
  return undefined;
}
export async function importProblem(root: string, raw: unknown, config: Config, languageId = config.defaultLanguage): Promise<ProblemRecord> {
  const p = validateProblem(raw, config);
  const lang = config.languages.find(x => x.id === languageId);
  if (!lang) throw new Error('未找到语言配置');
  const folder = path.join(root, safeName(p.oj));
  const meta = path.join(root, '.dsu', 'problems');
  await mkdir(folder, { recursive: true }); await mkdir(meta, { recursive: true });
  await inside(root, folder); await inside(root, meta);
  const metadata = path.join(meta, recordName(p.url));
  let previous: ProblemRecord | undefined;
  try { await inside(root, metadata); previous = JSON.parse(await readFile(metadata, 'utf8')); }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  const files = { ...previous?.files, ...(previous ? { [previous.language]: previous.file } : {}) };
  const existing = files[languageId];
  let file = existing ? path.resolve(root, existing) : path.join(folder, `${safeName(p.title)}.${lang.extension}`);
  // Never overwrite code: same-title, different-URL problems get a deterministic suffix.
  if (!existing) {
    try { await writeFile(file, lang.starter, { flag: 'wx' }); }
    catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      file = path.join(folder, `${safeName(p.title)}-${recordName(p.url).slice(0, 8)}.${lang.extension}`);
      try { await writeFile(file, lang.starter, { flag: 'wx' }); }
      catch (e2) { if ((e2 as NodeJS.ErrnoException).code !== 'EEXIST') throw e2; }
    }
  } else {
    try { await inside(root, file); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; await inside(root, path.dirname(file)); await writeFile(file, lang.starter, { flag: 'wx' }); }
  }
  await inside(root, file);
  const relative = path.relative(root, file);
  const record: ProblemRecord = { ...p, file: relative, language: languageId, files: { ...files, [languageId]: relative } };
  await writeFile(metadata, JSON.stringify(record, null, 2) + '\n');
  return record;
}
