import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Small build script is maintained as native ESM.
import { brandProduct, disableGallery, preserveCopilotRuntime, defaultChineseLocale, bundledChineseFallback, competitionPackaging, competitionContributions } from '../scripts/fork-patches.mjs';
test('branding removes marketplace endpoint but preserves extension proposal allowlist', () => {
  const p = brandProduct({ nameLong: 'Code - OSS', extensionsGallery: { serviceUrl: 'https://example.com' }, defaultChatAgent: {}, extensionEnabledApiProposals: { other: ['foo'] } }, '0.1.1');
  assert.equal(p.extensionsGallery, undefined); assert.equal(p.nameLong, 'DSU IDE 0.1.1');
  assert.deepEqual(p.extensionEnabledApiProposals['dsu.dsu-ide'], ['browser']);
  assert.deepEqual(p.extensionEnabledApiProposals.other, ['foo']);
  assert.deepEqual(p.defaultChatAgent, {});
  assert.deepEqual(p.builtInExtensionsEnabledWithAutoUpdates, []);
});
test('desktop packaging keeps the runtime required by the built-in Copilot shim', () => {
  const source = "\t\t'git': ['@vscode/fs-copyfile']";
  const patched = preserveCopilotRuntime(source);
  assert.match(patched, /'copilot': \['@github\/copilot'\]/);
  assert.equal(preserveCopilotRuntime(patched), patched);
  assert.throws(() => preserveCopilotRuntime('new upstream'), /固定版本/);
});
test('gallery patch refuses unknown upstream and is idempotent', () => {
  const source = "import { IExtensionGalleryManifestService, ExtensionGalleryManifestStatus } from './extensionGalleryManifest.js';\n" + 'isEnabled(): boolean {\n\t\treturn this.extensionGalleryManifestService.extensionGalleryManifestStatus === ExtensionGalleryManifestStatus.Available;\n\t}';
  const patch = disableGallery(source); assert.match(patch, /return false/); assert.equal(disableGallery(patch), patch);
  assert.doesNotMatch(patch, /ExtensionGalleryManifestStatus/);
  assert.throws(() => disableGallery('new implementation'), /固定版本/);
});

test('Chinese default preserves explicit locale and bundled resources work on first launch', () => {
  const source = "return typeof argvConfig?.locale === 'string' ? argvConfig.locale.toLowerCase() : undefined;";
  const patched = defaultChineseLocale(source);
  const choose = new Function('argvConfig', patched);
  assert.equal(choose({}), 'zh-cn');
  assert.equal(choose({ locale: 'EN' }), 'en');
  assert.equal(defaultChineseLocale(patched), patched);
  assert.throws(() => defaultChineseLocale('unknown upstream'));
  const nls = bundledChineseFallback('const languagePacks = await getLanguagePackConfigurations(userDataPath);');
  assert.equal(bundledChineseFallback(nls), nls);
  assert.match(nls, /dsuTranslationHash/);
  assert.throws(() => bundledChineseFallback('unknown upstream'));
});

test('competition build omits Copilot and remote UI while retaining shared services', () => {
  const source = "import { foo, compileCopilotExtensionBuildTask } from './gulpfile.extensions.ts';\n\t\t\tcompileCopilotExtensionBuildTask,\n\t\tprepareBuiltInCopilotRipgrepShim(platform, arch, builtInCopilotExtensionDir, appNodeModulesDir);\ngulp.src(['.build/extensions/**', ...platformSpecificBuiltInExtensionsExclusions])";
  const patched = competitionPackaging(source);
  assert.doesNotMatch(patched, /compileCopilotExtensionBuildTask/);
  assert.match(patched, /!\.build\/extensions\/copilot/);
  assert.match(patched, /existsSync/);
  assert.equal(competitionPackaging(patched), patched);
  assert.throws(() => competitionPackaging('unknown upstream'));
  const contribution = competitionContributions("import './contrib/remoteTunnel/electron-browser/remoteTunnel.contribution.js';\nimport './services/tunnel/electron-browser/tunnelService.js';");
  assert.match(contribution, /omitted non-competition UI/);
  assert.match(contribution, /import '.\/services\/tunnel/);
});
