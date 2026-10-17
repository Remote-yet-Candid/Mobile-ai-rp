import { expect, it } from 'vitest';
import { inspectSensitiveFile } from './check-sensitive-files.mjs';

it('rejects tracked credential/signing files and token patterns without printing their values', () => {
  expect(inspectSensitiveFile('.env.production', '')).toContain('environment file');
  expect(inspectSensitiveFile('android/release.jks', '')).toContain('signing material');
  expect(inspectSensitiveFile('config.ts', ['sk', 'a'.repeat(32)].join('-'))).toContain(
    'provider token pattern',
  );
  expect(inspectSensitiveFile('config.ts', ['ghp', 'a'.repeat(32)].join('_'))).toContain(
    'GitHub token pattern',
  );
});
it('permits secure references and documented variable names without values', () => {
  expect(
    inspectSensitiveFile('.github/workflows/build.yml', 'EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}'),
  ).toEqual([]);
  expect(inspectSensitiveFile('.env.example', 'EXPO_TOKEN=')).toEqual([]);
});
