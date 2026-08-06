import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requiredFiles = [
  'README.md',
  'LICENSE',
  'NOTICE',
  'CHANGELOG.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'SUPPORT.md',
  'CODE_OF_CONDUCT.md',
  'AGENTS.md',
  '.github/CODEOWNERS',
  '.github/ISSUE_TEMPLATE/bug_report.yml',
  '.github/ISSUE_TEMPLATE/feature_request.yml',
  '.github/ISSUE_TEMPLATE/config.yml',
  '.github/PULL_REQUEST_TEMPLATE.md',
  '.github/rulesets/main.json',
  'docs/agents/repository-rules.md',
  'docs/maintainers/github-settings.md',
  'docs/maintainers/releasing.md',
  'docs/maintainers/grafana-catalog-launch.md',
  'package.json',
  'package-lock.json',
  '.nvmrc',
  '.github/workflows/repository-readiness.yml',
];
const licenseDigest = 'cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30';
const secretPatterns = [
  { name: 'OpenAI-style secret', regex: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { name: 'Langfuse secret key', regex: /\bsk-lf-[A-Za-z0-9_-]{8,}\b/ },
  { name: 'Langfuse public key', regex: /\bpk-lf-[A-Za-z0-9_-]{8,}\b/ },
  { name: 'GitHub token', regex: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/ },
];
const issuesDirectory = '.github/ISSUE_TEMPLATE';
const unfinishedMarkers = ['T' + 'BD', 'TO' + 'DO', 'PLACE' + 'HOLDER'];
const placeholderPattern = new RegExp(`\\b(?:${unfinishedMarkers.join('|')})\\b`);

function repositoryPath(relativePath) {
  return path.join(root, relativePath);
}

async function readText(relativePath) {
  return readFile(repositoryPath(relativePath), 'utf8');
}

async function requireFile(relativePath) {
  const fileStat = await stat(repositoryPath(relativePath));
  assert(fileStat.isFile(), `${relativePath} must be a regular file`);
  assert(fileStat.size > 0, `${relativePath} must not be empty`);
}

function trackedFiles() {
  return execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
}

function checkIssueForm(name, document, expectedLabel) {
  assert.equal(typeof document.name, 'string', `${name}: name must be a string`);
  assert.equal(typeof document.description, 'string', `${name}: description must be a string`);
  assert(Array.isArray(document.labels), `${name}: labels must be an array`);
  assert(document.labels.includes(expectedLabel), `${name}: missing ${expectedLabel} label`);
  assert(document.labels.includes('needs-triage'), `${name}: missing needs-triage label`);
  assert(Array.isArray(document.body) && document.body.length > 0, `${name}: body must not be empty`);

  const ids = document.body.map((item) => item.id).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length, `${name}: field ids must be unique`);
  for (const item of document.body) {
    assert(
      ['markdown', 'textarea', 'input', 'dropdown', 'checkboxes'].includes(item.type),
      `${name}: unsupported field type ${item.type}`,
    );
  }
}

function checkRuleset(ruleset) {
  assert.equal(ruleset.name, 'Protect main');
  assert.equal(ruleset.target, 'branch');
  assert.equal(ruleset.enforcement, 'active');
  assert.deepEqual(ruleset.conditions?.ref_name?.include, ['~DEFAULT_BRANCH']);
  assert.deepEqual(ruleset.conditions?.ref_name?.exclude, []);
  assert.deepEqual(ruleset.bypass_actors, [
    { actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'pull_request' },
  ]);

  const rules = new Map(ruleset.rules.map((rule) => [rule.type, rule]));
  for (const type of ['deletion', 'non_fast_forward', 'required_linear_history', 'pull_request', 'required_status_checks']) {
    assert(rules.has(type), `ruleset: missing ${type}`);
  }

  const pullRequest = rules.get('pull_request').parameters;
  assert.deepEqual(pullRequest.allowed_merge_methods, ['squash', 'rebase']);
  assert.equal(pullRequest.dismiss_stale_reviews_on_push, true);
  assert.equal(pullRequest.require_code_owner_review, true);
  assert.equal(pullRequest.require_last_push_approval, true);
  assert.equal(pullRequest.required_approving_review_count, 1);
  assert.equal(pullRequest.required_review_thread_resolution, true);

  const statusChecks = rules.get('required_status_checks').parameters;
  assert.equal(statusChecks.do_not_enforce_on_create, false);
  assert.equal(statusChecks.strict_required_status_checks_policy, true);
  assert.deepEqual(statusChecks.required_status_checks, [{ context: 'Repository readiness' }]);
}

function checkWorkflow(workflow) {
  assert.equal(workflow.name, 'Repository readiness');
  assert.deepEqual(workflow.on, { push: null, pull_request: null, workflow_dispatch: null });
  assert.deepEqual(workflow.permissions, { contents: 'read' });

  const job = workflow.jobs?.['repository-readiness'];
  assert(job, 'workflow must define repository-readiness job');
  assert.equal(job.name, 'Repository readiness');
  assert.equal(job['runs-on'], 'ubuntu-24.04');
  assert.deepEqual(job.steps[0], {
    uses: 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
    with: { 'fetch-depth': 0, 'persist-credentials': false },
  });
  assert.deepEqual(job.steps[1], {
    uses: 'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
    with: { 'node-version-file': '.nvmrc', cache: 'npm' },
  });
  assert(job.steps.some((step) => step.run === 'npm ci'), 'workflow must install the lockfile');
  assert(job.steps.some((step) => step.run === 'npm run check'), 'workflow must run repository checks');
}

function checkNoSensitiveCurrentTree(files, contents) {
  for (const relativePath of files) {
    const text = contents.get(relativePath);
    if (!text || text.includes('\0')) {
      continue;
    }
    for (const { name, regex } of secretPatterns) {
      if (regex.test(text)) {
        throw new Error(`${name} found in tracked file ${relativePath}`);
      }
    }
  }
}

try {
  await Promise.all(requiredFiles.map(requireFile));

  const license = await readText('LICENSE');
  assert.equal(createHash('sha256').update(license).digest('hex'), licenseDigest, 'LICENSE must match Apache-2.0');
  assert.equal((await readText('.nvmrc')).trim(), '22', '.nvmrc must select Node 22');

  const bugForm = parse(await readText(`${issuesDirectory}/bug_report.yml`));
  const featureForm = parse(await readText(`${issuesDirectory}/feature_request.yml`));
  const issueConfig = parse(await readText(`${issuesDirectory}/config.yml`));
  checkIssueForm('bug_report.yml', bugForm, 'bug');
  checkIssueForm('feature_request.yml', featureForm, 'enhancement');
  assert.equal(issueConfig.blank_issues_enabled, false, 'config.yml must disable blank issues');
  assert.equal(issueConfig.contact_links?.length, 3, 'config.yml must define three contact links');
  assert(
    bugForm.body.some((item) => item.type === 'checkboxes' && item.id === 'checks'),
    'bug_report.yml must include the redaction confirmation',
  );

  checkRuleset(JSON.parse(await readText('.github/rulesets/main.json')));
  checkWorkflow(parse(await readText('.github/workflows/repository-readiness.yml')));

  const files = trackedFiles();
  const contents = new Map(await Promise.all(files.map(async (relativePath) => [
    relativePath,
    await readText(relativePath).catch(() => null),
  ])));
  const publicTextFiles = files.filter((relativePath) =>
    !relativePath.startsWith('docs/superpowers/') && /\.(?:md|json|ya?ml|mjs)$/.test(relativePath),
  );
  for (const relativePath of publicTextFiles) {
    assert(!placeholderPattern.test(contents.get(relativePath) ?? ''), `${relativePath} contains an unfinished placeholder`);
  }
  checkNoSensitiveCurrentTree(files, contents);

  const historyCheck = spawnSync(process.execPath, ['scripts/check-repository-history.mjs'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(historyCheck.status, 0, historyCheck.stderr || 'history scan failed');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
