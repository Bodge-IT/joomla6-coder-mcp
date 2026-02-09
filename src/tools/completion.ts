import { IntelephenseBridge } from '../lsp/index.js';

export async function runCompletion(
  bridge: IntelephenseBridge,
  input: { filePath?: string; code?: string },
  line: number,
  character: number
): Promise<string> {
  const { items } = await bridge.getCompletion(input, line, character);

  if (items.length === 0) {
    return `No completions at line ${line + 1}, character ${character + 1}`;
  }

  const lines: string[] = [];
  lines.push('## Completions');
  lines.push(`**Position:** L${line + 1}:${character + 1}`);
  lines.push(`Showing ${items.length} suggestion(s)`);
  lines.push('');

  for (const item of items) {
    const kindBadge = `\`${item.kind}\``;
    lines.push(`- ${kindBadge} **${item.label}**${item.detail ? ` — ${item.detail}` : ''}`);
    if (item.documentation) {
      // Truncate long docs
      const doc = item.documentation.length > 200
        ? item.documentation.substring(0, 200) + '...'
        : item.documentation;
      lines.push(`  > ${doc}`);
    }
  }

  return lines.join('\n');
}
