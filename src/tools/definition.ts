import { IntelephenseBridge } from '../lsp/index.js';
import { sanitisePath } from './response-utils.js';

export async function runDefinition(
  bridge: IntelephenseBridge,
  input: { filePath?: string; code?: string },
  line: number,
  character: number
): Promise<string> {
  const { locations } = await bridge.getDefinition(input, line, character);

  if (locations.length === 0) {
    return `No definition found at line ${line + 1}, character ${character + 1}`;
  }

  const lines: string[] = [];
  lines.push('## Definition');
  lines.push(`**Position:** L${line + 1}:${character + 1}`);
  lines.push('');

  for (const loc of locations) {
    lines.push(`### ${sanitisePath(loc.path)}`);
    lines.push(`**Line ${loc.range.start.line + 1}**`);
    if (loc.preview) {
      lines.push('```php');
      lines.push(loc.preview);
      lines.push('```');
    }
    lines.push('');
  }

  return lines.join('\n');
}
