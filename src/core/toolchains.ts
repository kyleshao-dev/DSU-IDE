import { access, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import type { Language } from './types';

export interface ToolchainStatus { id: string; name: string; ready: boolean; tools: { command: string; path?: string }[] }
export async function findExecutable(command: string, cwd: string, env: NodeJS.ProcessEnv = process.env): Promise<string | undefined> {
  const key = Object.keys(env).find(k => k.toLowerCase() === 'path');
  const directories = /[\\/]/.test(command) ? [''] : (env[key || 'PATH'] || '').split(path.delimiter);
  const extensions = process.platform === 'win32' && !path.extname(command) ? (env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';') : [''];
  for (const dir of directories) for (const extension of extensions) {
    const file = path.resolve(cwd, dir, command + extension);
    try { await access(file, process.platform === 'win32' ? constants.F_OK : constants.X_OK); if ((await stat(file)).isFile()) return file; } catch {}
  }
  return undefined;
}
export async function inspectToolchains(languages: Language[], cwd: string): Promise<ToolchainStatus[]> {
  return Promise.all(languages.map(async language => {
    const commands = [...new Set([language.compile?.[0], language.run[0]].filter((s): s is string => !!s && !s.includes('{')))];
    const tools = await Promise.all(commands.map(async command => ({ command, path: await findExecutable(command, cwd) })));
    return { id: language.id, name: language.name, ready: tools.every(t => !!t.path), tools };
  }));
}
