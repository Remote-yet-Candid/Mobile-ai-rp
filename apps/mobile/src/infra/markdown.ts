export type MarkdownBlock = { code: boolean; text: string };
/** Bounded native preview. Source text remains complete in SQLite and RP context. */
export function markdownBlocks(source: string): { blocks: MarkdownBlock[]; shortened: boolean } {
  const preview = source.slice(0, 32768);
  const lines = preview.split('\n');
  const shortened = preview.length < source.length || lines.length > 500;
  const blocks: MarkdownBlock[] = [];
  let code = false;
  let buffer: string[] = [];
  const flush = () => {
    if (buffer.length) blocks.push({ code, text: buffer.join('\n') });
    buffer = [];
  };
  for (const line of lines.slice(0, 500)) {
    if (line.startsWith('```')) {
      flush();
      code = !code;
    } else buffer.push(line);
  }
  flush();
  return { blocks, shortened };
}
