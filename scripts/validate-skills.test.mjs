import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const validator = join(repositoryRoot, 'scripts', 'validate-skills.mjs');

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), 'a11y-skill-validator-'));
  const paths = [
    '.agents/plugins',
    '.claude-plugin',
    '.codex-plugin',
    'skills/example/agents',
  ];
  for (const path of paths) mkdirSync(join(root, path), { recursive: true });

  writeFileSync(
    join(root, 'README.md'),
    '[日本語版 (Japanese)](./README.ja.md)\n',
  );
  writeFileSync(join(root, 'README.ja.md'), '[English](./README.md)\n');
  writeFileSync(
    join(root, 'skills/example/SKILL.md'),
    `---
name: example
description: Example skill.
argument-hint: value
allowed-tools: Read
---

[日本語版 (Japanese)](./SKILL.ja.md)
`,
  );
  writeFileSync(
    join(root, 'skills/example/SKILL.ja.md'),
    `---
name: example
description: サンプルスキル。
argument-hint: value
allowed-tools: Read
---

[English](./SKILL.md)
`,
  );
  writeFileSync(
    join(root, 'skills/example/agents/openai.yaml'),
    `interface:
  display_name: "Example"
  short_description: "Example skill"
  default_prompt: "Use $example for this task."
`,
  );
  writeFileSync(
    join(root, '.claude-plugin/plugin.json'),
    JSON.stringify({ name: 'example-plugin', version: '1.0.0' }),
  );
  writeFileSync(
    join(root, '.claude-plugin/marketplace.json'),
    JSON.stringify({
      metadata: { version: '1.0.0' },
      plugins: [{ version: '1.0.0' }],
    }),
  );
  writeFileSync(
    join(root, '.codex-plugin/plugin.json'),
    JSON.stringify({
      name: 'example-plugin',
      version: '1.0.0',
      skills: './skills/',
    }),
  );
  writeFileSync(
    join(root, '.agents/plugins/marketplace.json'),
    JSON.stringify({
      plugins: [
        {
          name: 'example-plugin',
          source: { source: 'local', path: './../..' },
        },
      ],
    }),
  );
  return root;
}

function validate(root) {
  return spawnSync(process.execPath, [validator, root], {
    encoding: 'utf8',
  });
}

test('accepts the shared Claude Code and Codex frontmatter extensions', () => {
  const result = validate(createFixture());
  assert.equal(result.status, 0, result.stderr);
});

test('rejects unknown frontmatter keys', () => {
  const root = createFixture();
  const skill = join(root, 'skills/example/SKILL.md');
  writeFileSync(
    skill,
    readFileSync(skill, 'utf8').replace(
      'allowed-tools: Read',
      'model: example',
    ),
  );

  const result = validate(root);
  assert.equal(result.status, 1);
});

test('rejects plugin version drift', () => {
  const root = createFixture();
  const manifest = join(root, '.codex-plugin/plugin.json');
  const data = JSON.parse(readFileSync(manifest, 'utf8'));
  data.version = '2.0.0';
  writeFileSync(manifest, JSON.stringify(data));

  const result = validate(root);
  assert.equal(result.status, 1);
});
