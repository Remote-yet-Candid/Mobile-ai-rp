import { crc32, deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  CARD_LIMITS,
  CardImportError,
  readCardJson,
  readCardPng,
  writeCardJson,
} from '../src/index.js';

function card(spec: 'chara_card_v2' | 'chara_card_v3' = 'chara_card_v3') {
  return {
    spec,
    spec_version: spec === 'chara_card_v3' ? '3.0' : '2.0',
    data: {
      name: '合成测试卡',
      description: 'Independent synthetic fixture.',
      personality: '',
      scenario: '',
      first_mes: '你好',
      mes_example: '',
      creator_notes: '<script>must never execute</script>',
      system_prompt: '',
      post_history_instructions: '',
      creator: 'Mobile AI RP tests',
      character_version: '1',
      tags: ['test'],
      alternate_greetings: [],
      group_only_greetings: [],
      extensions: { unknown: { array: [false, null, 0.5], text: '保留未知字段' } },
    },
    unknown_root: { retained: true },
  };
}
function chunk(type: string, payload = Buffer.alloc(0)): Buffer {
  const size = Buffer.alloc(4);
  size.writeUInt32BE(payload.length);
  const data = Buffer.concat([Buffer.from(type), payload]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(data));
  return Buffer.concat([size, data, checksum]);
}
function metadata(keyword: string, text: string) {
  return chunk('tEXt', Buffer.from(`${keyword}\0${Buffer.from(text).toString('base64')}`));
}
function png(metadataChunks: Buffer[], extra: { width?: number; before?: Buffer[] } = {}) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(extra.width ?? 1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    ...(extra.before ?? []),
    ...metadataChunks,
    chunk('IDAT', deflateSync(Buffer.from([0, 0, 0, 0, 0]))),
    chunk('IEND'),
  ]);
}
function throwsCode(action: () => unknown, code: string) {
  try {
    action();
    throw new Error('Expected import failure');
  } catch (error) {
    expect(error).toBeInstanceOf(CardImportError);
    expect((error as CardImportError).code).toBe(code);
  }
}
describe('JSON data-only card envelopes', () => {
  it('bounds nesting before parsing but ignores escaped quotes and brackets inside text', () => {
    throwsCode(() => readCardJson('['.repeat(30000) + '0' + ']'.repeat(30000)), 'too_large');
    const value = card();
    value.data.description = '[{\\"'.repeat(200);
    expect(readCardJson(JSON.stringify(value)).document.data.description).toBe(
      value.data.description,
    );
  });
  it.each(['chara_card_v2', 'chara_card_v3'] as const)(
    'preserves all fields and extensions in %s JSON round-trip',
    (spec) => {
      const original = card(spec);
      const result = readCardJson(new TextEncoder().encode(JSON.stringify(original)));
      expect(result.document).toEqual(original);
      expect(readCardJson(writeCardJson(result.document)).document).toEqual(original);
      expect(result.document.data.creator_notes).toContain('<script>');
    },
  );
  it('preserves unknown future fields and reports unverified behavior', () => {
    const result = readCardJson(JSON.stringify({ ...card(), spec_version: '3.1' }));
    expect(result.warnings).toEqual(['newer_spec_fields_preserved_behavior_unverified']);
  });
  it('does not merge prototype keys from extensions into global objects', () => {
    const original = JSON.stringify(card()).replace(
      '"unknown":',
      '"__proto__":{"polluted":true},"unknown":',
    );
    const result = readCardJson(original);
    expect(Object.hasOwn(result.document.data.extensions as object, '__proto__')).toBe(true);
    expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false);
    expect(readCardJson(writeCardJson(result.document)).document).toEqual(result.document);
  });
  it.each(['{', 'null', '[]', '{"name":"legacy"}', '{"spec":"chara_card_v3","data":{}}'])(
    'rejects invalid/legacy envelopes without exposing text',
    (value) => {
      expect(() => readCardJson(value)).toThrow(CardImportError);
    },
  );
  it('rejects invalid UTF-8 and values that cannot round-trip numerically', () => {
    throwsCode(() => readCardJson(Uint8Array.of(255)), 'invalid_json');
    throwsCode(() => readCardJson(JSON.stringify(card()).replace('0.5', '1e1000')), 'invalid_json');
    throwsCode(
      () => readCardJson(JSON.stringify(card()).replace('0.5', '9007199254740993')),
      'invalid_json',
    );
  });
  it('rejects unsupported majors and missing required fields', () => {
    throwsCode(
      () => readCardJson(JSON.stringify({ ...card(), spec_version: '4.0' })),
      'unsupported_spec',
    );
    throwsCode(
      () => readCardJson(JSON.stringify({ ...card(), data: { ...card().data, first_mes: null } })),
      'invalid_card',
    );
  });
  it('enforces byte, depth and node budgets', () => {
    throwsCode(() => readCardJson(' '.repeat(CARD_LIMITS.jsonBytes + 1)), 'too_large');
    const source = card();
    const deep = '['.repeat(66) + 'null' + ']'.repeat(66);
    throwsCode(() => readCardJson(JSON.stringify(source).replace('0.5', deep)), 'too_large');
    throwsCode(
      () => readCardJson(JSON.stringify(source).replace('0.5', '[' + '0,'.repeat(50000) + '0]')),
      'too_large',
    );
  });
});
describe('PNG bounded metadata container', () => {
  it('selects ccv3 regardless of chunk order, preserving unknown fields', () => {
    const v3 = metadata('ccv3', JSON.stringify(card()));
    const v2 = metadata('chara', JSON.stringify(card('chara_card_v2')));
    for (const chunks of [
      [v2, v3],
      [v3, v2],
    ]) {
      const result = readCardPng(png(chunks));
      expect(result.document).toEqual(card());
      expect(result.metadataKeyword).toBe('ccv3');
      expect(result.warnings).toContain('v3_preferred_over_v2_metadata');
    }
  });
  it('reads v2 chara metadata and does not mutate its creator notes', () => {
    expect(
      readCardPng(png([metadata('chara', JSON.stringify(card('chara_card_v2')))])).document,
    ).toEqual(card('chara_card_v2'));
  });
  it('works with offset views into a larger buffer', () => {
    const bytes = png([metadata('ccv3', JSON.stringify(card()))]);
    const wrapped = Buffer.concat([Buffer.from('prefix'), bytes, Buffer.from('suffix')]);
    expect(readCardPng(wrapped.subarray(6, 6 + bytes.length)).document.data.name).toBe(
      '合成测试卡',
    );
  });
  it('rejects CRC corruption, truncation, trailing bytes and missing card metadata', () => {
    const bytes = png([metadata('ccv3', JSON.stringify(card()))]);
    const corrupted = Buffer.from(bytes);
    corrupted[30] = (corrupted[30] ?? 0) ^ 1;
    throwsCode(() => readCardPng(corrupted), 'invalid_png');
    throwsCode(() => readCardPng(bytes.subarray(0, bytes.length - 1)), 'invalid_png');
    throwsCode(() => readCardPng(Buffer.concat([bytes, Buffer.from('trailing')])), 'invalid_png');
    throwsCode(() => readCardPng(png([])), 'missing_card');
  });
  it('rejects ambiguous duplicates and malformed V3 without downgrading to V2', () => {
    const valid = metadata('ccv3', JSON.stringify(card()));
    throwsCode(() => readCardPng(png([valid, valid])), 'invalid_png');
    throwsCode(
      () =>
        readCardPng(
          png([
            metadata('chara', JSON.stringify(card('chara_card_v2'))),
            metadata('ccv3', 'malformed'),
          ]),
        ),
      'invalid_json',
    );
  });
  it.each(['A===', '%%%=', 'Zm9=', 'Zg=', '<script>'])(
    'rejects invalid/noncanonical base64 %s',
    (value) => {
      throwsCode(
        () => readCardPng(png([chunk('tEXt', Buffer.from('ccv3\0' + value))])),
        'invalid_card',
      );
    },
  );
  it('does not decompress compressed card metadata or image pixels', () => {
    throwsCode(
      () => readCardPng(png([chunk('zTXt', Buffer.from('ccv3\0untrusted'))])),
      'unsupported_compression',
    );
  });
  it('enforces file, dimension and chunk budgets before rendering', () => {
    throwsCode(() => readCardPng(new Uint8Array(CARD_LIMITS.fileBytes + 1)), 'too_large');
    throwsCode(() => readCardPng(png([], { width: CARD_LIMITS.imagePixels + 1 })), 'too_large');
    throwsCode(
      () =>
        readCardPng(
          png([], {
            before: Array.from({ length: CARD_LIMITS.pngChunks }, () =>
              chunk('tEXt', Buffer.from('x\0')),
            ),
          }),
        ),
      'too_large',
    );
  });
});
