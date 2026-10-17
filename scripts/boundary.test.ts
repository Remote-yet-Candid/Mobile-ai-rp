import { describe, expect, it } from 'vitest';
import { inspectCoreSource } from './check-core-boundary.mjs';

describe('core boundary guard', () => {
  it.each([
    "import { View } from 'react-native'",
    "export * from 'expo-sqlite'",
    "import x from 'node:fs'",
    "import x from '@unknown/wrapped-network'",
    'fetch("https://example.invalid")',
    'Date.now()',
    'Math.random()',
    'Math["random"]()',
    "import x from '../../provider-openai-compat/src/index.js'",
    'globalThis["fetch"]()',
    'import("./dynamic.js")',
  ])('rejects forbidden capability: %s', (source) => {
    expect(inspectCoreSource(source).length).toBeGreaterThan(0);
  });
  it('permits deterministic functions and injected provider types', () => {
    expect(
      inspectCoreSource(
        "import type { RPRequest } from '@mobile-ai-rp/rp-provider'; export const add = (a: number, b: number) => a + b;",
      ),
    ).toEqual([]);
  });
});
