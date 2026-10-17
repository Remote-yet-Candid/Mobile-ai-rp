import { memo } from 'react';
import { Text, View } from 'react-native';
import { useTheme } from './ui';
import { markdownBlocks } from '../infra/markdown';

/** Basic native-text Markdown. HTML, links, remote images and scripts are never rendered. */
function Inline({ text }: { text: string }) {
  return (
    <Text>
      {text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g).map((part, index) => {
        if (part.startsWith('`') && part.endsWith('`'))
          return (
            <Text key={index} style={{ fontFamily: 'monospace' }}>
              {part.slice(1, -1)}
            </Text>
          );
        if (part.startsWith('**') && part.endsWith('**'))
          return (
            <Text key={index} style={{ fontWeight: '700' }}>
              {part.slice(2, -2)}
            </Text>
          );
        if (part.startsWith('*') && part.endsWith('*'))
          return (
            <Text key={index} style={{ fontStyle: 'italic' }}>
              {part.slice(1, -1)}
            </Text>
          );
        return part;
      })}
    </Text>
  );
}
export const MessageMarkdown = memo(function MessageMarkdown({ text }: { text: string }) {
  const theme = useTheme();
  const { blocks, shortened } = markdownBlocks(text);
  return (
    <View style={{ gap: 5 }}>
      {blocks.map((block, index) =>
        block.code ? (
          <Text
            selectable
            key={index}
            style={{
              color: theme.text,
              fontFamily: 'monospace',
              fontSize: 13,
              padding: 10,
              backgroundColor: theme.background,
              borderRadius: 8,
            }}
          >
            {block.text}
          </Text>
        ) : (
          block.text.split('\n').map((line, row) => {
            const heading = /^(#{1,3})\s+(.*)$/.exec(line);
            const quote = line.startsWith('> ');
            const body = heading
              ? (heading[2] ?? '')
              : quote
                ? line.slice(2)
                : line.replace(/^[-*]\s+/, '• ');
            return (
              <Text
                selectable
                key={`${index}-${row}`}
                style={{
                  color: theme.text,
                  fontSize: heading ? 21 - (heading[1]?.length ?? 1) : 16,
                  lineHeight: 25,
                  fontWeight: heading ? '700' : '400',
                  ...(quote
                    ? { paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: theme.accent }
                    : {}),
                }}
              >
                <Inline text={body} />
              </Text>
            );
          })
        ),
      )}
      {shortened && (
        <Text style={{ color: theme.muted }}>
          长消息仅预览前 32768 字符 / 500 行，原文完整保存在本机并可参与上下文。
        </Text>
      )}
    </View>
  );
});
