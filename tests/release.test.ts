import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('product, built-in extension and browser companion share the release version', async () => {
  const json = async (file: string) => JSON.parse(await readFile(file, 'utf8'));
  const root = await json('package.json');
  for (const file of ['config/extension.json', 'browser/manifest.json', 'package-lock.json']) assert.equal((await json(file)).version, root.version, file);
  assert.equal((await json('config/upstream.json')).dsuVersion, root.version);
  const schema = await json('config/config.schema.json');
  const defaults = await json('config/defaults.json');
  assert.ok(schema.required.every((key: string) => key in defaults));
});
