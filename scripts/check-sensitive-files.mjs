import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Narrow repository guard; not a substitute for credential rotation or full security review. */
export function inspectSensitiveFile(filename, content) {
  const failures = [];
  if (/(?:^|\/)\.env(?:\..*)?$/.test(filename) && !filename.endsWith('.example'))
    failures.push('environment file');
  if (/\.(?:keystore|jks|p12|mobileprovision)$/i.test(filename)) failures.push('signing material');
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content))
    failures.push('private key');
  if (/\bsk-[A-Za-z0-9_-]{20,}\b/.test(content)) failures.push('provider token pattern');
  if (/\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{20,}\b/.test(content))
    failures.push('GitHub token pattern');
  return failures;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { encoding: 'utf8' },
  )
    .split('\0')
    .filter(Boolean);
  const failures = [];
  for (const filename of [...new Set(files)]) {
    if (!existsSync(filename)) continue; // Deleted tracked files have no candidate content.
    const content = readFileSync(filename, 'utf8');
    for (const rule of inspectSensitiveFile(filename, content))
      failures.push(`${filename}: ${rule}`);
  }
  if (failures.length) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
  } else console.log('Repository sensitive-file and known-token pattern checks passed.');
}
