import { describe, expect, it } from 'vitest';
import { CardImportError, inspectImportFile } from '../packages/rp-card-codecs/dist/index.js';
import {
  describeImportError,
  describeInspection,
} from '../apps/mobile/src/infra/import-feedback.js';

describe('local import feedback', () => {
  it('distinguishes a preset from a character card without showing its contents', () => {
    const input = new TextEncoder().encode(
      JSON.stringify({
        prompts: [{ identifier: 'synthetic', content: 'PRIVATE_SYNTHETIC_PROMPT_BODY' }],
        prompt_order: [{ order: [{ identifier: 'synthetic', enabled: true }] }],
        extensions: { script: 'PRIVATE_SYNTHETIC_EXTENSION_BODY' },
      }),
    );
    const summary = describeInspection(inspectImportFile(input));
    expect(summary).toContain('生成预设');
    expect(summary).toContain('不是 V2/V3 角色卡');
    expect(summary).toContain('未应用到聊天');
    expect(summary).not.toContain('PRIVATE_SYNTHETIC');
  });
  it('reports different limits without confusing structure limits with file size', () => {
    expect(
      describeImportError(
        new CardImportError('too_large', {
          kind: 'jsonBytes',
          maximum: 8 * 1024 * 1024,
          actual: 9 * 1024 * 1024,
        }),
      ),
    ).toContain('8.00 MiB 上限，本次 9.00 MiB');
    expect(
      describeImportError(
        new CardImportError('too_large', {
          kind: 'jsonDepth',
          maximum: 64,
          actual: 65,
        }),
      ),
    ).toContain('不一定是文件字节大小问题');
  });
  it('never echoes native error paths or parser error text', () => {
    const nativeError = new Error('/private/synthetic/path: PRIVATE_SYNTHETIC_CONTENT');
    expect(describeImportError(nativeError)).not.toContain('PRIVATE_SYNTHETIC');
    expect(describeImportError(nativeError)).not.toContain('/private');
    expect(describeImportError(new CardImportError('invalid_json'))).toContain('JSON 编码或语法');
  });
});
