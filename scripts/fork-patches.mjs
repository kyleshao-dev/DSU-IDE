export const galleryPath = 'src/vs/platform/extensionManagement/common/extensionGalleryService.ts';
export const onboardingPath = 'src/vs/workbench/workbench.common.main.ts';
export const extensionPackagingPath = 'build/lib/extensions.ts';
export function preserveCopilotRuntime(source) {
  if (source.includes('// DSU: preserve the bundled extension runtime.')) return source;
  const original = "\t\t'git': ['@vscode/fs-copyfile']";
  if (!source.includes(original)) throw new Error('上游扩展打包规则与固定版本不符，停止修改。');
  return source.replace(original, original + ",\n\t\t// DSU: preserve the bundled extension runtime.\n\t\t'copilot': ['@github/copilot']");
}
export function restoreUpstreamOnboarding(source) {
  // Repair the temporary 0.1.2 startup patch: the contribution also registers
  // services consumed by the standard startup page, so it must stay loaded.
  return source.replace('// DSU: use workspace setup instead of agent onboarding.', "import './contrib/welcomeOnboarding/browser/welcomeOnboarding.contribution.js';");
}
export function disableGallery(source) {
  // Once the availability check is removed, its enum import is unused. Code OSS
  // enables noUnusedLocals, so leaving it behind breaks the desktop build.
  source = source.replace(', ExtensionGalleryManifestStatus }', ' }').replace('ExtensionGalleryManifestStatus, ', '');
  if (source.includes('// DSU: gallery disabled')) return source;
  const original = 'isEnabled(): boolean {\n\t\treturn this.extensionGalleryManifestService.extensionGalleryManifestStatus === ExtensionGalleryManifestStatus.Available;\n\t}';
  if (!source.includes(original)) throw new Error('上游扩展商店代码与固定版本不符，停止修改。请审核补丁。');
  return source.replace(original, 'isEnabled(): boolean {\n\t\t// DSU: gallery disabled; internal extensions and local VSIX remain supported.\n\t\treturn false;\n\t}');
}
export function brandProduct(product, version) {
  const branded = { ...product,
    nameShort: 'DSU IDE', nameLong: `DSU IDE ${version}`, applicationName: 'dsu-ide',
    dataFolderName: '.dsu-ide', sharedDataFolderName: '.dsu-ide-shared', urlProtocol: 'dsu-ide',
    serverApplicationName: 'dsu-ide-server', serverDataFolderName: '.dsu-ide-server',
    tunnelApplicationName: 'dsu-ide-tunnel',
    win32MutexName: 'dsuide', win32DirName: 'DSU IDE', win32NameVersion: 'DSU IDE',
    win32RegValueName: 'DSUIDE', win32AppUserModelId: 'DSU.IDE', win32ShellNameShort: 'DSU IDE',
    win32TunnelServiceMutex: 'dsuide-tunnelservice', win32TunnelMutex: 'dsuide-tunnel',
    win32x64AppId: '{{8D0609C8-B8B2-4096-A7AB-07320EE2562D}',
    win32arm64AppId: '{{62F71F57-3F50-442F-94C5-9282F503D936}',
    win32x64UserAppId: '{{33773196-9DAB-41F5-8DE4-2F79D3AA29D7}',
    win32arm64UserAppId: '{{E177B1F0-745F-4DD8-80CC-0842F2CB8427}',
    darwinBundleIdentifier: 'dev.dsu.ide',
    darwinProfileUUID: '05850C95-5CC8-4252-99AD-28400D1E50A4',
    darwinProfilePayloadUUID: 'D1FBD830-21CE-475C-A9C3-B8C1106A96F8',
    linuxDesktopName: 'dev.dsu.ide', linuxIconName: 'dsu-ide',
    enableTelemetry: false, extensionEnabledApiProposals: { ...product.extensionEnabledApiProposals, 'dsu.dsu-ide': ['browser'] },
    builtInExtensionsEnabledWithAutoUpdates: [],
    onboardingKeymaps: (product.onboardingKeymaps || []).filter(k => !k.extensionId)
  };
  // The pinned workbench's account service dereferences defaultChatAgent at
  // module load. Keep that upstream metadata even with the gallery disabled.
  for (const field of ['extensionsGallery', 'voiceWsUrl', 'updateUrl', 'downloadUrl', 'reportIssueUrl']) delete branded[field];
  return branded;
}

export const localeMainPath = 'src/mainImpl.ts';
export const localeNlsPath = 'src/vs/base/node/nls.ts';
export function defaultChineseLocale(source) {
  const original = "return typeof argvConfig?.locale === 'string' ? argvConfig.locale.toLowerCase() : undefined;";
  const replacement = "return typeof argvConfig?.locale === 'string' ? argvConfig.locale.toLowerCase() : 'zh-cn'; // DSU: default display language";
  if (source.includes(replacement)) return source;
  if (!source.includes(original)) throw new Error('上游语言入口与固定版本不符');
  return source.replace(original, replacement);
}
export function bundledChineseFallback(source) {
  if (source.includes('// DSU: resolve the bundled language pack on first launch.')) return source;
  const original = 'const languagePacks = await getLanguagePackConfigurations(userDataPath);';
  if (!source.includes(original)) throw new Error('上游语言资源入口与固定版本不符');
  return source.replace(original, `// DSU: resolve the bundled language pack on first launch.
		const languagePacks = await getLanguagePackConfigurations(userDataPath) ?? {};
		if (!languagePacks['zh-cn']) {
			const packRoot = join(nlsMetadataPath, '..', 'extensions', 'vscode-language-pack-zh-hans');
			const manifest = JSON.parse(await promises.readFile(join(packRoot, 'package.json'), 'utf-8'));
			const translations: Record<string, string> = {};
			for (const entry of manifest.contributes.localizations[0].translations) {
				translations[entry.id] = join(packRoot, entry.path);
			}
			languagePacks['zh-cn'] = { hash: manifest.dsuTranslationHash, label: '中文(简体)', extensions: [], translations };
		}`);
}

export const omittedExtensions = ['copilot', 'github-authentication', 'microsoft-authentication', 'github', 'mermaid-markdown-features', 'ipynb', 'emmet', 'npm', 'grunt', 'gulp', 'jake', 'extension-editing', 'simple-browser', 'html-language-features', 'css-language-features'];
export const desktopPackagingPath = 'build/gulpfile.vscode.ts';
export const desktopContributionsPath = 'src/vs/workbench/workbench.desktop.main.ts';
export const agentEnablementPath = 'src/vs/platform/agentHost/browser/agentHostEnablementService.ts';
export const windowsServicePath = 'src/vs/platform/windows/electron-main/windowsMainService.ts';
export const chatStartupPath = 'src/vs/workbench/contrib/chat/browser/chat.shared.contribution.ts';
export const releaseOmittedExtensions = ['markdown-language-features', 'markdown-math', 'terminal-suggest', 'ms-vscode.vscode-js-profile-table', 'notebook-renderers'];

export function disableAgentRuntime(source) {
  if (source.includes('// DSU: no AI runtime in the competition distribution.')) return source;
  const original = '\t\tsuper(!isWeb, configurationService, contextKeyService, managedSettingsService);';
  if (!source.includes(original)) throw new Error('上游 AI 启用服务与固定版本不符');
  return source.replace("import { isWeb } from '../../../base/common/platform.js';\n", '')
    .replace(original, '\t\t// DSU: no AI runtime in the competition distribution.\n\t\tsuper(false, configurationService, contextKeyService, managedSettingsService);');
}

export function redirectAgentWindows(source) {
  if (source.includes('// DSU: agent links open the regular competition editor.')) return source;
  const original = "\t\tthis.logService.trace('windowsManager#openAgentsWindow');";
  if (!source.includes(original)) throw new Error('上游 AI 窗口服务与固定版本不符');
  return source.replace(original, original + "\n\t\t// DSU: agent links open the regular competition editor.\n\t\tif (this.productService.applicationName === 'dsu-ide') {\n\t\t\treturn this.open(openConfig);\n\t\t}");
}

export function competitionChatStartup(source) {
  const marker = '// DSU: omit AI account prompts and status initialization.';
  if (source.includes(marker)) return source;
  const continuation = "import './agentSessions/agentHost/codexContinuation.contribution.js';";
  const status = "import { CodexStatusBarEntry } from './chatStatus/codexStatusEntry.js';";
  const registration = 'registerWorkbenchContribution2(CodexStatusBarEntry.ID, CodexStatusBarEntry, WorkbenchPhase.BlockRestore);';
  if (![continuation, status, registration].every(text => source.includes(text))) throw new Error('上游 AI 账号初始化与固定版本不符');
  return source.replace(continuation, marker).replace(status, '').replace(registration, '');
}

export function releasePackaging(source) {
  if (source.includes('// DSU: omit unavailable AI runtimes and release-only extras.')) return source.replaceAll('"!extensions/', '"!**/extensions/');
  const originals = ['const sources = es.merge(src, extensions)', 'const deps = es.merge(cleanedDeps, copilotRuntimePrebuilds, osProxyResolverPlatformPackage)'];
  if (!originals.every(text => source.includes(text))) throw new Error('上游发布过滤流程与固定版本不符');
  for (const name of ['sessions.desktop.main.js', 'sessions.desktop.main.css', 'electron-browser/sessions.html', 'electron-browser/sessions.js']) {
    source = source.replace(new RegExp("\\n\\t+['\"]vs/sessions/" + name.replaceAll('.', '\\.') + "['\"],?"), '');
  }
  const sourceExclusions = ['!out/vs/sessions/**', ...releaseOmittedExtensions.map(name => `!**/extensions/${name}/**`)];
  const runtimeExclusions = ['!**/@github/copilot-sdk-{darwin,linux,linuxmusl,win32}-*/**', '!**/@microsoft/mxc-sdk/bin/**'];
  return source.replace(originals[0], originals[0] + '\n\t\t\t.pipe(filter(' + JSON.stringify(['**', ...sourceExclusions]) + ', { dot: true }))')
    .replace(originals[1], '// DSU: omit unavailable AI runtimes and release-only extras.\n\t\t' + originals[1] + '\n\t\t\t.pipe(filter(' + JSON.stringify(['**', ...runtimeExclusions]) + ', { dot: true }))');
}
export function competitionPackaging(source) {
  if (source.includes('// DSU: omit the Copilot extension from desktop builds.')) return source;
  const task = '\t\t\tcompileCopilotExtensionBuildTask,\n';
  const shim = '\t\tprepareBuiltInCopilotRipgrepShim(platform, arch, builtInCopilotExtensionDir, appNodeModulesDir);';
  if (!source.includes(task) || !source.includes(shim)) throw new Error('上游桌面打包任务与固定版本不符');
  return source.replace(', compileCopilotExtensionBuildTask }', ' }')
    .replace(task, '\t\t\t// DSU: omit the Copilot extension from desktop builds.\n')
    .replace("['.build/extensions/**', ...platformSpecificBuiltInExtensionsExclusions]", "['.build/extensions/**', ...platformSpecificBuiltInExtensionsExclusions, " + omittedExtensions.map(name => JSON.stringify('!.build/extensions/' + name + '/**')).join(', ') + ']')
    .replace(shim, '\t\tif (fs.existsSync(builtInCopilotExtensionDir)) {\n' + shim + '\n\t\t}');
}
export function competitionContributions(source) {
  const excluded = [
    './contrib/remote/browser/remote.contribution.js',
    './contrib/remote/electron-browser/remote.contribution.js',
    './contrib/remoteTunnel/electron-browser/remoteTunnel.contribution.js',
    './contrib/remoteCodingAgents/browser/remoteCodingAgents.contribution.js',
    './contrib/chat/electron-browser/tunnelHost.contribution.js'
  ];
  for (const name of excluded) source = source.replace(`import '${name}';`, `// DSU: omitted non-competition UI: ${name}`);
  return source;
}
