/**
 * Guards against forgetting to register a new check in one of the places that
 * must list every check. `RESULT_SCHEMAS` is bound to `CheckSource` at compile
 * time, so its keys are the reference set here.
 *
 * The CLI registry is read through `--list-checks` (a public contract) because
 * `src/cli.ts` runs `main()` on import.
 */

import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { test, expect } from '@playwright/test';
import { RESULT_SCHEMAS } from '../dist/schemas/index.js';
import { buildRunnerRegistry } from './helpers/fixtures.js';

const execFileAsync = promisify(execFile);

// Spawned once and shared by every test that needs the CLI's check names.
const listChecksOutput = (async (): Promise<string[]> => {
  const cliPath = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
  const { stdout } = await execFileAsync(process.execPath, [
    cliPath,
    '--list-checks',
  ]);
  return stdout.split(/\r?\n/).filter(Boolean);
})();

function readPackageFile(name: string): string {
  return fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
}

test('--list-checks の出力は RESULT_SCHEMAS のキーと同じ集合である', async () => {
  const checks = await listChecksOutput;

  expect([...checks].sort()).toEqual(Object.keys(RESULT_SCHEMAS).sort());
});

test('src/test-entries/*.ts のファイル名は RESULT_SCHEMAS のキーと同じ集合である', () => {
  const entries = fs
    .readdirSync(new URL('../src/test-entries/', import.meta.url))
    .filter((file) => file.endsWith('.ts'))
    .map((file) => file.replace(/\.ts$/, ''))
    .sort();

  expect(entries).toEqual(Object.keys(RESULT_SCHEMAS).sort());
});

test('package.json の exports にある ./test-entries/<name> は RESULT_SCHEMAS のキーと同じ集合である', () => {
  const pkg = JSON.parse(readPackageFile('package.json')) as {
    exports: Record<string, unknown>;
  };
  const prefix = './test-entries/';
  const exported = Object.keys(pkg.exports)
    .filter((key) => key.startsWith(prefix))
    .map((key) => key.slice(prefix.length))
    .sort();

  expect(exported).toEqual(Object.keys(RESULT_SCHEMAS).sort());
});

test('test/helpers/fixtures.ts の登録表は RESULT_SCHEMAS のキーから page-snapshot を除いた集合である', async () => {
  const registry = await buildRunnerRegistry();

  expect(Object.keys(registry).sort()).toEqual(
    Object.keys(RESULT_SCHEMAS)
      .sort()
      .filter((name) => name !== 'page-snapshot'),
  );
});

for (const { file, heading } of [
  { file: 'README.md', heading: '### Available check names' },
  { file: 'README.ja.md', heading: '### チェック名一覧' },
]) {
  test(`${file} の「${heading}」直後のコードブロックは --list-checks の出力と同じ集合である`, async () => {
    const lines = readPackageFile(file).split(/\r?\n/);
    const afterHeading = lines.slice(lines.indexOf(heading) + 1);
    const fenceStart = afterHeading.findIndex((line) => line.startsWith('```'));
    const block = afterHeading.slice(fenceStart + 1);
    const names = block.slice(
      0,
      block.findIndex((line) => line.startsWith('```')),
    );
    const checks = await listChecksOutput;

    expect(lines.indexOf(heading)).toBeGreaterThanOrEqual(0);
    expect([...names].sort()).toEqual([...checks].sort());
  });
}
