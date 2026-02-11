/**
 * IntelephenseBridge - Manages an Intelephense LSP child process via stdio.
 *
 * Provides typed methods for LSP operations: diagnostics, hover, completion, definition.
 * Handles initialization, document synchronization, and graceful shutdown.
 */

import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { DiagnosticsWaiter, Diagnostic } from './diagnostics-waiter.js';
import { InputResolver, ResolvedInput, fileUriToPath } from './input-resolver.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// LSP message types (subset we need)
interface LspMessage {
  jsonrpc: '2.0';
  id?: number;
  method?: string;
  params?: any;
  result?: any;
  error?: { code: number; message: string; data?: any };
}

interface Position {
  line: number;
  character: number;
}

interface Location {
  uri: string;
  range: { start: Position; end: Position };
}

interface CompletionItem {
  label: string;
  kind?: number;
  detail?: string;
  documentation?: string | { kind: string; value: string };
  insertText?: string;
}

interface HoverResult {
  contents: string | { kind: string; value: string } | Array<string | { language: string; value: string }>;
  range?: { start: Position; end: Position };
}

// Completion item kinds (LSP spec)
const COMPLETION_KIND_NAMES: Record<number, string> = {
  1: 'Text', 2: 'Method', 3: 'Function', 4: 'Constructor', 5: 'Field',
  6: 'Variable', 7: 'Class', 8: 'Interface', 9: 'Module', 10: 'Property',
  11: 'Unit', 12: 'Value', 13: 'Enum', 14: 'Keyword', 15: 'Snippet',
  16: 'Color', 17: 'File', 18: 'Reference', 19: 'Folder', 20: 'EnumMember',
  21: 'Constant', 22: 'Struct', 23: 'Event', 24: 'Operator', 25: 'TypeParameter',
};

export class IntelephenseBridge {
  private process: ChildProcess | null = null;
  private requestId = 0;
  private pendingRequests = new Map<number, { resolve: (value: any) => void; reject: (error: any) => void }>();
  private buffer = '';
  private contentLength = -1;
  private initialized = false;
  private initializing = false;
  private restartCount = 0;
  private lastRestartTime = 0;
  private readonly MAX_RESTARTS = 3;
  private readonly RESTART_COOLDOWN_MS = 5000;
  private readonly RESTART_WINDOW_MS = 60000;

  private workspaceRoot: string;
  private storagePath: string;
  private diagnosticsWaiter: DiagnosticsWaiter;
  private inputResolver: InputResolver;
  private openDocuments = new Set<string>();
  private documentVersions = new Map<string, number>();

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.storagePath = path.join(workspaceRoot, '.intelephense-storage');
    this.diagnosticsWaiter = new DiagnosticsWaiter(5000);
    this.inputResolver = new InputResolver(workspaceRoot);
  }

  async start(): Promise<void> {
    if (this.initialized || this.initializing) return;
    this.initializing = true;

    try {
      await fs.mkdir(this.storagePath, { recursive: true });

      // Find intelephense binary
      const intelephenseBin = path.join(__dirname, '..', '..', 'node_modules', '.bin', 'intelephense');

      this.process = spawn('node', [intelephenseBin, '--stdio'], {
        cwd: this.workspaceRoot,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, NODE_ENV: 'production' },
      });

      this.process.stdout!.on('data', (data: Buffer) => this.handleData(data));
      this.process.stderr!.on('data', (data: Buffer) => {
        console.error('[intelephense stderr]', data.toString());
      });
      this.process.on('exit', (code) => {
        console.log(`[intelephense] exited with code ${code}`);
        this.initialized = false;
        this.initializing = false;
        this.process = null;
        // Auto-restart on non-zero exit (crash)
        if (code !== 0 && code !== null) {
          this.attemptRestart();
        }
      });

      // LSP Initialize
      const initResult = await this.sendRequest('initialize', {
        processId: process.pid,
        rootUri: pathToFileUri(this.workspaceRoot),
        rootPath: this.workspaceRoot,
        capabilities: {
          textDocument: {
            synchronization: { dynamicRegistration: false, willSave: false, didSave: true, willSaveWaitUntil: false },
            completion: { completionItem: { snippetSupport: false, documentationFormat: ['markdown', 'plaintext'] } },
            hover: { contentFormat: ['markdown', 'plaintext'] },
            definition: { dynamicRegistration: false },
            publishDiagnostics: { relatedInformation: true },
          },
          workspace: {
            workspaceFolders: true,
          },
        },
        workspaceFolders: [
          { uri: pathToFileUri(this.workspaceRoot), name: 'joomla6' }
        ],
        initializationOptions: {
          storagePath: this.storagePath,
          clearCache: false,
        },
      });

      // Send initialized notification
      this.sendNotification('initialized', {});

      this.initialized = true;
      this.initializing = false;
      console.log('[intelephense] initialized, capabilities:', JSON.stringify(initResult?.capabilities?.completionProvider ? 'completion' : 'none'));
    } catch (e) {
      this.initializing = false;
      throw e;
    }
  }

  async stop(): Promise<void> {
    if (!this.process) return;

    // Close all open documents
    for (const uri of this.openDocuments) {
      try {
        this.sendNotification('textDocument/didClose', { textDocument: { uri } });
      } catch { /* ignore */ }
    }
    this.openDocuments.clear();

    // Clean up virtual files
    await this.inputResolver.cleanupAll();
    this.diagnosticsWaiter.clearAll();

    // LSP shutdown sequence
    try {
      await this.sendRequest('shutdown', null);
      this.sendNotification('exit', null);
    } catch { /* ignore */ }

    // Force kill after 2s
    setTimeout(() => {
      if (this.process) {
        this.process.kill('SIGKILL');
        this.process = null;
      }
    }, 2000);
  }

  isReady(): boolean {
    return this.initialized && this.process !== null;
  }

  getStatus(): { ready: boolean; pid: number | null; restarts: number } {
    return {
      ready: this.isReady(),
      pid: this.process?.pid ?? null,
      restarts: this.restartCount,
    };
  }

  private async attemptRestart(): Promise<void> {
    const now = Date.now();

    // Reset counter if outside the window
    if (now - this.lastRestartTime > this.RESTART_WINDOW_MS) {
      this.restartCount = 0;
    }

    if (this.restartCount >= this.MAX_RESTARTS) {
      console.error(`[intelephense] max restarts (${this.MAX_RESTARTS}) reached within ${this.RESTART_WINDOW_MS / 1000}s window. Giving up.`);
      return;
    }

    this.restartCount++;
    this.lastRestartTime = now;

    console.log(`[intelephense] attempting restart ${this.restartCount}/${this.MAX_RESTARTS} in ${this.RESTART_COOLDOWN_MS / 1000}s...`);

    await new Promise(resolve => setTimeout(resolve, this.RESTART_COOLDOWN_MS));

    try {
      await this.start();
      console.log('[intelephense] restart successful');
    } catch (e) {
      console.error('[intelephense] restart failed:', e);
    }
  }

  // --- Public LSP Operations ---

  async getDiagnostics(input: { filePath?: string; code?: string }): Promise<{ uri: string; diagnostics: Diagnostic[]; resolved: ResolvedInput }> {
    this.ensureReady();
    const resolved = await this.inputResolver.resolve(input);
    await this.openDocument(resolved);

    // Wait for diagnostics to arrive
    const diagnostics = await this.diagnosticsWaiter.waitForDiagnostics(resolved.uri);

    // Clean up virtual files
    if (resolved.isVirtual) {
      await this.closeDocument(resolved.uri);
      await this.inputResolver.cleanup(resolved.filePath);
    }

    return { uri: resolved.uri, diagnostics, resolved };
  }

  async getHover(input: { filePath?: string; code?: string }, line: number, character: number): Promise<{ contents: string; range?: any } | null> {
    this.ensureReady();
    const resolved = await this.inputResolver.resolve(input);
    await this.openDocument(resolved);

    const result: HoverResult | null = await this.sendRequest('textDocument/hover', {
      textDocument: { uri: resolved.uri },
      position: { line, character },
    });

    if (resolved.isVirtual) {
      await this.closeDocument(resolved.uri);
      await this.inputResolver.cleanup(resolved.filePath);
    }

    if (!result) return null;

    return {
      contents: formatHoverContents(result.contents),
      range: result.range,
    };
  }

  async getDefinition(input: { filePath?: string; code?: string }, line: number, character: number): Promise<{ locations: Array<{ uri: string; path: string; range: any; preview?: string }> }> {
    this.ensureReady();
    const resolved = await this.inputResolver.resolve(input);
    await this.openDocument(resolved);

    const result: Location | Location[] | null = await this.sendRequest('textDocument/definition', {
      textDocument: { uri: resolved.uri },
      position: { line, character },
    });

    if (resolved.isVirtual) {
      await this.closeDocument(resolved.uri);
      await this.inputResolver.cleanup(resolved.filePath);
    }

    if (!result) return { locations: [] };

    const locations = Array.isArray(result) ? result : [result];
    const formatted = await Promise.all(locations.map(async (loc) => {
      const filePath = fileUriToPath(loc.uri);
      let preview: string | undefined;
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n');
        const startLine = Math.max(0, loc.range.start.line - 2);
        const endLine = Math.min(lines.length, loc.range.end.line + 3);
        preview = lines.slice(startLine, endLine).join('\n');
      } catch { /* file not readable */ }

      return {
        uri: loc.uri,
        path: filePath,
        range: loc.range,
        preview,
      };
    }));

    return { locations: formatted };
  }

  async getCompletion(input: { filePath?: string; code?: string }, line: number, character: number): Promise<{ items: Array<{ label: string; kind: string; detail?: string; documentation?: string }> }> {
    this.ensureReady();
    const resolved = await this.inputResolver.resolve(input);
    await this.openDocument(resolved);

    const result: { items?: CompletionItem[] } | CompletionItem[] | null = await this.sendRequest('textDocument/completion', {
      textDocument: { uri: resolved.uri },
      position: { line, character },
    });

    if (resolved.isVirtual) {
      await this.closeDocument(resolved.uri);
      await this.inputResolver.cleanup(resolved.filePath);
    }

    if (!result) return { items: [] };

    const items = Array.isArray(result) ? result : (result.items ?? []);
    return {
      items: items.slice(0, 50).map(item => ({
        label: item.label,
        kind: COMPLETION_KIND_NAMES[item.kind ?? 1] ?? 'Unknown',
        detail: item.detail,
        documentation: typeof item.documentation === 'string'
          ? item.documentation
          : item.documentation?.value,
      })),
    };
  }

  // --- Document Management ---

  private async openDocument(resolved: ResolvedInput): Promise<void> {
    if (this.openDocuments.has(resolved.uri)) {
      // Already open, send didChange
      const version = (this.documentVersions.get(resolved.uri) ?? 0) + 1;
      this.documentVersions.set(resolved.uri, version);
      this.sendNotification('textDocument/didChange', {
        textDocument: { uri: resolved.uri, version },
        contentChanges: [{ text: resolved.content }],
      });
    } else {
      const version = 1;
      this.documentVersions.set(resolved.uri, version);
      this.sendNotification('textDocument/didOpen', {
        textDocument: {
          uri: resolved.uri,
          languageId: 'php',
          version,
          text: resolved.content,
        },
      });
      this.openDocuments.add(resolved.uri);
    }
  }

  private async closeDocument(uri: string): Promise<void> {
    if (this.openDocuments.has(uri)) {
      this.sendNotification('textDocument/didClose', { textDocument: { uri } });
      this.openDocuments.delete(uri);
      this.documentVersions.delete(uri);
      this.diagnosticsWaiter.clear(uri);
    }
  }

  // --- LSP Protocol ---

  private sendRequest(method: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = ++this.requestId;
      this.pendingRequests.set(id, { resolve, reject });

      const msg: LspMessage = { jsonrpc: '2.0', id, method, params };
      this.writeMessage(msg);

      // Timeout after 30s
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`LSP request ${method} timed out`));
        }
      }, 30000);
    });
  }

  private sendNotification(method: string, params: any): void {
    const msg: LspMessage = { jsonrpc: '2.0', method, params };
    this.writeMessage(msg);
  }

  private writeMessage(msg: LspMessage): void {
    if (!this.process?.stdin?.writable) {
      throw new Error('Intelephense process not available');
    }
    const body = JSON.stringify(msg);
    const header = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n`;
    this.process.stdin.write(header + body);
  }

  private handleData(data: Buffer): void {
    this.buffer += data.toString();

    while (true) {
      if (this.contentLength === -1) {
        const headerEnd = this.buffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) break;

        const header = this.buffer.substring(0, headerEnd);
        const match = header.match(/Content-Length:\s*(\d+)/i);
        if (!match) {
          this.buffer = this.buffer.substring(headerEnd + 4);
          continue;
        }
        this.contentLength = parseInt(match[1], 10);
        this.buffer = this.buffer.substring(headerEnd + 4);
      }

      if (this.buffer.length < this.contentLength) break;

      const body = this.buffer.substring(0, this.contentLength);
      this.buffer = this.buffer.substring(this.contentLength);
      this.contentLength = -1;

      try {
        const msg: LspMessage = JSON.parse(body);
        this.handleMessage(msg);
      } catch (e) {
        console.error('[intelephense] failed to parse message:', e);
      }
    }
  }

  private handleMessage(msg: LspMessage): void {
    // Response to a request
    if (msg.id !== undefined && (msg.result !== undefined || msg.error !== undefined)) {
      const pending = this.pendingRequests.get(msg.id);
      if (pending) {
        this.pendingRequests.delete(msg.id);
        if (msg.error) {
          pending.reject(new Error(`LSP error: ${msg.error.message} (${msg.error.code})`));
        } else {
          pending.resolve(msg.result);
        }
      }
      return;
    }

    // Notification from server
    if (msg.method === 'textDocument/publishDiagnostics') {
      const { uri, diagnostics } = msg.params;
      this.diagnosticsWaiter.onDiagnosticsReceived(uri, diagnostics);
      return;
    }

    // Log other notifications for debugging
    if (msg.method) {
      // Silently handle window/logMessage, telemetry, etc.
      if (msg.method === 'window/logMessage') {
        console.log('[intelephense]', msg.params?.message);
      }
    }
  }

  private ensureReady(): void {
    if (!this.initialized) {
      throw new Error('Intelephense not initialized. The server is still starting up - try again shortly.');
    }
  }
}

// --- Helpers ---

function pathToFileUri(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  if (normalized.startsWith('/')) {
    return 'file://' + normalized;
  }
  return 'file:///' + normalized;
}

function formatHoverContents(contents: HoverResult['contents']): string {
  if (typeof contents === 'string') return contents;
  if ('kind' in contents && 'value' in contents) return contents.value;
  if (Array.isArray(contents)) {
    return contents.map(c => {
      if (typeof c === 'string') return c;
      return c.value;
    }).join('\n\n');
  }
  return String(contents);
}
