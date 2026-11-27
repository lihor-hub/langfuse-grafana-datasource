import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { parseArgs, promisify } from 'node:util';

export const automationName = 'Weekly Grafana and Langfuse compatibility (Pi)';
const execute = promisify(execFile);
const root = new URL('../', import.meta.url);
export const bootstrapFiles = [
  '.agents/skills/upstream-compatibility/SKILL.md',
  '.agents/skills/upstream-compatibility/references/pr-template.md',
  '.github/agent-prompts/upstream-compatibility.md',
  '.github/agent-memory/upstream-compatibility.md',
  '.github/upstream-compatibility.json',
  '.github/upstream-compatibility-baseline.json',
  'scripts/upstream-compatibility.mjs',
  'scripts/setup-upstream-automation.mjs',
  'package.json',
];

export function resolveModel(explicit, env = process.env) {
  const model = explicit ?? (env.PI_PROVIDER && env.PI_MODEL ? `${env.PI_PROVIDER}/${env.PI_MODEL}` : null);
  if (!model || !/^[\w-]+\/[^\s]+$/.test(model)) {
    throw new Error('Pass --model ROUTE/MODEL or run setup from the desired Pi session');
  }
  return model;
}

export async function configure({ project, model, paused, prompt }, run) {
  if (!project || !model || !prompt) {
    throw new Error('Project, Pi model and prompt are required');
  }
  const jobs = JSON.parse(await run('bb', ['automation', 'list', '--project', project, '--json']));
  if (!Array.isArray(jobs)) {
    throw new Error('Unexpected automation list response');
  }
  const matches = jobs.filter((job) => job.name === automationName);
  if (matches.length > 1) {
    throw new Error('Duplicate maintenance automations require manual reconciliation');
  }
  let id = matches[0]?.id;
  if (id) {
    const history = JSON.parse(
      await run('bb', ['automation', 'runs', id, '--project', project, '--limit', '10', '--json'])
    );
    const runs = history?.runs;
    if (!Array.isArray(runs)) {
      throw new Error('Unexpected automation run response');
    }
    if (runs.some((item) => ['queued', 'running', 'starting'].includes(item.status))) {
      throw new Error('Maintenance run is active; do not replace it');
    }
    await run('bb', ['automation', 'pause', id, '--project', project]);
  }
  const common = [
    '--project',
    project,
    '--name',
    automationName,
    '--cron',
    '0 7 * * 1',
    '--timezone',
    'UTC',
    '--provider',
    'pi',
    '--model',
    model,
    '--reasoning',
    'medium',
    '--new-environment',
    'worktree',
    '--base-branch',
    'origin/main',
    '--prompt',
    prompt,
    '--json',
  ];
  const response = JSON.parse(
    await run('bb', id ? ['automation', 'update', id, ...common] : ['automation', 'create', '--disabled', ...common])
  );
  id ??= response.id ?? response.automation?.id;
  if (!id) {
    throw new Error('Automation response did not contain an id; inspect before retrying');
  }
  if (!paused) {
    await run('bb', ['automation', 'resume', id, '--project', project]);
  }
  return { id, project, provider: 'pi', model, paused: Boolean(paused), cron: '0 7 * * 1', timezone: 'UTC' };
}

async function main() {
  const { values } = parseArgs({
    options: { project: { type: 'string' }, model: { type: 'string' }, paused: { type: 'boolean', default: false } },
  });
  if (!values.project) {
    throw new Error('--project is required');
  }
  const model = resolveModel(values.model);
  const run = async (command, args) =>
    (await execute(command, args, { cwd: root, timeout: 60_000, maxBuffer: 4 * 1024 * 1024 })).stdout;
  const prompt = await readFile(new URL('.github/agent-prompts/upstream-compatibility.md', root), 'utf8');
  // Paused provisioning is safe before merge. Activation must use reviewed main.
  if (!values.paused) {
    await run('git', ['fetch', 'origin', 'main']);
    for (const path of bootstrapFiles) {
      const approved = await run('git', ['show', `origin/main:${path}`]);
      if (approved !== (await readFile(new URL(path, root), 'utf8'))) {
        throw new Error(`Merge and synchronize ${path} before activation`);
      }
    }
  }
  console.log(
    JSON.stringify(await configure({ project: values.project, model, paused: values.paused, prompt }, run), null, 2)
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Automation setup failed: ${error.message}`);
    process.exitCode = 1;
  });
}
