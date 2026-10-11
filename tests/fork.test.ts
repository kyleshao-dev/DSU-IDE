import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Small build script is maintained as native ESM.
import { brandProduct, disableGallery, preserveCopilotRuntime } from '../scripts/fork-patches.mjs';
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
