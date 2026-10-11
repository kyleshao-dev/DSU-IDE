import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import defaults from '../../config/defaults.json';
import type { Config } from './types';

export const defaultConfig = defaults as Config;
export function validateConfig(value: unknown): Config {
  const c = value as Config;
  if (!c || c.version !== 1 || !Array.isArray(c.languages) || !Array.isArray(c.adapters) || !Array.isArray(c.templates)) throw new Error('配置必须包含 version: 1、languages、adapters、templates');
  const ids = new Set<string>();
  for (const l of c.languages) {
    if (!/^[a-z][a-z0-9+-]*$/.test(l.id) || ids.has(l.id) || !/^[a-z0-9]+$/.test(l.extension)) throw new Error('语言 ID 重复或扩展名无效');
    ids.add(l.id);
    for (const cmd of [l.compile, l.run].filter(Boolean)) if (!Array.isArray(cmd) || !cmd.length || cmd.some(x => typeof x !== 'string')) throw new Error('编译、运行命令必须是非空字符串数组');
    if (!l.run || typeof l.starter !== 'string' || typeof l.vscode !== 'string') throw new Error('语言缺少 run/starter/vscode');
    if (l.sourceName && !/^[\w.-]+$/.test(l.sourceName)) throw new Error('sourceName 只能为文件名');
  }
  if (!ids.has(c.defaultLanguage)) throw new Error('defaultLanguage 不存在');
  for (const n of [c.timeoutMs, c.compileTimeoutMs]) if (!Number.isFinite(n) || n < 100 || n > 300000) throw new Error('超时应在 100–300000 毫秒之间');
  if (!['tokens', 'exact', 'trim'].includes(c.comparison)) throw new Error('无效 comparison');
  const aIds = new Set();
  for (const a of c.adapters) {
    if (!/^[a-zA-Z0-9_-]+$/.test(a.id) || aIds.has(a.id)) throw new Error('OJ ID 无效或重复');
    aIds.add(a.id);
    if (!Array.isArray(a.hosts) || !a.hosts.length || a.hosts.some(h => !/^[a-z0-9.-]+$/.test(h))) throw new Error('OJ hosts 必须是域名，不含协议');
    new RegExp(a.problemPattern);
    for (const s of [a.title, a.statement, a.inputs, a.outputs]) if (typeof s !== 'string' || !s) throw new Error('OJ 选择器不能为空');
    if (a.submit) {
      if (!a.submit.languageValues || typeof a.submit.languageValues !== 'object' || Array.isArray(a.submit.languageValues) || Object.values(a.submit.languageValues).some(v => typeof v !== 'string' || !v.trim()) || !a.submit.url) throw new Error('提交配置不完整');
      if (a.submit.kind === 'luogu') {
        if (a.hosts.some(h => !['www.luogu.com.cn', 'www.luogu.com'].includes(h))) throw new Error('luogu 提交器只能用于洛谷官方域名');
        if (Object.values(a.submit.languageValues).some(v => !/^[1-9]\d*$/.test(v))) throw new Error('洛谷语言值必须是正整数 ID');
        if (a.submit.enableO2 !== undefined && typeof a.submit.enableO2 !== 'boolean') throw new Error('enableO2 必须是布尔值');
      } else {
        if (a.submit.kind && a.submit.kind !== 'form') throw new Error('未知提交器类型');
        if ([a.submit.codeSelector, a.submit.languageSelector, a.submit.submitSelector].some(x => typeof x !== 'string' || !x)) throw new Error('表单提交配置不完整');
      }
      const u = new URL(a.submit.url.replace(/\{\d+\}/g, '1'), `https://${a.hosts[0]}`);
      if (u.protocol !== 'https:' || !a.hosts.includes(u.hostname)) throw new Error('提交地址必须是该 OJ 的 HTTPS 地址');
    }
  }
  for (const t of c.templates) if (![t.name, t.prefix, t.language, t.body].every(x => typeof x === 'string') || !ids.has(t.language)) throw new Error('模板字段或语言无效');
  return c;
}
/** Replace only explicitly selected built-ins; keep all other user configuration. */
export function updateBuiltinAdapters(config: Config, ids: string[]): Config {
  const result = structuredClone(config);
  for (const id of new Set(ids)) {
    const builtin = defaultConfig.adapters.find(a => a.id === id);
    if (!builtin) throw new Error(`未知内置 OJ：${id}`);
    const index = result.adapters.findIndex(a => a.id === id);
    if (index < 0) result.adapters.push(structuredClone(builtin)); else result.adapters[index] = structuredClone(builtin);
  }
  return validateConfig(result);
}
export async function loadConfig(root: string): Promise<Config> {
  try { return validateConfig(JSON.parse(await readFile(path.join(root, '.dsu/config.json'), 'utf8'))); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return structuredClone(defaultConfig); throw e; }
}
export async function initializeConfig(root: string): Promise<string> {
  const file = path.join(root, '.dsu/config.json');
  await mkdir(path.dirname(file), { recursive: true });
  try { await writeFile(file, JSON.stringify(defaultConfig, null, 2) + '\n', { flag: 'wx' }); }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; }
  return file;
}
