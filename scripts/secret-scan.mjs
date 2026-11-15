import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function assertSecretSafe(text, file) {
  assert(!/\b(?:[ps]k-lf-[\w-]{8,}|gh[pousr]_[\w]{20,})\b/.test(text), `credential-like key in ${file}`);
  // Ignore expressions/code; inspect literal JSON/YAML password assignments, including docs examples.
  const assignments = [
    ...text.matchAll(/["']?basicAuthPassword["']?\s*:\s*["']([^"'\n]*)["']/g),
    ...text.matchAll(/^\s*basicAuthPassword:\s*([^\s"'#\n]+)/gm),
  ];
  for (const [, value] of assignments) {
    assert(
      !value || /^\$(?:\{|[A-Z_])/.test(value) || ['null', 'undefined', 'false', 'true'].includes(value),
      `literal credential in ${file}`
    );
  }
  assert(
    !/\b(?:Authorization|authorization)["']?\s*:\s*["'](?:Basic|Bearer)\s+[A-Za-z0-9+/=]{16,}/.test(text),
    `authorization credential in ${file}`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean);
  let count = 0;
  for (const file of files) {
    if (!/^(?:docs|provisioning|tests)\//.test(file) || !/\.(?:md|json|ya?ml|ts|mjs)$/.test(file)) {
      continue;
    }
    const text = await readFile(file, 'utf8');
    assertSecretSafe(text, file);
    count++;
  }
  console.log(`Secret scan passed (${count} docs, provisioning and synthetic test files)`);
}
