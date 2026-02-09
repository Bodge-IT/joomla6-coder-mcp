import { IntelephenseBridge } from '../lsp/index.js';

export async function runHover(
  bridge: IntelephenseBridge,
  input: { filePath?: string; code?: string },
  line: number,
  character: number
): Promise<string> {
  const result = await bridge.getHover(input, line, character);

  if (!result) {
    return `No hover information at line ${line + 1}, character ${character + 1}`;
  }

  const lines: string[] = [];
  lines.push('## Hover Info');
  lines.push(`**Position:** L${line + 1}:${character + 1}`);
  lines.push('');
  lines.push(result.contents);

  return lines.join('\n');
}
