#!/usr/bin/env node
/**
 * Cross-platform test runner
 * Usage: node run-test.js <test-file(s)> [url]
 */
const { execFileSync } = require('child_process');

const testFiles = process.argv[2];
const url = process.argv[3] || '';

if (!testFiles) {
  console.error('Usage: node run-test.js <test-file(s)> [url]');
  process.exit(1);
}

const env = { ...process.env };
if (url) {
  env.TEST_PAGE = url;
}

// Split test files by space (handles "file1.ts file2.ts" format)
const files = testFiles.split(/\s+/).filter(Boolean);

try {
  execFileSync('npx', ['playwright', 'test', ...files], {
    stdio: 'inherit',
    env,
  });
} catch (e) {
  process.exit(e.status || 1);
}
