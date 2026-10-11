import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Config, Language, Sample, TestResult } from './types';

const MAX_OUTPUT = 1024 * 1024;
export interface ProcessResult { stdout: string; stderr: string; elapsedMs: number; code: number | null; timedOut: boolean; overflow: boolean }
export function runProcess(args: string[], cwd: string, input: string, timeout: number, signal?: AbortSignal): Promise<ProcessResult> {
  return new Promise(resolve => {
    const start = performance.now();
    const proc = spawn(args[0], args.slice(1), { cwd, shell: false, detached: process.platform !== 'win32', windowsHide: true, stdio: 'pipe' });
    let stdout = '', stderr = '', bytes = 0, timedOut = false, overflow = false, done = false;
    const kill = () => {
      if (!proc.pid) return;
      if (process.platform === 'win32') spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { windowsHide: true }).on('error', () => proc.kill());
      else { try { process.kill(-proc.pid, 'SIGKILL'); } catch { proc.kill('SIGKILL'); } }
    };
    const timer = setTimeout(() => { timedOut = true; kill(); }, timeout);
    const abort = () => { stderr += '\n用户取消'; kill(); };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const finish = (code: number | null) => {
      if (done) return; done = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
      kill(); // Clean up descendant processes even when the parent exited normally.
      resolve({ stdout, stderr, elapsedMs: Math.round(performance.now() - start), code, timedOut, overflow });
    };
    proc.stdout.setEncoding('utf8'); proc.stderr.setEncoding('utf8');
    const append = (chunk: string, err: boolean) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > MAX_OUTPUT) { overflow = true; kill(); return; }
      if (err) stderr += chunk; else stdout += chunk;
    };
    proc.stdout.on('data', c => append(c, false)); proc.stderr.on('data', c => append(c, true));
    proc.on('error', e => { stderr += `${e.message}\n请安装对应编译器/运行时并确保它位于 PATH。`; finish(-1); });
    proc.on('close', finish); proc.stdin.on('error', () => {}); proc.stdin.end(input);
  });
}
export function compare(actual: string, expected: string, mode: Config['comparison']): boolean {
  const normalize = (s: string) => s.replace(/\r\n/g, '\n');
  if (mode === 'exact') return normalize(actual) === normalize(expected);
  if (mode === 'trim') return normalize(actual).trimEnd() === normalize(expected).trimEnd();
  return actual.trim().split(/\s+/).join(' ') === expected.trim().split(/\s+/).join(' ');
}
export async function runSamples(file: string, language: Language, samples: Sample[], config: Config, signal?: AbortSignal): Promise<TestResult[]> {
  if (!samples.length) throw new Error('没有样例，请在样例面板添加或编辑样例');
  const build = await mkdtemp(path.join(os.tmpdir(), 'dsu-'));
  try {
    const source = path.join(build, language.sourceName || `solution.${language.extension}`);
    await writeFile(source, await readFile(file));
    const values: Record<string, string> = { source, build, exe: path.join(build, process.platform === 'win32' ? 'solution.exe' : 'solution'), file: source };
    const expand = (cmd: string[]) => cmd.map(a => a.replace(/\{(source|build|exe|file)\}/g, (_, key: string) => values[key]));
    if (signal?.aborted) throw new Error('用户取消');
    if (language.compile) {
      const r = await runProcess(expand(language.compile), build, '', config.compileTimeoutMs, signal);
      if (signal?.aborted) throw new Error('用户取消');
      if (r.code !== 0 || r.timedOut || r.overflow) return [{ ...r, stderr: (r.timedOut ? '编译超时\n' : '') + r.stderr, status: 'CE', expected: '' }];
    }
    const results: TestResult[] = [];
    for (const s of samples) {
      if (signal?.aborted) throw new Error('用户取消');
      const r = await runProcess(expand(language.run), build, s.input, config.timeoutMs, signal);
      if (signal?.aborted) throw new Error('用户取消');
      results.push({ ...r, expected: s.output, status: r.timedOut ? 'TLE' : r.overflow ? 'OLE' : r.code !== 0 ? 'RE' : compare(r.stdout, s.output, config.comparison) ? 'AC' : 'WA' });
    }
    return results;
  } finally { await rm(build, { recursive: true, force: true }); }
}
