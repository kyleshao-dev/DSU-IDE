import * as vscode from 'vscode';
import type { ProblemRecord } from '../core/types';

type Entry = string | ProblemRecord;
export class ProblemTree implements vscode.TreeDataProvider<Entry>, vscode.Disposable {
  private changes = new vscode.EventEmitter<Entry | undefined>();
  readonly onDidChangeTreeData = this.changes.event;
  private records: ProblemRecord[] = [];
  constructor(private load: () => Promise<ProblemRecord[]>, private report: (e: unknown) => void) {}
  refresh() { this.changes.fire(undefined); }
  async getChildren(entry?: Entry): Promise<Entry[]> {
    if (typeof entry === 'string') return this.records.filter(r => r.oj === entry);
    if (entry) return [];
    try { this.records = await this.load(); } catch (e) { this.records = []; this.report(e); }
    return [...new Set(this.records.map(r => r.oj))];
  }
  getTreeItem(entry: Entry): vscode.TreeItem {
    if (typeof entry === 'string') return new vscode.TreeItem(entry, vscode.TreeItemCollapsibleState.Expanded);
    const item = new vscode.TreeItem(entry.title);
    item.description = entry.language; item.tooltip = entry.url;
    item.iconPath = new vscode.ThemeIcon('code');
    item.command = { command: 'dsu.openProblem', title: '打开题目', arguments: [entry.url] };
    return item;
  }
  dispose() { this.changes.dispose(); }
}
