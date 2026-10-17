import {
  CardImportError,
  type CardErrorCode,
  type FileInspection,
} from '@mobile-ai-rp/rp-card-codecs';

function bytes(value: number): string {
  return value >= 1024 * 1024
    ? `${(value / (1024 * 1024)).toFixed(2)} MiB`
    : `${(value / 1024).toFixed(1)} KiB`;
}

/** Summaries only: never echo prompt bodies, scripts, paths or native error messages. */
export function describeInspection(result: FileInspection): string {
  const size = `文件 ${bytes(result.byteLength)}`;
  if (result.kind === 'prompt_preset') {
    const summary = result.summary;
    return [
      `识别到 SillyTavern 生成预设 · ${size}`,
      `提示词条目 ${summary.promptCount}；顺序配置 ${summary.orderGroupCount} 组 / ${summary.orderEntryCount} 条（启用 ${summary.enabledOrderEntryCount} 条）；扩展区 ${summary.extensionKeyCount} 项。`,
      '这是一份生成预设，不是 V2/V3 角色卡。只读结构检查通过，未应用到聊天。',
      '未执行提示词、宏、正则或扩展，也未加载外链；完整行为兼容尚未实现。',
    ].join('\n');
  }
  const card = result.card;
  const name = card.document.data.name.replace(/\s+/g, ' ').slice(0, 80);
  return [
    `${name} · ${card.document.spec} · ${card.source} · ${size}`,
    '角色卡基础读取通过；未知字段保留。',
    ...(card.warnings.length ? ['含兼容性提醒：较新规范或双份 PNG 元数据，行为仍待验证。'] : []),
    '仅本次验证，不持久化；Lorebook/宏行为尚未验证。',
  ].join('\n');
}

const errors: Record<CardErrorCode, string> = {
  too_large: '文件内容超过当前安全读取范围。',
  invalid_json: 'JSON 编码或语法无效，或含无法可靠保留的数字。',
  invalid_card: '角色卡缺少必需字段或字段类型不符合 V2/V3 规范。',
  invalid_preset: '识别到预设字段，但提示词或顺序配置的结构不完整。',
  unsupported_document: '不是当前支持的 V2/V3 角色卡或 SillyTavern 生成预设。',
  unsupported_spec: '角色卡规范版本尚不支持。',
  invalid_png: 'PNG 文件不完整、校验失败或卡片元数据冲突。',
  missing_card: 'PNG 中没有找到 chara / ccv3 角色卡元数据。',
  unsupported_compression: 'PNG 使用了尚不支持的压缩或国际化卡片元数据；可尝试导出 JSON。',
};

export function describeImportError(error: unknown): string {
  if (!(error instanceof CardImportError))
    return '文件读取失败，请重新选择可访问的本地 JSON / PNG 文件。';
  const limit = error.limit;
  if (error.code === 'too_large' && limit) {
    if (limit.kind === 'fileBytes' || limit.kind === 'jsonBytes') {
      const subject = limit.kind === 'fileBytes' ? '文件' : 'JSON 文本（PNG 内嵌 JSON 也适用）';
      return `${subject}超过 ${bytes(limit.maximum)} 上限${limit.actual === undefined ? '' : `，本次 ${bytes(limit.actual)}`}。未截断或导入，原文件保持不变。`;
    }
    const label = {
      jsonDepth: 'JSON 嵌套层数',
      jsonNodes: 'JSON 节点数',
      pngChunks: 'PNG 块数',
      imagePixels: '图片声明像素数',
    }[limit.kind];
    return `${label}超过安全上限 ${limit.maximum}；这不一定是文件字节大小问题。未截断或导入。`;
  }
  return errors[error.code];
}
