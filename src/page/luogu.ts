/** Parse inert embedded data only. Never execute a site's inline scripts. */
export function luoguContext(doc: Document): Record<string, any> | undefined {
  const text = doc.querySelector('script#lentille-context[type="application/json"]')?.textContent;
  if (text) {
    try { return JSON.parse(text); } catch { throw new Error('洛谷题目数据损坏，请刷新页面'); }
  }
  for (const script of doc.querySelectorAll('script:not([src])')) {
    const m = /(?:window\.)?_feInjection\s*=\s*JSON\.parse\(\s*decodeURIComponent\(\s*(["'])(.*?)\1\s*\)\s*\)/.exec(script.textContent || '');
    if (m) {
      try { return JSON.parse(decodeURIComponent(m[2])); } catch { throw new Error('旧版洛谷题目数据损坏，请刷新页面'); }
    }
  }
  return undefined;
}
export function luoguProblem(doc: Document, url: string) {
  const context = luoguContext(doc);
  const problem = context?.data?.problem || context?.currentData?.problem;
  if (!problem) return undefined;
  const pid = new URL(url).pathname.match(/^\/problem\/([A-Za-z0-9_]+)\/?$/)?.[1];
  if (problem.pid && problem.pid !== pid) throw new Error('洛谷页面数据属于另一道题，请刷新页面后再导入');
  const content = problem.content || problem.contenu || problem;
  const fields = [
    ['题目背景', content.background], ['题目描述', content.description],
    ['输入格式', content.formatI ?? content.inputFormat], ['输出格式', content.formatO ?? content.outputFormat],
    ['说明/提示', content.hint]
  ];
  const samples = problem.samples;
  if (!Array.isArray(samples) || samples.some(s => !Array.isArray(s) || s.length !== 2 || s.some(v => typeof v !== 'string'))) throw new Error('洛谷样例格式无效，请刷新页面或检查适配器');
  return {
    title: problem.name || problem.title || content.name,
    statement: fields.filter(([, v]) => typeof v === 'string' && v.length).map(([label, v]) => `## ${label}\n\n${v}`).join('\n\n'),
    samples: samples.map(([input, output]: string[]) => ({ input, output }))
  };
}
