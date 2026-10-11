export interface Sample { input: string; output: string }
export interface Problem {
  oj: string; id: string; title: string; url: string; statement: string;
  samples: Sample[]; sourceUrl?: string;
}
export interface Language {
  id: string; name: string; extension: string; vscode: string;
  compile?: string[]; run: string[]; starter: string; sourceName?: string;
}
interface SubmissionBase {
  url: string;
  code: string;
  language: string;
  languageValues: Record<string, string>;
}
export interface FormSubmission extends SubmissionBase {
  kind?: 'form';
  problem?: { selector: string; value: string };
  codeSelector: string; languageSelector: string; submitSelector: string;
}
export interface LuoguSubmission extends SubmissionBase {
  kind: 'luogu';
  pid: string; enableO2: boolean; contestId?: string;
}
export type Submission = FormSubmission | LuoguSubmission;
export type SubmissionResult =
  | { ok: true; state: 'dispatched' }
  | { ok: true; state: 'accepted'; recordId: string; recordUrl: string }
  | { ok: false; state: 'failed' | 'action-required' | 'unknown'; error: string };
export type SubmitConfig = {
  url: string;
  languageValues: Record<string, string>;
} & ({
  kind?: 'form'; codeSelector: string; languageSelector: string; submitSelector: string;
  problemSelector?: string; problemValue?: string;
} | { kind: 'luogu'; enableO2?: boolean });
export interface Adapter {
  id: string; name: string; hosts: string[]; problemPattern: string;
  title: string; statement: string; inputs: string; outputs: string;
  sourceLink?: string;
  submit?: SubmitConfig;
}
export interface Template { name: string; prefix: string; language: string; body: string; description?: string }
export interface Config {
  version: 1; defaultLanguage: string; timeoutMs: number; compileTimeoutMs: number;
  comparison: 'tokens' | 'exact' | 'trim'; languages: Language[]; adapters: Adapter[]; templates: Template[];
}
export interface ProblemRecord extends Problem { file: string; language: string; files?: Record<string, string> }
export type ResultStatus = 'AC' | 'WA' | 'TLE' | 'RE' | 'OLE' | 'CE';
export interface TestResult { status: ResultStatus; elapsedMs: number; stdout: string; stderr: string; expected: string }
