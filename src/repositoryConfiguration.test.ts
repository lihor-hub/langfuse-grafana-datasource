import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function repositoryFile(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('repository configuration', () => {
  it('provides ephemeral E2E credentials to Compose and Playwright without hard-coding them', () => {
    const workflow = repositoryFile('.github/workflows/ci.yml');
    const credentialSetup = workflow.indexOf('- name: Configure ephemeral E2E credentials');
    const composeStart = workflow.indexOf('- name: Start Grafana');
    const playwrightRun = workflow.indexOf('- name: Run Playwright tests');

    expect(credentialSetup).toBeGreaterThan(-1);
    expect(credentialSetup).toBeLessThan(composeStart);
    expect(credentialSetup).toBeLessThan(playwrightRun);
    expect(workflow).toContain('LANGFUSE_E2E_PUBLIC_KEY=pk-e2e-ci');
    expect(workflow).toContain('openssl rand -hex 32');
    expect(workflow.match(/>> "\$GITHUB_ENV"/g)).toHaveLength(2);
    expect(workflow).not.toMatch(/LANGFUSE_E2E_SECRET=(?:sk-|['"]?[A-Za-z0-9]{32,})/);
  });

  it('builds release metadata for version 0.1.1 with the canonical repository and plugin ID', () => {
    const repositoryUrl = 'https://github.com/lihor-hub/langfuse-grafana-datasource';
    const packageJson = JSON.parse(repositoryFile('package.json')) as {
      version: string;
      repository?: { type?: string; url?: string };
    };
    const packageLock = JSON.parse(repositoryFile('package-lock.json')) as {
      version: string;
      packages: Record<string, { version?: string }>;
    };
    const pluginJson = JSON.parse(repositoryFile('src/plugin.json')) as {
      id: string;
      info: { links: Array<{ name: string; url: string }>; version: string };
    };

    expect(packageJson.version).toBe('0.1.1');
    expect(packageJson.repository).toEqual({ type: 'git', url: `${repositoryUrl}.git` });
    expect(packageLock.version).toBe('0.1.1');
    expect(packageLock.packages[''].version).toBe('0.1.1');
    expect(repositoryFile('CHANGELOG.md')).toContain('## 0.1.1 (Unreleased)');
    expect(pluginJson).toEqual(
      expect.objectContaining({
        id: 'lihorhub-langfuse-datasource',
        info: expect.objectContaining({
          links: expect.arrayContaining([{ name: 'GitHub', url: repositoryUrl }]),
          version: '%VERSION%',
        }),
      })
    );
  });

  it('checks E2E secret redaction without giving Playwright sensitive matcher operands', () => {
    const e2eTest = repositoryFile('tests/e2e/configuration.spec.ts');

    expect(e2eTest).not.toMatch(/\.not\.toContain\(LANGFUSE_SECRET/);
    expect(e2eTest).not.toContain('JSON.stringify(completedBrowserRequests)');
    expect(e2eTest).toContain('expect(containsSecret).toBe(false)');
  });

  it('isolates Playwright discovery from Node fixture and opt-in real-host smoke suites', () => {
    expect(repositoryFile('playwright.config.ts')).toContain("testDir: './tests/e2e'");
  });

  it('disables only the external i18next support notice in Jest', () => {
    const jestSetup = repositoryFile('jest-setup.js');

    expect(jestSetup).toContain("process.env.I18NEXT_NO_SUPPORT_NOTICE = 'true';");
    expect(jestSetup).not.toMatch(/(?:spyOn\(console, ['"]info['"]\)|console\.info\s*=)/);
  });

  it('preserves mock diagnostics on startup failure and always tears Compose down', () => {
    const workflow = repositoryFile('.github/workflows/ci.yml');
    const startStep = workflow.slice(
      workflow.indexOf('- name: Start Grafana'),
      workflow.indexOf('- name: Wait for grafana server')
    );
    const cleanupStep = workflow.slice(
      workflow.indexOf('- name: Stop grafana docker'),
      workflow.indexOf('# Uncomment this step')
    );

    expect(startStep).toContain('id: start-grafana');
    expect(startStep).toContain('docker compose pull');
    expect(startStep).toContain('if ! ANONYMOUS_AUTH_ENABLED=false');
    expect(startStep).toContain('docker compose up -d; then');
    expect(startStep).toContain('docker compose ps --all mock-langfuse mock-langfuse-no-v2 || true');
    expect(startStep).toContain('docker compose logs --no-color mock-langfuse mock-langfuse-no-v2');
    expect(startStep).toContain('exit 1');
    expect(startStep.indexOf('docker compose up -d')).toBeLessThan(startStep.indexOf('docker compose ps'));
    expect(startStep.indexOf('docker compose ps --all')).toBeLessThan(startStep.indexOf('docker compose logs'));
    expect(cleanupStep).toContain('if: ${{ always() }}');
    expect(cleanupStep).toContain('run: docker compose down --volumes');
    expect(workflow.indexOf('- name: Docker logs')).toBeLessThan(workflow.indexOf('- name: Stop grafana docker'));
  });

  it('health-checks both mocks through Node on IPv4 loopback', () => {
    const compose = repositoryFile('docker-compose.yaml');
    const nodeProbe =
      "fetch('http://127.0.0.1:8080/__test/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))";

    expect(compose.split(nodeProbe)).toHaveLength(3);
    expect(compose).not.toContain("'wget'");
    expect(compose).not.toContain('http://localhost:8080/__test/health');
  });

  it('verifies the real Save & Test observation probe uses a bounded one-hour ISO window', () => {
    const e2eTest = repositoryFile('tests/e2e/configuration.spec.ts');
    const successAlertCompleted = e2eTest.indexOf("await expect(configPage).toHaveAlert('success'");
    const saveAndTestFinished = e2eTest.indexOf('const saveAndTestFinishedAt = Date.now()');

    expect(e2eTest).toContain('const saveAndTestStartedAt = Date.now()');
    expect(successAlertCompleted).toBeGreaterThan(-1);
    expect(saveAndTestFinished).toBeGreaterThan(successAlertCompleted);
    expect(e2eTest).toContain('assertObservationProbeWindow(');
    expect(e2eTest).toContain('toTime - fromTime === 60 * 60 * 1000');
  });

  it('audits all relevant post-save browser requests without exposing secret-bearing values', () => {
    const e2eTest = repositoryFile('tests/e2e/configuration.spec.ts');

    expect(e2eTest).toContain('captureRelevantBrowserRequests(page)');
    expect(e2eTest).toContain('sanitizeSaveRequest(');
    expect(e2eTest).toContain('assertSecretRedacted(saveRequest.url)');
    expect(e2eTest).toContain('assertSecretRedacted(saveRequest.headers)');
    expect(e2eTest).toContain('secureJsonData.basicAuthPassword === LANGFUSE_SECRET');
    expect(e2eTest).toContain("secureJsonData.basicAuthPassword = '[REDACTED]'");
    expect(e2eTest).toContain('assertSecretRedacted(sanitizedSaveRequest)');
    expect(e2eTest).toContain('await configPage.goto()');
    expect(e2eTest).toContain('const laterBrowserRequests =');
    expect(e2eTest).toContain('assertSecretRedacted(laterBrowserRequests)');
    expect(e2eTest).toContain('expect(targetsMockLangfuse).toBe(false)');
  });

  it('exercises real Grafana proxy cancellation without fixed sleeps', () => {
    const e2eTest = repositoryFile('tests/e2e/configuration.spec.ts');

    expect(e2eTest).toContain("test('aborts a delayed Metrics v2 request through the Grafana proxy'");
    expect(e2eTest).toContain('new AbortController()');
    expect(e2eTest).toMatch(/expect\s*\.poll/);
    expect(e2eTest).toContain('event.aborted');
    expect(e2eTest).toContain('expect(settledBeforeAbort).toBe(false)');
    expect(e2eTest).toContain('isAbortError');
    expect(e2eTest).toContain('expect(isAbortError).toBe(true)');
    expect(e2eTest).toContain('expect(responseConsumed).toBe(false)');
    expect(e2eTest).not.toContain('waitForTimeout');
  });
});
