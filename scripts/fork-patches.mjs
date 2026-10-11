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
