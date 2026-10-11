import type { Submission, SubmissionResult } from '../core/types';

// Self-contained: Chrome executes this function in MAIN world; native browser uses CDP.
export async function fillSubmission(job: Submission): Promise<SubmissionResult> {
  let attempted = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const here = new URL(location.href), target = new URL(job.url);
    here.hash = ''; target.hash = ''; here.searchParams.sort(); target.searchParams.sort();
    if (here.href !== target.href) throw new Error('提交页地址不一致');
    if (job.kind === 'luogu') {
      if (target.protocol !== 'https:' || !['www.luogu.com.cn', 'www.luogu.com'].includes(target.hostname) || target.username || target.password || target.pathname !== `/problem/${job.pid}` || !/^[A-Za-z0-9_]+$/.test(job.pid)) throw new Error('洛谷提交目标无效');
      if ((target.searchParams.get('contestId') || undefined) !== job.contestId || (job.contestId && !/^[1-9]\d*$/.test(job.contestId))) throw new Error('洛谷比赛上下文不一致');
      const language = Number(job.languageValues[job.language]);
      if (!Number.isSafeInteger(language) || language <= 0) throw new Error('洛谷语言 ID 无效');
      if (!job.code.trim()) throw new Error('代码为空，未提交');
      const controller = new AbortController();
      timer = setTimeout(() => controller.abort(), 15000);
      // Read fresh HTML: the visible page may have navigated through Luogu's SPA router.
      const page = await fetch(target.href, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'text/html' }, signal: controller.signal });
      if (!page.ok || new URL(page.url).origin !== target.origin) return { ok: false, state: 'action-required', error: `无法读取洛谷题目（HTTP ${page.status}），请在网页登录或完成验证后重新提交` };
      const doc = new DOMParser().parseFromString(await page.text(), 'text/html');
      const data = doc.querySelector('script#lentille-context[type="application/json"]')?.textContent;
      if (!data) return { ok: false, state: 'action-required', error: '洛谷页面没有题目数据，请在网页完成登录或验证后重新提交' };
      const context = JSON.parse(data);
      if (!context.user?.uid) return { ok: false, state: 'action-required', error: '请先在此浏览器登录洛谷，再从 IDE 提交' };
      const problem = context.data?.problem;
      if (problem?.pid !== job.pid) throw new Error('洛谷返回了不同题目的数据，未提交');
      const contest = context.data?.contest?.id;
      if (String(contest ?? '') !== (job.contestId || '')) throw new Error('洛谷返回的比赛上下文不一致，未提交');
      if (!Array.isArray(problem.acceptLanguages) || !problem.acceptLanguages.includes(language)) throw new Error('这道题不接受所选语言，请修改洛谷 languageValues 或切换语言');
      const languageResponse = await fetch(new URL('/_lfe/config', target.origin).href, { credentials: 'same-origin', headers: { Accept: 'application/json' }, signal: controller.signal });
      if (!languageResponse.ok) throw new Error('无法核对洛谷当前语言配置，未提交');
      const languageConfig = (await languageResponse.json()).CodeLanguage?.[String(language)];
      if (!languageConfig || languageConfig.id !== language || languageConfig.disabled !== false) throw new Error('洛谷当前未启用此语言，未提交');
      const csrf = doc.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
      if (!csrf) return { ok: false, state: 'action-required', error: '洛谷 CSRF 校验信息缺失，请刷新网页后重试' };
      // Credentials and the CSRF token stay in the browser, never enter the IDE bridge.
      const endpoint = new URL(`/fe/api/problem/submit/${job.pid}`, target.origin);
      if (job.contestId) endpoint.searchParams.set('contestId', job.contestId);
      const current = new URL(location.href); current.hash = ''; current.searchParams.sort();
      if (current.href !== target.href) throw new Error('等待期间页面已切换，未提交；请重新打开此题');
      attempted = true;
      const response = await fetch(endpoint.href, {
        method: 'POST', credentials: 'same-origin', redirect: 'error', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-TOKEN': csrf, 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ lang: language, code: job.code, enableO2: job.enableO2 && languageConfig.canO2 ? 1 : 0 })
      });
      let result: any;
      try { result = await response.json(); } catch { return { ok: false, state: 'unknown', error: '洛谷返回了非 JSON 响应，提交结果未知。请先检查提交记录，不要立即重复提交' }; }
      const errorType = typeof result?.errorType === 'string' ? result.errorType : '';
      const message = typeof result?.errorMessage === 'string' ? result.errorMessage : typeof result?.message === 'string' ? result.message : '';
      if (/captcha|verify|验证|验证码/i.test(errorType + message)) return { ok: false, state: 'action-required', error: '洛谷要求验证码，请在原网页完成验证并提交；DSU 不会自动重试或绕过验证' };
      if (response.status === 401 || response.status === 403 || /login|登录|csrf/i.test(errorType + message)) return { ok: false, state: 'action-required', error: '洛谷拒绝此次提交，请检查登录、比赛报名权限或刷新页面后重试' };
      if (response.status >= 500) return { ok: false, state: 'unknown', error: '洛谷服务暂时异常，提交结果未知。请先检查提交记录' };
      if (!response.ok || errorType || result?.errorMessage || (typeof result?.status === 'number' && result.status >= 400)) return { ok: false, state: 'failed', error: `洛谷未受理提交（HTTP ${response.status}）${message ? '：' + message.slice(0, 300) : ''}` };
      const rid = result?.rid;
      if (!((typeof rid === 'number' && Number.isSafeInteger(rid) && rid > 0) || (typeof rid === 'string' && /^[1-9]\d*$/.test(rid)))) return { ok: false, state: 'unknown', error: '洛谷未返回有效提交记录编号，结果未知。请先检查提交记录' };
      return { ok: true, state: 'accepted', recordId: String(rid), recordUrl: new URL(`/record/${rid}`, target.origin).href };
    }
    const choose = (selector: string, value: string, exact = false) => {
      const select = document.querySelector<HTMLSelectElement>(selector);
      if (!select || select.tagName !== 'SELECT') throw new Error(`未找到语言/题目下拉框：${selector}`);
      const options = Array.from(select.options);
      const byValue = options.filter(o => o.value === value);
      const byText = options.filter(o => o.text.trim() === value);
      const candidates = byValue.length ? byValue : byText.length ? byText : exact ? [] : options.filter(o => o.text.includes(value));
      if (candidates.length !== 1) throw new Error(`选项“${value}”匹配到 ${candidates.length} 项，请在配置中指定准确 ID 或完整名称`);
      select.value = candidates[0].value; select.dispatchEvent(new Event('input', { bubbles: true })); select.dispatchEvent(new Event('change', { bubbles: true }));
    };
    choose(job.languageSelector, job.languageValues[job.language]);
    if (job.problem) choose(job.problem.selector, job.problem.value, true);
    const source = document.querySelector<HTMLTextAreaElement>(job.codeSelector);
    if (!source || !['TEXTAREA', 'INPUT'].includes(source.tagName)) throw new Error('找不到源代码输入框，请先登录或检查 codeSelector');
    const proto = source.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(source, job.code);
    source.dispatchEvent(new Event('input', { bubbles: true })); source.dispatchEvent(new Event('change', { bubbles: true }));
    // AtCoder/other classic editors synchronize on form submit, so set their model too.
    const cm = document.querySelector('.CodeMirror') as (HTMLElement & { CodeMirror?: { setValue(s: string): void; save(): void } }) | null;
    if (cm?.CodeMirror) { cm.CodeMirror.setValue(job.code); cm.CodeMirror.save(); }
    const w = window as typeof window & { ace?: { edit(e: Element): { setValue(s: string, cursor: number): void; getValue(): string } } };
    const ace = document.querySelector('.ace_editor');
    if (ace && w.ace) { const editor = w.ace.edit(ace); editor.setValue(job.code, -1); if (editor.getValue() !== job.code) throw new Error('编辑器回读不一致'); }
    if (source.value !== job.code) throw new Error('代码回读校验失败，未提交');
    const submit = document.querySelector<HTMLElement>(job.submitSelector);
    if (!submit || (submit as HTMLButtonElement).disabled) throw new Error('未找到可用提交按钮，请登录并完成站点验证');
    // Defer navigation long enough for the bridge to acknowledge the click request.
    setTimeout(() => submit.click(), 300);
    return { ok: true, state: 'dispatched' };
  } catch (e) {
    return { ok: false, state: attempted ? 'unknown' : 'failed', error: attempted ? '提交请求发生网络异常，结果未知。请先检查 OJ 提交记录，不要立即重复提交' : (e as Error).message };
  } finally { if (timer) clearTimeout(timer); }
}
