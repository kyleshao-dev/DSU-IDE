import type { Submission, SubmissionResult } from './types';

/** Treat a browser receipt as untrusted; only expose a record URL bound to the job. */
export function validateReceipt(job: Submission, value: unknown): SubmissionResult {
  const r = value as Partial<SubmissionResult> & { recordId?: string; recordUrl?: string; error?: string };
  if (r?.ok === true && r.state === 'accepted' && job.kind === 'luogu' && typeof r.recordId === 'string' && /^[1-9]\d*$/.test(r.recordId)) {
    const expected = new URL(`/record/${r.recordId}`, new URL(job.url).origin).href;
    if (r.recordUrl === expected) return { ok: true, state: 'accepted', recordId: r.recordId, recordUrl: expected };
  }
  if (r?.ok === true && r.state === 'dispatched' && job.kind !== 'luogu') return { ok: true, state: 'dispatched' };
  if (r?.ok === false && ['failed', 'action-required', 'unknown'].includes(r.state || '') && typeof r.error === 'string') return { ok: false, state: r.state as 'failed' | 'action-required' | 'unknown', error: r.error.slice(0, 500) };
  throw new Error('无效提交回执，无法确认 OJ 是否受理，请检查原站记录');
}
export function receiptMessage(r: SubmissionResult): string {
  if (!r.ok) return r.error;
  return r.state === 'accepted' ? `洛谷已受理 · 记录 #${r.recordId}（不代表 AC）` : '已请求网页提交，请在 OJ 页面查看是否受理及最终结果';
}
