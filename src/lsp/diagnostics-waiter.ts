/**
 * Handles waiting for async LSP diagnostic notifications.
 * Intelephense publishes diagnostics asynchronously after document changes,
 * so we need a mechanism to wait for them with a timeout.
 */

export interface Diagnostic {
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  severity?: number; // 1=Error, 2=Warning, 3=Info, 4=Hint
  code?: string | number;
  source?: string;
  message: string;
}

type DiagnosticResolver = (diagnostics: Diagnostic[]) => void;

export class DiagnosticsWaiter {
  private waiters = new Map<string, DiagnosticResolver>();
  private diagnosticStore = new Map<string, Diagnostic[]>();
  private defaultTimeoutMs: number;

  constructor(defaultTimeoutMs = 5000) {
    this.defaultTimeoutMs = defaultTimeoutMs;
  }

  /**
   * Called when the LSP server publishes diagnostics for a URI.
   */
  onDiagnosticsReceived(uri: string, diagnostics: Diagnostic[]): void {
    this.diagnosticStore.set(uri, diagnostics);
    const resolver = this.waiters.get(uri);
    if (resolver) {
      this.waiters.delete(uri);
      resolver(diagnostics);
    }
  }

  /**
   * Wait for diagnostics to arrive for a given URI.
   * Returns immediately if diagnostics are already available and fresh.
   */
  waitForDiagnostics(uri: string, timeoutMs?: number): Promise<Diagnostic[]> {
    const timeout = timeoutMs ?? this.defaultTimeoutMs;

    return new Promise<Diagnostic[]>((resolve) => {
      // Set up timeout
      const timer = setTimeout(() => {
        this.waiters.delete(uri);
        // Return whatever we have (may be empty)
        resolve(this.diagnosticStore.get(uri) ?? []);
      }, timeout);

      // Register waiter
      this.waiters.set(uri, (diags) => {
        clearTimeout(timer);
        resolve(diags);
      });
    });
  }

  /**
   * Clear stored diagnostics for a URI (e.g., when closing a document).
   */
  clear(uri: string): void {
    this.diagnosticStore.delete(uri);
    this.waiters.delete(uri);
  }

  clearAll(): void {
    this.diagnosticStore.clear();
    this.waiters.clear();
  }
}
