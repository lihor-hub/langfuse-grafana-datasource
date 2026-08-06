import { execFileSync } from 'node:child_process';

const patterns = [
  { name: 'OpenAI-style secret', regex: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { name: 'Langfuse secret key', regex: /\bsk-lf-[A-Za-z0-9_-]{8,}\b/ },
  { name: 'Langfuse public key', regex: /\bpk-lf-[A-Za-z0-9_-]{8,}\b/ },
  { name: 'GitHub token', regex: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/ },
];

function git(args, options = {}) {
  return execFileSync('git', args, {
    encoding: 'buffer',
    maxBuffer: 100 * 1024 * 1024,
    ...options,
  });
}

function isText(buffer) {
  return !buffer.includes(0);
}

const objectPaths = new Map();
const objectLines = git(['rev-list', '--objects', '--all']).toString('utf8').trim().split('\n');

for (const line of objectLines) {
  const [objectId, ...pathParts] = line.split(' ');
  if (pathParts.length > 0 && !objectPaths.has(objectId)) {
    objectPaths.set(objectId, pathParts.join(' '));
  }
}

const findings = [];

for (const [objectId, filePath] of objectPaths) {
  if (git(['cat-file', '-t', objectId]).toString('utf8').trim() !== 'blob') {
    continue;
  }

  const blob = git(['cat-file', 'blob', objectId]);
  if (!isText(blob)) {
    continue;
  }

  const text = blob.toString('utf8');
  for (const { name, regex } of patterns) {
    if (regex.test(text)) {
      findings.push(`${name} found in history blob ${objectId} (${filePath})`);
    }
  }
}

if (findings.length > 0) {
  for (const finding of findings) {
    console.error(finding);
  }
  process.exitCode = 1;
}
