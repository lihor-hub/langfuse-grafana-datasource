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

  it('builds release metadata for version 0.1.0 with the canonical repository and plugin ID', () => {
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

    expect(packageJson.version).toBe('0.1.0');
    expect(packageJson.repository).toEqual({ type: 'git', url: `${repositoryUrl}.git` });
    expect(packageLock.version).toBe('0.1.0');
    expect(packageLock.packages[''].version).toBe('0.1.0');
    expect(repositoryFile('CHANGELOG.md')).toContain('## 0.1.0 (Unreleased)');
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
    expect(e2eTest.match(/assertSecretRedacted\(/g)).toHaveLength(4);
    expect(e2eTest).toContain('expect(containsSecret).toBe(false)');
  });
});
