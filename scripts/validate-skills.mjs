import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const root = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skillsRoot = join(root, 'skills');
const allowedFrontmatterKeys = new Set([
  'name',
  'description',
  'argument-hint',
  'allowed-tools',
]);
const errors = [];

function fail(message) {
  errors.push(message);
}

function read(path) {
  return readFileSync(path, 'utf8');
}

function parseFrontmatter(path) {
  const content = read(path);
  const match = content.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!match) {
    fail(`${relative(root, path)}: missing YAML frontmatter`);
    return {};
  }

  try {
    return YAML.parse(match[1]) ?? {};
  } catch (error) {
    fail(`${relative(root, path)}: invalid YAML (${error.message})`);
    return {};
  }
}

function validateLanguageLink(path, expected) {
  const content = read(path);
  if (!content.includes(expected)) {
    fail(`${relative(root, path)}: missing counterpart link ${expected}`);
  }
}

function validateLocalLinks(path) {
  const content = read(path);
  const links = content.matchAll(
    /(?<!!)\[[^\]]*]\((\.{1,2}\/[^)#?]+)(?:#[^)]+)?\)/g,
  );
  for (const [, target] of links) {
    const resolved = resolve(dirname(path), decodeURIComponent(target));
    if (!existsSync(resolved)) {
      fail(`${relative(root, path)}: broken local link ${target}`);
    }
  }
}

function validateSkill(skillDir) {
  const name = relative(skillsRoot, skillDir);
  const englishPath = join(skillDir, 'SKILL.md');
  const japanesePath = join(skillDir, 'SKILL.ja.md');
  const openaiPath = join(skillDir, 'agents', 'openai.yaml');

  for (const path of [englishPath, japanesePath, openaiPath]) {
    if (!existsSync(path)) {
      fail(`${relative(root, path)}: required file is missing`);
    }
  }
  if (!existsSync(englishPath) || !existsSync(japanesePath)) return;

  const english = parseFrontmatter(englishPath);
  const japanese = parseFrontmatter(japanesePath);

  for (const [label, frontmatter] of [
    ['SKILL.md', english],
    ['SKILL.ja.md', japanese],
  ]) {
    for (const key of Object.keys(frontmatter)) {
      if (!allowedFrontmatterKeys.has(key)) {
        fail(`skills/${name}/${label}: unsupported frontmatter key ${key}`);
      }
    }
    if (frontmatter.name !== name) {
      fail(`skills/${name}/${label}: name must match directory name`);
    }
    if (
      typeof frontmatter.description !== 'string' ||
      !frontmatter.description.trim()
    ) {
      fail(`skills/${name}/${label}: description is required`);
    }
    if (typeof frontmatter['argument-hint'] !== 'string') {
      fail(
        `skills/${name}/${label}: argument-hint must be preserved as a string`,
      );
    }
  }

  if (english['argument-hint'] !== japanese['argument-hint']) {
    fail(`skills/${name}: argument-hint must match across languages`);
  }
  if (english['allowed-tools'] !== japanese['allowed-tools']) {
    fail(`skills/${name}: allowed-tools must match across languages`);
  }

  validateLanguageLink(englishPath, '[日本語版 (Japanese)](./SKILL.ja.md)');
  validateLanguageLink(japanesePath, '[English](./SKILL.md)');

  const referencesPath = join(skillDir, 'references');
  if (existsSync(referencesPath)) {
    for (const entry of readdirSync(referencesPath)) {
      if (!entry.endsWith('.md') || entry.endsWith('.ja.md')) continue;
      const englishReference = join(referencesPath, entry);
      const japaneseReference = join(
        referencesPath,
        entry.replace(/\.md$/, '.ja.md'),
      );
      if (!existsSync(japaneseReference)) {
        fail(
          `${relative(root, englishReference)}: Japanese counterpart is missing`,
        );
        continue;
      }
      validateLanguageLink(
        englishReference,
        `[日本語版 (Japanese)](./${entry.replace(/\.md$/, '.ja.md')})`,
      );
      validateLanguageLink(japaneseReference, `[English](./${entry})`);
      validateLocalLinks(englishReference);
      validateLocalLinks(japaneseReference);
    }
  }

  if (existsSync(openaiPath)) {
    let metadata;
    try {
      metadata = YAML.parse(read(openaiPath));
    } catch (error) {
      fail(`${relative(root, openaiPath)}: invalid YAML (${error.message})`);
      metadata = {};
    }
    const interfaceMetadata = metadata?.interface;
    for (const key of ['display_name', 'short_description', 'default_prompt']) {
      if (
        typeof interfaceMetadata?.[key] !== 'string' ||
        !interfaceMetadata[key].trim()
      ) {
        fail(`${relative(root, openaiPath)}: interface.${key} is required`);
      }
    }
    if (
      typeof interfaceMetadata?.default_prompt === 'string' &&
      !interfaceMetadata.default_prompt.includes(`$${name}`)
    ) {
      fail(
        `${relative(root, openaiPath)}: default_prompt must invoke $${name}`,
      );
    }
  }
}

function validateManifestVersions() {
  const claudePlugin = JSON.parse(
    read(join(root, '.claude-plugin', 'plugin.json')),
  );
  const claudeMarketplace = JSON.parse(
    read(join(root, '.claude-plugin', 'marketplace.json')),
  );
  const codexPlugin = JSON.parse(
    read(join(root, '.codex-plugin', 'plugin.json')),
  );
  const codexMarketplace = JSON.parse(
    read(join(root, '.agents', 'plugins', 'marketplace.json')),
  );
  const versions = new Set([
    claudePlugin.version,
    claudeMarketplace.metadata?.version,
    claudeMarketplace.plugins?.[0]?.version,
    codexPlugin.version,
  ]);

  if (versions.size !== 1) {
    fail(`plugin versions must match: ${[...versions].join(', ')}`);
  }
  if (codexPlugin.name !== claudePlugin.name) {
    fail('Claude and Codex plugin names must match');
  }
  if (codexPlugin.skills !== './skills/') {
    fail('.codex-plugin/plugin.json: skills must be ./skills/');
  }

  const entry = codexMarketplace.plugins?.find(
    (plugin) => plugin.name === codexPlugin.name,
  );
  if (!entry) {
    fail('.agents/plugins/marketplace.json: Codex plugin entry is missing');
  } else if (
    typeof entry.source?.path !== 'string' ||
    resolve(
      dirname(join(root, '.agents', 'plugins', 'marketplace.json')),
      entry.source.path,
    ) !== root
  ) {
    fail(
      '.agents/plugins/marketplace.json: source.path must point to repository root',
    );
  }
}

for (const entry of readdirSync(skillsRoot)) {
  const path = join(skillsRoot, entry);
  if (statSync(path).isDirectory()) validateSkill(path);
}

for (const path of [
  join(root, 'README.md'),
  join(root, 'README.ja.md'),
  ...readdirSync(skillsRoot).flatMap((name) => [
    join(skillsRoot, name, 'README.md'),
    join(skillsRoot, name, 'README.ja.md'),
    join(skillsRoot, name, 'SKILL.md'),
    join(skillsRoot, name, 'SKILL.ja.md'),
  ]),
]) {
  if (existsSync(path)) validateLocalLinks(path);
}

validateManifestVersions();

if (errors.length > 0) {
  console.error(errors.map((error) => `- ${error}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log('Validated shared Claude Code/Codex skills.');
}
