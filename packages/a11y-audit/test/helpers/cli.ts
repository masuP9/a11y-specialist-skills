import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export interface CliRun {
  code: number | null;
  stdout: string;
  stderr: string;
}

// Async on purpose: a sync spawn would block this process, which also serves
// the fixture pages.
export function runCli(
  args: string[],
  timeoutMs: number,
  options: { env?: NodeJS.ProcessEnv } = {},
): Promise<CliRun> {
  const cliPath = fileURLToPath(new URL('../../dist/cli.js', import.meta.url));
  return new Promise((resolve, reject) => {
    const child = execFile(
      process.execPath,
      [cliPath, ...args],
      { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, env: options.env },
      (error, stdout, stderr) => {
        if (error && child.exitCode === null) {
          reject(
            new Error(
              `a11y-audit CLI did not exit normally (${error.message}); stderr: ${stderr}`,
            ),
          );
          return;
        }
        resolve({ code: child.exitCode, stdout, stderr });
      },
    );
  });
}
