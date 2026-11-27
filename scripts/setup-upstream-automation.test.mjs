import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { automationName, bootstrapFiles, configure, resolveModel } from './setup-upstream-automation.mjs';

const options = {
  project: 'proj_test',
  model: 'openai/test-model',
  prompt: 'Follow the reviewed repository skill.',
  paused: true,
};

function runner(jobs = [], runs = []) {
  const calls = [];
  const run = async (command, args) => {
    calls.push([command, ...args]);
    if (args[1] === 'list') {
      return JSON.stringify(jobs);
    }
    if (args[1] === 'runs') {
      return JSON.stringify({ runs, nextCursor: null });
    }
    return JSON.stringify({ id: 'auto_test' });
  };
  return { calls, run };
}

test('provider route/model is preserved instead of replacing Pi with another harness', () => {
  assert.equal(resolveModel(null, { PI_PROVIDER: 'openai', PI_MODEL: 'test-model' }), 'openai/test-model');
  assert.equal(resolveModel('anthropic/test-model', {}), 'anthropic/test-model');
  assert.throws(() => resolveModel(null, {}), /Pass --model/);
  assert.throws(() => resolveModel('model-without-route', {}), /Pass --model/);
});

test('paused setup creates one disabled weekly Pi job on fresh fetched-main worktrees', async () => {
  const { calls, run } = runner();
  const result = await configure(options, run);
  assert.equal(result.id, 'auto_test');
  const create = calls.find((args) => args[2] === 'create');
  for (const value of ['--disabled', 'pi', 'openai/test-model', 'origin/main', 'worktree', '0 7 * * 1', 'UTC']) {
    assert.ok(create.includes(value));
  }
  assert.equal(
    calls.some((args) => args[2] === 'resume'),
    false
  );
});

test('existing matching job is reconciled, not duplicated, and may resume after caller gate', async () => {
  const { calls, run } = runner([{ id: 'auto_test', name: automationName }]);
  const result = await configure({ ...options, paused: false }, run);
  assert.equal(result.paused, false);
  assert.ok(calls.some((args) => args[2] === 'update'));
  assert.ok(calls.some((args) => args[2] === 'resume'));
  assert.equal(
    calls.some((args) => args[2] === 'create'),
    false
  );
});

test('duplicates or active runs stop reconciliation before schedule mutation', async () => {
  const duplicate = runner([
    { id: 'one', name: automationName },
    { id: 'two', name: automationName },
  ]);
  await assert.rejects(configure(options, duplicate.run), /Duplicate/);
  const active = runner([{ id: 'one', name: automationName }], [{ status: 'running' }]);
  await assert.rejects(configure(options, active.run), /active/);
  assert.equal(
    active.calls.some((args) => ['pause', 'create', 'update'].includes(args[2])),
    false
  );
});

test('bootstrap files exist and schedule prompt preserves privilege boundaries', async () => {
  for (const file of bootstrapFiles) {
    await readFile(new URL('../' + file, import.meta.url));
  }
  const prompt = await readFile(new URL('../.github/agent-prompts/upstream-compatibility.md', import.meta.url), 'utf8');
  for (const phrase of ['Pi', 'origin/main', 'Never merge', 'untrusted evidence', 'support floors', 'standing']) {
    assert.ok(prompt.includes(phrase));
  }
});
