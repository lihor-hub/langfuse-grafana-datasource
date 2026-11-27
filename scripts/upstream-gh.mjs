import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);

// Keep CLI device state outside a fresh worktree without moving authentication.
export function githubEnvironment(environment = process.env) {
  const storage = environment.BB_THREAD_STORAGE;
  const state = storage && isAbsolute(storage) ? join(storage, 'github-state') : join(homedir(), '.local', 'state');
  return { ...environment, XDG_STATE_HOME: state };
}

export async function githubCli(args, run = execute, environment = process.env) {
  const { stdout } = await run('gh', args, {
    env: githubEnvironment(environment),
    timeout: 60_000,
    maxBuffer: 32 * 1024 * 1024,
  });
  return stdout;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  githubCli(process.argv.slice(2))
    .then((stdout) => process.stdout.write(stdout))
    .catch((error) => {
      console.error(`GitHub command failed: ${error.message}`);
      process.exitCode = 1;
    });
}
