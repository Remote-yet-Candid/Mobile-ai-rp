import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { readCardJson, readCardPng, writeCardJson } from '../packages/rp-card-codecs/dist/index.js';

// Test external data only; no upstream implementation, image or character text is vendored.
const commit = '06bde939fb1e9c4c8d8641d810f0a916b5bce127';
const source = `https://raw.githubusercontent.com/SillyTavern/SillyTavern/${commit}/default/content/default_Seraphina.png`;
const expectedSha256 = '8a71e8270f54fafbccf905b1bdf053a6a55f57bea89c01fcd8c0e87ee76a2d52';
const directory = new URL('../artifacts/external-card/', import.meta.url);
mkdirSync(directory, { recursive: true });
const filename = new URL('seraphina.png', directory);
if (!existsSync(filename)) {
  const temporary = mkdtempSync(join(directory.pathname, '.download-'));
  try {
    const download = join(temporary, 'card.png');
    execFileSync('curl', [
      '--fail',
      '--silent',
      '--show-error',
      '--max-time',
      '30',
      '--max-filesize',
      '8388608',
      source,
      '--output',
      download,
    ]);
    assert.equal(
      createHash('sha256').update(readFileSync(download)).digest('hex'),
      expectedSha256,
      'External fixture checksum mismatch',
    );
    renameSync(download, filename);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}
const bytes = readFileSync(filename);
assert.equal(
  createHash('sha256').update(bytes).digest('hex'),
  expectedSha256,
  'External fixture checksum mismatch; do not change the expected checksum to bypass this check',
);
const result = readCardPng(bytes);
assert.equal(result.document.spec, 'chara_card_v3');
assert.equal(result.metadataKeyword, 'ccv3');
assert(result.warnings.includes('v3_preferred_over_v2_metadata'));
const json = writeCardJson(result.document);
assert.deepEqual(readCardJson(json).document, result.document);
const report = {
  source,
  upstreamCommit: commit,
  sha256: expectedSha256,
  bytes: bytes.length,
  attribution: 'Default Seraphina content credited to OtisAlejandro by upstream',
  upstreamLicense: `https://github.com/SillyTavern/SillyTavern/blob/${commit}/LICENSE`,
  licenseScope:
    'Upstream repository declares AGPL-3.0. External local verification only; no image, character text or upstream source redistributed or relicensed under Apache-2.0.',
  selectedMetadata: result.metadataKeyword,
  spec: result.document.spec,
  warnings: result.warnings,
  extensionFieldsRetained: Object.keys(result.document.data.extensions ?? {}).length,
  derivedJsonRoundTrip: true,
  imageDecodeOrRenderingVerified: false,
};
writeFileSync(new URL('report.json', directory), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
