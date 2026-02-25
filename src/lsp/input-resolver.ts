/**
 * Resolves tool input to a file URI suitable for the LSP.
 *
 * Two modes:
 * - filePath: absolute path to a PHP file on the server. Converts to file:// URI.
 * - code: inline PHP string (from remote clients). Writes to a temp file in the
 *   workspace so Intelephense can analyse it, returns the file:// URI.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

export interface ResolvedInput {
  uri: string;
  filePath: string;
  content: string;
  isVirtual: boolean; // true if we created a temp file from code string
}

export class InputResolver {
  private workspaceRoot: string;
  private virtualDir: string;
  private activeVirtuals = new Set<string>();

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.virtualDir = path.join(workspaceRoot, '.mcp-virtual');
  }

  async resolve(input: { filePath?: string; code?: string }): Promise<ResolvedInput> {
    if (input.filePath) {
      const absPath = path.resolve(input.filePath);
      const rel = path.relative(this.workspaceRoot, absPath);
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        throw new Error('File path must be within the workspace');
      }
      const content = await fs.readFile(absPath, 'utf-8');
      return {
        uri: pathToFileUri(absPath),
        filePath: absPath,
        content,
        isVirtual: false,
      };
    }

    if (input.code) {
      await fs.mkdir(this.virtualDir, { recursive: true });
      const hash = crypto.createHash('md5').update(input.code).digest('hex').slice(0, 8);
      const fileName = `virtual_${hash}.php`;
      const filePath = path.join(this.virtualDir, fileName);

      // Ensure code has PHP opening tag
      let code = input.code;
      if (!code.trimStart().startsWith('<?')) {
        code = '<?php\n' + code;
      }

      await fs.writeFile(filePath, code, 'utf-8');
      this.activeVirtuals.add(filePath);

      return {
        uri: pathToFileUri(filePath),
        filePath,
        content: code,
        isVirtual: true,
      };
    }

    throw new Error('Either filePath or code must be provided');
  }

  async cleanup(filePath: string): Promise<void> {
    if (this.activeVirtuals.has(filePath)) {
      try {
        await fs.unlink(filePath);
      } catch { /* already gone */ }
      this.activeVirtuals.delete(filePath);
    }
  }

  async cleanupAll(): Promise<void> {
    for (const fp of this.activeVirtuals) {
      try { await fs.unlink(fp); } catch { /* ignore */ }
    }
    this.activeVirtuals.clear();
    try { await fs.rmdir(this.virtualDir); } catch { /* ignore */ }
  }
}

export function pathToFileUri(filePath: string): string {
  const normalised = filePath.replace(/\\/g, '/');
  if (normalised.startsWith('/')) {
    return 'file://' + normalised;
  }
  return 'file:///' + normalised;
}

export function fileUriToPath(uri: string): string {
  const stripped = uri.replace(/^file:\/\/\/?/, '');
  return decodeURIComponent(stripped);
}
