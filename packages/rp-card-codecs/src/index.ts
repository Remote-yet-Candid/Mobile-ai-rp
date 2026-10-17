/** Data-only codecs. No filesystem, network, image decompression, macros or script execution. */
export type CardSupportLevel =
  'read' | 'render' | 'prompt-compatible' | 'behavior-compatible' | 'round-trip';
export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type CharacterCard = {
  spec: 'chara_card_v2' | 'chara_card_v3';
  spec_version: string;
  data: { [key: string]: JsonValue } & { name: string };
  [key: string]: JsonValue;
};
export const CARD_LIMITS = Object.freeze({
  fileBytes: 32 * 1024 * 1024,
  jsonBytes: 8 * 1024 * 1024,
  jsonDepth: 64,
  jsonNodes: 50000,
  pngChunks: 8192,
  imagePixels: 16 * 1024 * 1024,
});
export type CardErrorCode =
  | 'too_large'
  | 'invalid_json'
  | 'invalid_card'
  | 'invalid_preset'
  | 'unsupported_document'
  | 'unsupported_spec'
  | 'invalid_png'
  | 'missing_card'
  | 'unsupported_compression';
export type ImportLimit = Readonly<{
  kind: 'fileBytes' | 'jsonBytes' | 'jsonDepth' | 'jsonNodes' | 'pngChunks' | 'imagePixels';
  maximum: number;
  actual?: number;
}>;
export class CardImportError extends Error {
  constructor(
    readonly code: CardErrorCode,
    readonly limit?: ImportLimit,
  ) {
    super(`Card import failed: ${code}`);
    this.name = 'CardImportError';
  }
}
export type CardImportResult = Readonly<{
  document: CharacterCard;
  source: 'json' | 'png';
  metadataKeyword?: 'ccv3' | 'chara';
  warnings: readonly string[];
}>;
export type FileInspection =
  | Readonly<{ kind: 'character_card'; byteLength: number; card: CardImportResult }>
  | Readonly<{
      kind: 'prompt_preset';
      byteLength: number;
      document: Record<string, JsonValue>;
      summary: Readonly<{
        promptCount: number;
        orderGroupCount: number;
        orderEntryCount: number;
        enabledOrderEntryCount: number;
        extensionKeyCount: number;
      }>;
    }>;
const utf8 = new TextDecoder('utf-8', { fatal: true });
const encoder = new TextEncoder();
/** Bound nesting before JSON.parse, including on native engines with smaller parser stacks. */
function checkJsonNesting(text: string): void {
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (const character of text) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') quoted = true;
    else if (character === '{' || character === '[') {
      if (++depth > CARD_LIMITS.jsonDepth) tooLarge('jsonDepth', depth);
    } else if (character === '}' || character === ']') depth--;
  }
}
function fail(code: CardErrorCode): never {
  throw new CardImportError(code);
}
function tooLarge(kind: ImportLimit['kind'], actual?: number): never {
  throw new CardImportError('too_large', {
    kind,
    maximum: CARD_LIMITS[kind],
    ...(actual === undefined ? {} : { actual }),
  });
}
function object(value: unknown): value is Record<string, JsonValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateJsonTree(value: unknown): void {
  const pending: { value: unknown; depth: number }[] = [{ value, depth: 0 }];
  let nodes = 0;
  while (pending.length) {
    const item = pending.pop();
    if (!item) break;
    if (++nodes > CARD_LIMITS.jsonNodes) tooLarge('jsonNodes', nodes);
    if (item.depth > CARD_LIMITS.jsonDepth) tooLarge('jsonDepth', item.depth);
    if (
      typeof item.value === 'number' &&
      (!Number.isFinite(item.value) ||
        (Number.isInteger(item.value) && !Number.isSafeInteger(item.value)))
    )
      fail('invalid_json');
    if (['undefined', 'function', 'bigint', 'symbol'].includes(typeof item.value))
      fail('invalid_json');
    if (typeof item.value === 'object' && item.value !== null) {
      const children = Object.values(item.value);
      if (nodes + pending.length + children.length > CARD_LIMITS.jsonNodes)
        tooLarge('jsonNodes', nodes + pending.length + children.length);
      for (const child of children) pending.push({ value: child, depth: item.depth + 1 });
    }
  }
}

function parseJson(input: string | Uint8Array): unknown {
  if (input.length > CARD_LIMITS.jsonBytes)
    tooLarge('jsonBytes', typeof input === 'string' ? undefined : input.byteLength);
  let text: string;
  try {
    text = typeof input === 'string' ? input : utf8.decode(input);
  } catch {
    return fail('invalid_json');
  }
  const byteLength = typeof input === 'string' ? encoder.encode(text).byteLength : input.byteLength;
  if (byteLength > CARD_LIMITS.jsonBytes) tooLarge('jsonBytes', byteLength);
  checkJsonNesting(text);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return fail('invalid_json');
  }
  validateJsonTree(value);
  return value;
}

export function readCardJson(input: string | Uint8Array): CardImportResult {
  return readCardValue(parseJson(input));
}

function readCardValue(value: unknown): CardImportResult {
  if (!object(value) || !object(value.data)) fail('invalid_card');
  if (value.spec !== 'chara_card_v2' && value.spec !== 'chara_card_v3') fail('unsupported_spec');
  const major = value.spec === 'chara_card_v3' ? 3 : 2;
  if (
    typeof value.spec_version !== 'string' ||
    !/^\d+\.\d+$/.test(value.spec_version) ||
    Number(value.spec_version) < major ||
    Number(value.spec_version) >= major + 1
  )
    fail('unsupported_spec');
  const data = value.data;
  const strings = [
    'name',
    'description',
    'personality',
    'scenario',
    'first_mes',
    'mes_example',
    'creator_notes',
    'system_prompt',
    'post_history_instructions',
    'creator',
    'character_version',
  ];
  if (strings.some((key) => typeof data[key] !== 'string') || !object(data.extensions))
    fail('invalid_card');
  for (const key of [
    'tags',
    'alternate_greetings',
    ...(major === 3 ? ['group_only_greetings'] : []),
  ]) {
    const field = data[key];
    if (!Array.isArray(field) || field.some((part) => typeof part !== 'string'))
      fail('invalid_card');
  }
  return {
    // Keep the entire parsed object; never merge untrusted fields into application config.
    document: value as CharacterCard,
    source: 'json',
    warnings:
      Number(value.spec_version) > major ? ['newer_spec_fields_preserved_behavior_unverified'] : [],
  };
}

/** Identify data, never apply preset parameters, prompts, macros, regexes or extensions. */
export function inspectImportFile(bytes: Uint8Array): FileInspection {
  if (bytes.byteLength > CARD_LIMITS.fileBytes) tooLarge('fileBytes', bytes.byteLength);
  if (bytes[0] === 137 && bytes[1] === 80)
    return { kind: 'character_card', byteLength: bytes.byteLength, card: readCardPng(bytes) };
  const value = parseJson(bytes);
  if (object(value) && Object.hasOwn(value, 'spec'))
    return { kind: 'character_card', byteLength: bytes.byteLength, card: readCardValue(value) };
  if (object(value) && (Object.hasOwn(value, 'prompts') || Object.hasOwn(value, 'prompt_order'))) {
    const { prompts, prompt_order: groups } = value;
    if (!Array.isArray(prompts) || !Array.isArray(groups)) fail('invalid_preset');
    for (const prompt of prompts) {
      if (
        !object(prompt) ||
        typeof prompt.identifier !== 'string' ||
        !prompt.identifier ||
        (prompt.content !== undefined && typeof prompt.content !== 'string')
      )
        fail('invalid_preset');
    }
    let orderEntryCount = 0;
    let enabledOrderEntryCount = 0;
    for (const group of groups) {
      if (!object(group) || !Array.isArray(group.order)) fail('invalid_preset');
      for (const entry of group.order) {
        if (
          !object(entry) ||
          typeof entry.identifier !== 'string' ||
          !entry.identifier ||
          typeof entry.enabled !== 'boolean'
        )
          fail('invalid_preset');
        orderEntryCount++;
        if (entry.enabled) enabledOrderEntryCount++;
      }
    }
    return {
      kind: 'prompt_preset',
      byteLength: bytes.byteLength,
      document: value,
      summary: {
        promptCount: prompts.length,
        orderGroupCount: groups.length,
        orderEntryCount,
        enabledOrderEntryCount,
        extensionKeyCount: object(value.extensions) ? Object.keys(value.extensions).length : 0,
      },
    };
  }
  return fail('unsupported_document');
}

export function writeCardJson(document: CharacterCard): string {
  validateJsonTree(document);
  const text = JSON.stringify(document, null, 2);
  readCardJson(text);
  return text;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, byte) => {
  let crc = byte;
  for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function base64(bytes: Uint8Array): Uint8Array {
  if (bytes.byteLength > Math.ceil(CARD_LIMITS.jsonBytes / 3) * 4)
    tooLarge('jsonBytes', Math.floor(bytes.byteLength / 4) * 3);
  if (bytes.byteLength % 4 !== 0) fail('invalid_card');
  const padding =
    bytes[bytes.byteLength - 1] === 61 ? (bytes[bytes.byteLength - 2] === 61 ? 2 : 1) : 0;
  const length = (bytes.byteLength / 4) * 3 - padding;
  if (length > CARD_LIMITS.jsonBytes) tooLarge('jsonBytes', length);
  const result = new Uint8Array(length);
  let output = 0;
  for (let index = 0; index < bytes.byteLength; index += 4) {
    const last = index + 4 === bytes.byteLength;
    const paddedC = last && padding === 2;
    const paddedD = last && padding > 0;
    const a = base64Value(bytes[index]);
    const b = base64Value(bytes[index + 1]);
    const c = paddedC ? 0 : base64Value(bytes[index + 2]);
    const d = paddedD ? 0 : base64Value(bytes[index + 3]);
    if ((paddedC && (b & 15) !== 0) || (paddedD && (c & 3) !== 0)) fail('invalid_card');
    result[output++] = (a << 2) | (b >>> 4);
    if (output < length) result[output++] = (b << 4) | (c >>> 2);
    if (output < length) result[output++] = (c << 6) | d;
  }
  return result;
}

/** Decode directly from bytes; avoid a second multi-MiB base64 string and regex stack. */
function base64Value(byte: number | undefined): number {
  if (byte === undefined) return fail('invalid_card');
  if (byte >= 65 && byte <= 90) return byte - 65;
  if (byte >= 97 && byte <= 122) return byte - 71;
  if (byte >= 48 && byte <= 57) return byte + 4;
  if (byte === 43) return 62;
  if (byte === 47) return 63;
  return fail('invalid_card');
}

/** Validate PNG container/CRC and tEXt metadata, without decoding/rendering image pixels. */
export function readCardPng(bytes: Uint8Array): CardImportResult {
  if (bytes.byteLength > CARD_LIMITS.fileBytes) tooLarge('fileBytes', bytes.byteLength);
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((byte, index) => bytes[index] === byte)) fail('invalid_png');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries = new Map<string, Uint8Array>();
  let offset = 8;
  let chunks = 0;
  let imageData = false;
  let ended = false;
  while (offset < bytes.byteLength) {
    if (++chunks > CARD_LIMITS.pngChunks) tooLarge('pngChunks', chunks);
    if (offset + 12 > bytes.byteLength) fail('invalid_png');
    const size = view.getUint32(offset);
    if (size > bytes.byteLength - offset - 12) fail('invalid_png');
    const typeBytes = bytes.subarray(offset + 4, offset + 8);
    const type = String.fromCharCode(...typeBytes);
    if (
      !/^[A-Za-z]{4}$/.test(type) ||
      crc32(bytes.subarray(offset + 4, offset + 8 + size)) !== view.getUint32(offset + 8 + size)
    )
      fail('invalid_png');
    const data = bytes.subarray(offset + 8, offset + 8 + size);
    if (chunks === 1 && type !== 'IHDR') fail('invalid_png');
    if (type === 'IHDR') {
      if (chunks !== 1 || size !== 13) fail('invalid_png');
      const width = view.getUint32(offset + 8);
      const height = view.getUint32(offset + 12);
      if (width === 0 || height === 0) fail('invalid_png');
      if (width * height > CARD_LIMITS.imagePixels) tooLarge('imagePixels', width * height);
    }
    if (type === 'IDAT') imageData = true;
    if (type === 'tEXt' || type === 'zTXt' || type === 'iTXt') {
      const separator = data.indexOf(0);
      if (separator < 1 || separator > 79) fail('invalid_png');
      const keyword = String.fromCharCode(...data.subarray(0, separator));
      if (keyword === 'ccv3' || keyword === 'chara') {
        if (type !== 'tEXt') fail('unsupported_compression');
        if (entries.has(keyword)) fail('invalid_png');
        entries.set(keyword, data.subarray(separator + 1));
      }
    }
    offset += size + 12;
    if (type === 'IEND') {
      if (size !== 0 || !imageData || offset !== bytes.byteLength) fail('invalid_png');
      ended = true;
      break;
    }
  }
  if (!ended) fail('invalid_png');
  const keyword = entries.has('ccv3') ? 'ccv3' : entries.has('chara') ? 'chara' : undefined;
  if (!keyword) fail('missing_card');
  const metadata = entries.get(keyword);
  if (!metadata) fail('missing_card');
  const result = readCardJson(base64(metadata));
  if (keyword === 'ccv3' && result.document.spec !== 'chara_card_v3') fail('invalid_card');
  return {
    ...result,
    source: 'png',
    metadataKeyword: keyword,
    warnings: [
      ...result.warnings,
      ...(entries.has('ccv3') && entries.has('chara') ? ['v3_preferred_over_v2_metadata'] : []),
    ],
  };
}
