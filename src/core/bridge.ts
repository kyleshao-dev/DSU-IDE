import http from 'node:http';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Submission } from './types';

export type RpcHandler = (op: string, payload: unknown) => Promise<unknown>;
export function createBridge(token: string, handler: RpcHandler, port = 27121): Promise<http.Server> {
  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    // Browsers may only call from an extension worker, never from an OJ page.
    if (origin && !/^chrome-extension:\/\/[a-p]{32}$/.test(origin)) { res.writeHead(403).end(); return; }
    if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Methods', 'POST');
      res.writeHead(204).end(); return;
    }
    const auth = Buffer.from(req.headers.authorization || ''); const expected = Buffer.from(`Bearer ${token}`);
    if (auth.length !== expected.length || !timingSafeEqual(auth, expected)) { res.writeHead(401).end(); return; }
    if (req.method !== 'POST' || req.url !== '/rpc') { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    try {
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 2_000_000) { res.writeHead(413).end(); return; }
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString());
      if (typeof body.op !== 'string') throw new Error('缺少 op');
      const result = await handler(body.op, body.payload);
      res.end(JSON.stringify({ ok: true, result }));
    } catch (e) { res.writeHead(400).end(JSON.stringify({ ok: false, error: (e as Error).message })); }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000;
  return new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => resolve(server)); });
}
export const makeToken = () => randomBytes(32).toString('hex');
export type SubmissionJob = Submission & { id: string; expires: number };
export class SubmissionQueue {
  private jobs = new Map<string, SubmissionJob>();
  enqueue(submission: Submission): SubmissionJob {
    this.prune();
    if ([...this.jobs.values()].some(j => this.key(j.url) === this.key(submission.url))) throw new Error('该提交页已有待提交任务，请等待或取消');
    const job = { ...submission, id: randomUUID(), expires: Date.now() + 120000 };
    this.jobs.set(job.id, job); return job;
  }
  private key(url: string) { const u = new URL(url); u.hash = ''; u.searchParams.sort(); return u.href; }
  private prune() { for (const [id, job] of this.jobs) if (job.expires < Date.now()) this.jobs.delete(id); }
  claim(url: string): SubmissionJob | null {
    this.prune();
    const job = [...this.jobs.values()].find(j => this.key(j.url) === this.key(url));
    if (!job) return null;
    this.jobs.delete(job.id); return job; // At-most-once: never silently retry a remote submission.
  }
  clear() { this.jobs.clear(); }
  remove(id: string) { this.jobs.delete(id); }
}
