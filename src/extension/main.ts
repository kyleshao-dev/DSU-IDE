import * as vscode from 'vscode';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { defaultConfig, loadConfig, initializeConfig, updateBuiltinAdapters } from '../core/config';
import { importProblem, inside, recordName, recordForFile, validateProblem, listProblems, saveSamples } from '../core/problems';
import { createBridge, makeToken, SubmissionQueue } from '../core/bridge';
import { runSamples } from '../core/runner';
import { submissionFor } from '../page/extract';
import { receiptMessage, validateReceipt } from '../core/submission';
import type { ProblemRecord, Submission } from '../core/types';
import { BrowserIntegration } from './browser';
import { ProblemPanel } from './panel';
import { HomePanel } from './home';
import { ProblemTree } from './tree';
import { inspectToolchains } from '../core/toolchains';

export async function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel('DSU IDE');
  context.subscriptions.push(output);
  const root = () => {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) throw new Error('请先打开一个用于存放题目的文件夹');
    if (folders.length !== 1 || folders[0].uri.scheme !== 'file') throw new Error('0.1.2 支持单文件夹本地工作区');
    return folders[0].uri.fsPath;
  };
  const trusted = () => { if (!vscode.workspace.isTrusted) throw new Error('请先信任此工作区，再创建文件、运行或提交代码'); return root(); };
  const config = () => loadConfig(root());
  const report = (e: unknown) => { const message = (e as Error).message; output.appendLine(message); void vscode.window.showErrorMessage(`DSU IDE: ${message}`); };
  let active: ProblemRecord | undefined, controller: AbortController | undefined;
  let importing = false;
  const jobs = new SubmissionQueue();
  const outstanding = new Map<string, { url: string; expires: number; problemUrl: string; job: Submission }>();
  const recordUrls = new Map<string, string>();
  const panel = new ProblemPanel(async (cmd, payload) => { try { return await vscode.commands.executeCommand(`dsu.${cmd}`, payload); } catch (e) { report(e); } });
  const home = new HomePanel(async (name, value) => {
    if (name === 'openFolder') return vscode.commands.executeCommand('workbench.action.files.openFolder');
    return vscode.commands.executeCommand(`dsu.${name}`, value);
  });
  context.subscriptions.push(home);
  const tree = new ProblemTree(async () => vscode.workspace.workspaceFolders?.length ? listProblems(root(), await config()) : [], report);
  context.subscriptions.push(tree, vscode.window.registerTreeDataProvider('dsu.problems', tree));
  const show = async (record: ProblemRecord, browser = true) => {
    active = record; tree.refresh();
    const document = await vscode.workspace.openTextDocument(path.join(root(), record.file));
    await vscode.window.showTextDocument(document, { viewColumn: vscode.ViewColumn.One, preview: false });
    if (browser) await browsers.open(record.url);
    panel.show(record);
  };
  const rpc = async (op: string, payload: any): Promise<unknown> => {
    const cfg = await config();
    if (op === 'adapters') return cfg.adapters;
    if (op === 'import') {
      const folder = trusted();
      if (importing) throw new Error('正在导入另一道题，请稍后重试');
      importing = true;
      try { const record = await importProblem(folder, payload, cfg); await show(record, !vscode.window.activeBrowserTab); return { file: record.file }; }
      finally { importing = false; }
    }
    if (op === 'claim') { trusted(); return jobs.claim(payload.url); }
    if (op === 'submissionResult') {
      const pending = outstanding.get(payload.id);
      if (!pending || pending.url !== payload.url || pending.expires < Date.now()) throw new Error('提交回执无效或过期');
      const result = validateReceipt(pending.job, payload);
      outstanding.delete(payload.id);
      if (active?.url === pending.problemUrl) panel.setSubmission(receiptMessage(result), result.ok && result.state === 'accepted');
      output.appendLine(receiptMessage(result));
      if (result.ok && result.state === 'accepted') {
        recordUrls.set(pending.problemUrl, result.recordUrl);
        void vscode.window.showInformationMessage(`DSU: ${receiptMessage(result)}`, '查看记录').then(action => {
          if (action) void openSubmissionPage(result.recordUrl).catch(report);
        });
      } else if (result.ok) void vscode.window.showInformationMessage(`DSU: ${receiptMessage(result)}`);
      else void vscode.window.showWarningMessage(`DSU: ${receiptMessage(result)}。不会自动重试。`);
      return true;
    }
    throw new Error('不支持的浏览器操作');
  };
  const browsers = new BrowserIntegration(context.extensionPath, rpc, async () => (await config()).adapters, s => output.appendLine(s));
  const openSubmissionPage = async (url: string) => {
    if (vscode.workspace.getConfiguration('dsu').get<string>('submissionBrowser') === 'external') {
      if (!await vscode.env.openExternal(vscode.Uri.parse(url))) throw new Error('无法打开默认浏览器，请手动打开 OJ 页面');
    } else await browsers.open(url);
  };
  context.subscriptions.push(panel, browsers, { dispose() { controller?.abort(); jobs.clear(); } });
  browsers.start();
  const command = (name: string, handler: (...args: any[]) => Promise<unknown> | unknown) => context.subscriptions.push(vscode.commands.registerCommand(`dsu.${name}`, async (...args) => { try { return await handler(...args); } catch (e) { report(e); } }));
  const current = async () => {
    if (!active) throw new Error('请先从 OJ 页面创建题目，或打开已经导入的代码文件');
    const folder = trusted();
    const file = path.join(folder, '.dsu/problems', recordName(active.url));
    await inside(folder, file);
    const stored: ProblemRecord = JSON.parse(await readFile(file, 'utf8'));
    const record = recordForFile(stored, folder, path.resolve(folder, active.file));
    if (!record) throw new Error('当前代码文件不再关联到此题目，请重新打开题目文件');
    const cfg = await config(); validateProblem(record, cfg);
    await inside(folder, path.resolve(folder, record.file));
    active = record; return { folder, record, cfg };
  };
  command('refreshProblems', () => tree.refresh());
  command('openProblem', async (url?: string) => {
    const records = await listProblems(trusted(), await config());
    const record = url ? records.find(r => r.url === url) : (await vscode.window.showQuickPick(records.map(record => ({ label: record.title, description: `${record.oj} · ${record.language}`, record })), { title: '打开已导入题目' }))?.record;
    if (record) await show(record);
  });
  command('setup', async () => {
    const folder = trusted(); const cfg = await config();
    const states = await inspectToolchains(cfg.languages, folder);
    const choice = await vscode.window.showQuickPick(states.map(l => ({ label: l.name, description: l.ready ? '已找到工具链' : '需安装：' + l.tools.filter(t => !t.path).map(t => t.command).join(', '), id: l.id })), { title: '选择默认做题语言' });
    if (!choice) return;
    cfg.defaultLanguage = choice.id;
    const file = await initializeConfig(folder); await inside(folder, file);
    await writeFile(file, JSON.stringify(cfg, null, 2) + '\n');
    await vscode.commands.executeCommand('dsu.problems.focus');
    void vscode.window.showInformationMessage('工作区已准备好。打开 OJ 题目后，点击页面右下角创建题目。', '打开浏览器').then(action => { if (action) void vscode.commands.executeCommand('dsu.openBrowser'); });
  });
  command('doctor', async () => {
    const states = await inspectToolchains((await config()).languages, trusted());
    const lines = ['DSU IDE 语言环境检查', '检测 PATH 中的程序；找到程序不代表版本兼容或编译已通过。', ''];
    for (const state of states) lines.push(`${state.ready ? '✓' : '×'} ${state.name}`, ...state.tools.map(t => `  ${t.command}: ${t.path || '未找到，请安装后重启 IDE 或修改语言命令'}`));
    output.appendLine(lines.join('\n')); output.show(true);
  });
  command('saveSamples', async (payload: { url: string; samples: import('../core/types').Sample[] }) => {
    if (controller) throw new Error('请先停止正在运行的测试');
    const { folder, record, cfg } = await current();
    if (!payload || payload.url !== record.url) throw new Error('当前题目已变化，请重新打开样例编辑器');
    const saved = await saveSamples(folder, record.url, payload.samples, cfg);
    active = { ...saved, file: record.file, language: record.language };
    return active;
  });
  command('configure', async () => {
    const file = await initializeConfig(trusted());
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(file));
  });
  command('updateAdapters', async () => {
    const folder = trusted(); const cfg = await config();
    const choices = await vscode.window.showQuickPick(defaultConfig.adapters.map(a => ({ label: a.name, description: a.id, id: a.id })), { canPickMany: true, title: '更新选中的内置 OJ 配置', placeHolder: '只替换所选 OJ；先保存完整备份，保留其他 OJ、语言和模板' });
    if (!choices?.length) return;
    const updated = updateBuiltinAdapters(cfg, choices.map(c => c.id));
    const file = await initializeConfig(folder);
    await inside(folder, file);
    const backup = path.join(folder, `.dsu/config.backup-${Date.now()}.json`);
    await writeFile(backup, await readFile(file), { flag: 'wx' });
    await writeFile(file, JSON.stringify(updated, null, 2) + '\n');
    void vscode.window.showInformationMessage(`已更新 ${choices.map(c => c.label).join('、')}，请刷新浏览器页面。原配置已备份到 ${path.basename(backup)}`);
  });
  command('record', async () => {
    const { record } = await current(); const url = recordUrls.get(record.url);
    if (!url) throw new Error('当前会话没有此题已受理的提交记录');
    await openSubmissionPage(url);
  });
  command('files', () => vscode.commands.executeCommand('workbench.view.explorer'));
  command('home', async () => {
    await vscode.commands.executeCommand('workbench.action.closeSidebar');
    const folder = vscode.workspace.workspaceFolders?.length === 1 ? root() : undefined;
    const cfg = folder ? await config() : defaultConfig;
    home.show(folder ? path.basename(folder) : undefined, folder ? await listProblems(folder, cfg) : [], cfg.languages.find(l => l.id === cfg.defaultLanguage)?.name || cfg.defaultLanguage, context.extension.packageJSON.version);
  });
  command('openBrowser', async (url?: string) => {
    const value = typeof url === 'string' && url.trim() ? url.trim() : await vscode.window.showInputBox({ prompt: 'OJ 网址', value: 'https://codeforces.com/problemset' });
    if (!value) return; const u = new URL(value);
    if (!['http:', 'https:'].includes(u.protocol)) throw new Error('只支持 HTTP/HTTPS 地址');
    await browsers.open(u.href);
  });
  command('browser', async () => { const { record } = await current(); await browsers.open(record.url); });
  command('samples', async () => { const { record } = await current(); panel.show(record); });
  command('editSamples', async () => {
    const { folder, record } = await current();
    const file = path.join(folder, '.dsu/problems', recordName(record.url));
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(file), vscode.ViewColumn.Three);
    void vscode.window.showInformationMessage('编辑 samples 数组后保存；再次测试时会读取最新样例。');
  });
  command('test', async () => {
    if (controller) throw new Error('已有测试运行中');
    const { folder, record, cfg } = await current();
    const language = cfg.languages.find(l => l.id === record.language);
    if (!language) throw new Error('语言配置已被删除');
    const file = path.resolve(folder, record.file);
    const doc = vscode.workspace.textDocuments.find(d => d.uri.fsPath === file);
    if (doc?.isDirty && !await doc.save()) throw new Error('文件未保存');
    controller = new AbortController(); panel.show(record); panel.setBusy(true);
    try {
      const results = await runSamples(file, language, record.samples, cfg, controller.signal);
      if (active?.url === record.url && active.file === record.file) panel.setResults(results);
      output.appendLine(`${record.title}: ${results.map(r => r.status).join(', ')}`);
      return results;
    } finally { controller = undefined; panel.setBusy(false); }
  });
  command('cancel', () => { controller?.abort(); jobs.clear(); outstanding.clear(); });
  command('submit', async () => {
    const { folder, record, cfg } = await current();
    const file = path.resolve(folder, record.file);
    const doc = vscode.workspace.textDocuments.find(d => d.uri.fsPath === file);
    if (doc?.isDirty && !await doc.save()) throw new Error('文件未保存');
    const code = await readFile(file, 'utf8');
    const adapter = cfg.adapters.find(a => a.id === record.oj)!;
    const submission = submissionFor(record.url, code, record.language, adapter);
    if ([...outstanding.values()].some(p => p.url === submission.url && p.expires > Date.now())) throw new Error('此题已有提交在处理，请等待回执或检查原站记录');
    const job = jobs.enqueue(submission); outstanding.set(job.id, { url: job.url, expires: job.expires, problemUrl: record.url, job });
    panel.setSubmission('提交已排队，等待浏览器处理…', false);
    try { await openSubmissionPage(job.url); }
    catch (e) { jobs.remove(job.id); outstanding.delete(job.id); panel.setSubmission('无法打开提交页，任务已取消', false); throw e; }
    void vscode.window.showInformationMessage('已排队：请保持提交页打开并登录。任务有效期 2 分钟。');
  });
  command('language', async () => {
    if (controller) throw new Error('请先停止当前测试');
    const { record, cfg, folder } = await current();
    const choice = await vscode.window.showQuickPick(cfg.languages.map(l => ({ label: l.name, id: l.id })), { placeHolder: '为当前题目创建/打开另一语言的代码文件' });
    if (!choice) return;
    const next = await importProblem(folder, record, cfg, choice.id); await show(next, false);
  });
  command('saveTemplate', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) throw new Error('请先打开代码并选中模板内容');
    const body = editor.document.getText(editor.selection.isEmpty ? undefined : editor.selection);
    const cfg = await config();
    const lang = cfg.languages.find(l => l.vscode === editor.document.languageId);
    if (!lang) throw new Error('当前编辑语言未配置');
    const prefix = await vscode.window.showInputBox({ prompt: '输入触发关键字，例如 dsu 或 fastio', validateInput: s => /^[\w-]+$/.test(s) ? undefined : '使用字母、数字、下划线或连字符' });
    if (!prefix) return;
    if (cfg.templates.some(t => t.language === lang.id && t.prefix === prefix)) throw new Error('该语言已有相同关键字，请在配置中编辑');
    cfg.templates.push({ name: prefix, prefix, language: lang.id, body });
    const file = await initializeConfig(trusted()); await writeFile(file, JSON.stringify(cfg, null, 2) + '\n');
    void vscode.window.showInformationMessage(`模板已保存：${prefix}`);
  });
  context.subscriptions.push(vscode.languages.registerCompletionItemProvider({ scheme: 'file' }, {
    async provideCompletionItems(document) {
      if (!vscode.workspace.workspaceFolders?.length) return [];
      const cfg = await config();
      const languageIds = cfg.languages.filter(l => l.vscode === document.languageId).map(l => l.id);
      return cfg.templates.filter(t => languageIds.includes(t.language)).map(t => {
        const item = new vscode.CompletionItem(t.prefix, vscode.CompletionItemKind.Snippet);
        item.detail = `DSU · ${t.name}`; item.documentation = t.description;
        item.insertText = new vscode.SnippetString().appendText(t.body); return item;
      });
    }
  }));
  const selectFile = async (editor: vscode.TextEditor | undefined) => {
    if (!editor || !vscode.workspace.workspaceFolders?.length) return;
    if (editor.document.uri.scheme !== 'file') return;
    const folder = root(); const meta = path.join(folder, '.dsu/problems');
    let files: string[]; try { await inside(folder, meta); files = await readdir(meta); } catch { return; }
    for (const f of files.filter(f => f.endsWith('.json'))) {
      try {
        await inside(folder, path.join(meta, f));
        const record: ProblemRecord = JSON.parse(await readFile(path.join(meta, f), 'utf8'));
        const selected = recordForFile(record, folder, editor.document.uri.fsPath);
        if (selected) { validateProblem(selected, await config()); active = selected; panel.show(selected); break; }
      } catch (e) { output.appendLine(`忽略无效题目记录 ${f}: ${(e as Error).message}`); }
    }
  };
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(e => { void selectFile(e).catch(report); }));
  void selectFile(vscode.window.activeTextEditor).catch(report);
  let token = await context.secrets.get('bridge-token');
  if (!token) { token = makeToken(); await context.secrets.store('bridge-token', token); }
  const bridgePort = vscode.workspace.getConfiguration('dsu').get<number>('bridgePort', 27121);
  command('pair', async () => {
    trusted();
    await vscode.env.clipboard.writeText(JSON.stringify({ dsu: 1, token, port: bridgePort }));
    void vscode.window.showInformationMessage('配对信息已复制，请粘贴到 Chrome / Edge 的连接设置，端口将自动填写。');
  });
  try {
    const port = bridgePort;
    const server = await createBridge(token, rpc, port);
    context.subscriptions.push({ dispose() { server.close(); server.closeAllConnections(); } });
    output.appendLine(`DSU IDE 0.1.2 · 本地桥接 127.0.0.1:${port}`);
  } catch (e) { output.appendLine(`外部浏览器连接未启动：${(e as Error).message}。多窗口请配置不同端口；内置浏览器仍可使用。`); }
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 20);
  status.text = '$(code) DSU IDE'; status.tooltip = '选择做题语言并初始化工作区'; status.command = 'dsu.setup'; status.show(); context.subscriptions.push(status);
  const expiry = setInterval(() => {
    for (const [id, job] of outstanding) if (job.expires < Date.now()) { outstanding.delete(id); void vscode.window.showWarningMessage('DSU: 提交任务未收到回执。请检查 OJ 是否已受理，再决定是否重试。'); }
  }, 5000);
  context.subscriptions.push({ dispose() { clearInterval(expiry); } });
  context.subscriptions.push(vscode.window.registerWebviewPanelSerializer('dsu.home', {
    async deserializeWebviewPanel(restored) { restored.dispose(); await vscode.commands.executeCommand('dsu.home'); }
  }));
  if (!vscode.window.tabGroups.all.some(group => group.tabs.length)) await vscode.commands.executeCommand('dsu.home');
}
export function deactivate() {}
