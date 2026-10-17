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
  fileBytes: 8 * 1024 * 1024,
  jsonBytes: 1024 * 1024,
  jsonDepth: 64,
  jsonNodes: 50000,
  pngChunks: 8192,
  imagePixels: 16 * 1024 * 1024,
});
export type CardErrorCode =
  | 'too_large'
  | 'invalid_json'
  | 'invalid_card'
  | 'unsupported_spec'
  | 'invalid_png'
  | 'missing_card'
  | 'unsupported_compression';
export class CardImportError extends Error {
  constructor(readonly code: CardErrorCode) {
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
      if (++depth > CARD_LIMITS.jsonDepth) fail('too_large');
    } else if (character === '}' || character === ']') depth--;
  }
}
function fail(code: CardErrorCode): never {
  throw new CardImportError(code);
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
    if (++nodes > CARD_LIMITS.jsonNodes || item.depth > CARD_LIMITS.jsonDepth) fail('too_large');
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
      if (nodes + pending.length + children.length > CARD_LIMITS.jsonNodes) fail('too_large');
      for (const child of children) pending.push({ value: child, depth: item.depth + 1 });
    }
  }
}

export function readCardJson(input: string | Uint8Array): CardImportResult {
  if (input.length > CARD_LIMITS.jsonBytes) fail('too_large');
  let text: string;
  try {
    text = typeof input === 'string' ? input : utf8.decode(input);
  } catch {
    return fail('invalid_json');
  }
  if (encoder.encode(text).byteLength > CARD_LIMITS.jsonBytes) fail('too_large');
  checkJsonNesting(text);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return fail('invalid_json');
  }
  validateJsonTree(value);
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
  if (bytes.byteLength > Math.ceil(CARD_LIMITS.jsonBytes / 3) * 4) fail('too_large');
  let text = '';
  for (const byte of bytes) {
    if (byte > 127) fail('invalid_card');
    text += String.fromCharCode(byte);
  }
  if (text.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) fail('invalid_card');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const length = (text.length / 4) * 3 - (text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0);
  if (length > CARD_LIMITS.jsonBytes) fail('too_large');
  const result = new Uint8Array(length);
  let output = 0;
  for (let index = 0; index < text.length; index += 4) {
    const a = alphabet.indexOf(text[index] ?? '');
    const b = alphabet.indexOf(text[index + 1] ?? '');
    const c = text[index + 2] === '=' ? 0 : alphabet.indexOf(text[index + 2] ?? '');
    const d = text[index + 3] === '=' ? 0 : alphabet.indexOf(text[index + 3] ?? '');
    if ((text[index + 2] === '=' && (b & 15) !== 0) || (text[index + 3] === '=' && (c & 3) !== 0))
      fail('invalid_card');
    result[output++] = (a << 2) | (b >>> 4);
    if (output < length) result[output++] = (b << 4) | (c >>> 2);
    if (output < length) result[output++] = (c << 6) | d;
  }
  return result;
}

/** Validate PNG container/CRC and tEXt metadata, without decoding/rendering image pixels. */
export function readCardPng(bytes: Uint8Array): CardImportResult {
  if (bytes.byteLength > CARD_LIMITS.fileBytes) fail('too_large');
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((byte, index) => bytes[index] === byte)) fail('invalid_png');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries = new Map<string, Uint8Array>();
  let offset = 8;
  let chunks = 0;
  let imageData = false;
  let ended = false;
  while (offset < bytes.byteLength) {
    if (++chunks > CARD_LIMITS.pngChunks) fail('too_large');
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
      if (width * height > CARD_LIMITS.imagePixels) fail('too_large');
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
