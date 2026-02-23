import { IntelephenseBridge } from '../lsp/index.js';
import type { Diagnostic } from '../lsp/index.js';
import { sanitisePath } from './response-utils.js';

const SEVERITY_NAMES: Record<number, string> = {
  1: 'Error',
  2: 'Warning',
  3: 'Information',
  4: 'Hint',
};

export async function runDiagnostics(
  bridge: IntelephenseBridge,
  input: { filePath?: string; code?: string }
): Promise<string> {
  const { diagnostics, resolved } = await bridge.getDiagnostics(input);

  if (diagnostics.length === 0) {
    return `No issues found in ${resolved.isVirtual ? 'provided code' : sanitisePath(resolved.filePath)}`;
  }

  const lines: string[] = [];
  lines.push(`## Diagnostics: ${resolved.isVirtual ? 'inline code' : sanitisePath(resolved.filePath)}`);
  lines.push(`Found ${diagnostics.length} issue(s)`);
  lines.push('');

  // Group by severity
  const grouped = new Map<number, Diagnostic[]>();
  for (const d of diagnostics) {
    const sev = d.severity ?? 1;
    if (!grouped.has(sev)) grouped.set(sev, []);
    grouped.get(sev)!.push(d);
  }

  for (const [severity, diags] of [...grouped.entries()].sort((a, b) => a[0] - b[0])) {
    lines.push(`### ${SEVERITY_NAMES[severity] ?? 'Unknown'} (${diags.length})`);
    lines.push('');
    for (const d of diags) {
      const loc = `L${d.range.start.line + 1}:${d.range.start.character + 1}`;
      const source = d.source ? ` [${d.source}]` : '';
      const code = d.code ? ` (${d.code})` : '';
      lines.push(`- **${loc}**${source}${code}: ${d.message}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
