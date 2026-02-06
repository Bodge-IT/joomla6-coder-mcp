import { JoomlaIndex } from '../parser/index-builder.js';
import { GitHubSync } from '../sync/github-sync.js';
import { IndexBuilder } from '../parser/index-builder.js';
import { IntelephenseBridge } from '../lsp/index.js';
import { lookupClass, formatClassInfo, formatMethodInfo } from './lookup-class.js';
import { search, formatSearchResults } from './search.js';
import { listEvents, formatEventsResult } from './list-events.js';
import { getServices, formatServicesResult } from './get-services.js';
import { getExtensionStructure, formatExtensionStructure, ExtensionType } from './extension-structure.js';
import { getCodingPatterns, formatCodingPatterns, listPatternCategories, PatternCategory } from './coding-patterns.js';
import { runDiagnostics } from './diagnostics.js';
import { runHover } from './hover.js';
import { runDefinition } from './definition.js';
import { runCompletion } from './completion.js';
import { lookupSchema } from './schema.js';
import { runLint } from './lint.js';
import { runFix } from './fix.js';
import type { SchemaIndex } from '../parser/sql-schema-parser.js';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolContext {
  getIndex: () => JoomlaIndex | null;
  setIndex: (index: JoomlaIndex) => void;
  sync: GitHubSync;
  indexBuilder: IndexBuilder;
  indexPath: string;
  getBridge: () => IntelephenseBridge | null;
  getSchema: () => SchemaIndex | null;
}

type ToolHandler = (args: Record<string, unknown>, ctx: ToolContext) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;

const toolDefinitions: ToolDefinition[] = [];
const toolHandlers = new Map<string, ToolHandler>();

function registerTool(def: ToolDefinition, handler: ToolHandler): void {
  toolDefinitions.push(def);
  toolHandlers.set(def.name, handler);
}

// --- joomla_sync ---
registerTool(
  {
    name: 'joomla_sync',
    description: 'Sync Joomla 6 libraries from GitHub. Run this first to build the index. Use force=true to re-sync even if cache exists.',
    inputSchema: {
      type: 'object',
      properties: {
        force: { type: 'boolean', description: 'Force re-sync even if cache exists' }
      }
    }
  },
  async (_args, ctx) => {
    const r = await ctx.sync.sync();
    if (r.success) {
      const idx = await ctx.indexBuilder.buildIndex(ctx.sync.getLibrariesPath(), r.lastCommit);
      await ctx.indexBuilder.saveIndex(idx, ctx.indexPath);
      ctx.setIndex(idx);
      return { content: [{ type: 'text', text: r.message }] };
    }
    return { content: [{ type: 'text', text: r.message }], isError: true };
  }
);

// --- joomla_lookup_class ---
registerTool(
  {
    name: 'joomla_lookup_class',
    description: 'Look up a Joomla 6 class, interface, or trait by name. Returns full details including methods, properties, constants, and docblocks. Supports FQN, class name, or partial match.',
    inputSchema: {
      type: 'object',
      properties: {
        className: { type: 'string', description: 'Class name, FQN, or partial match' },
        methodName: { type: 'string', description: 'Optional: specific method to look up' }
      },
      required: ['className']
    }
  },
  async (args, ctx) => {
    const index = ctx.getIndex();
    if (!index) return { content: [{ type: 'text', text: 'Index not built. Run joomla_sync first.' }], isError: true };
    const r = lookupClass(index, args as any);
    if (r.found && r.method && r.class) {
      return { content: [{ type: 'text', text: formatMethodInfo(r.method, r.class.fqn) }] };
    }
    if (r.found && r.class) {
      return { content: [{ type: 'text', text: formatClassInfo(r.class) }] };
    }
    let text = r.message;
    if (r.suggestions && r.suggestions.length > 0) {
      text += '\n\nSuggestions:\n' + r.suggestions.map(s => `- ${s}`).join('\n');
    }
    return { content: [{ type: 'text', text }] };
  }
);

// --- joomla_search ---
registerTool(
  {
    name: 'joomla_search',
    description: 'Search the Joomla 6 API index for classes, methods, constants, and properties. Supports filtering by type.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search term' },
        type: { type: 'string', enum: ['class', 'method', 'constant', 'property', 'all'], description: 'Filter by type (default: all)' },
        limit: { type: 'number', description: 'Max results (default: 20)' }
      },
      required: ['query']
    }
  },
  async (args, ctx) => {
    const index = ctx.getIndex();
    if (!index) return { content: [{ type: 'text', text: 'Index not built. Run joomla_sync first.' }], isError: true };
    return { content: [{ type: 'text', text: formatSearchResults(search(index, args as any)) }] };
  }
);

// --- joomla_list_events ---
registerTool(
  {
    name: 'joomla_list_events',
    description: 'List Joomla 6 event classes. Filter by name or namespace to find specific events for plugin development.',
    inputSchema: {
      type: 'object',
      properties: {
        filter: { type: 'string', description: 'Filter by event name or description' },
        namespace: { type: 'string', description: 'Filter by namespace' }
      }
    }
  },
  async (args, ctx) => {
    const index = ctx.getIndex();
    if (!index) return { content: [{ type: 'text', text: 'Index not built. Run joomla_sync first.' }], isError: true };
    return { content: [{ type: 'text', text: formatEventsResult(listEvents(index, args as any)) }] };
  }
);

// --- joomla_get_services ---
registerTool(
  {
    name: 'joomla_get_services',
    description: 'List Joomla 6 DI service providers and factories. Filter to find specific services for dependency injection.',
    inputSchema: {
      type: 'object',
      properties: {
        filter: { type: 'string', description: 'Filter by service name or FQN' }
      }
    }
  },
  async (args, ctx) => {
    const index = ctx.getIndex();
    if (!index) return { content: [{ type: 'text', text: 'Index not built. Run joomla_sync first.' }], isError: true };
    return { content: [{ type: 'text', text: formatServicesResult(getServices(index, args as any)) }] };
  }
);

// --- joomla_extension_structure ---
registerTool(
  {
    name: 'joomla_extension_structure',
    description: 'Get the standard directory structure and manifest template for a Joomla 6 extension type (component, plugin, module, template, library).',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['component', 'plugin', 'module', 'template', 'library'], description: 'Extension type' },
        name: { type: 'string', description: 'Extension name (default: example)' }
      },
      required: ['type']
    }
  },
  async (args, _ctx) => {
    try {
      const result = getExtensionStructure(args as any);
      return { content: [{ type: 'text', text: formatExtensionStructure(result) }] };
    } catch (e) {
      return { content: [{ type: 'text', text: (e as Error).message }], isError: true };
    }
  }
);

// --- joomla_coding_patterns ---
registerTool(
  {
    name: 'joomla_coding_patterns',
    description: 'Get Joomla 6 coding patterns and examples for a category. Categories: mvc, events, forms, database, authentication, routing, assets, language. Omit category to list all available.',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: ['mvc', 'events', 'forms', 'database', 'authentication', 'routing', 'assets', 'language'], description: 'Pattern category' }
      }
    }
  },
  async (args, _ctx) => {
    if (!args.category) {
      return { content: [{ type: 'text', text: listPatternCategories() }] };
    }
    try {
      const result = getCodingPatterns(args as any);
      return { content: [{ type: 'text', text: formatCodingPatterns(result) }] };
    } catch (e) {
      return { content: [{ type: 'text', text: (e as Error).message }], isError: true };
    }
  }
);

// --- LSP Tool Helpers ---

function requireBridge(ctx: ToolContext): IntelephenseBridge {
  const bridge = ctx.getBridge();
  if (!bridge || !bridge.isReady()) {
    throw new Error('LSP not ready. Intelephense is still initializing — try again in a few seconds.');
  }
  return bridge;
}

function lspInputSchema(extraProps: Record<string, unknown> = {}) {
  return {
    type: 'object',
    properties: {
      filePath: { type: 'string', description: 'Absolute path to a PHP file on the server' },
      code: { type: 'string', description: 'Inline PHP code string (alternative to filePath)' },
      ...extraProps,
    },
  };
}

// --- joomla_diagnostics ---
registerTool(
  {
    name: 'joomla_diagnostics',
    description: 'Analyse PHP code for errors, warnings, and type issues using Intelephense LSP. Provide either a filePath (on the server) or inline code.',
    inputSchema: lspInputSchema(),
  },
  async (args, ctx) => {
    try {
      const bridge = requireBridge(ctx);
      const text = await runDiagnostics(bridge, args as any);
      return { content: [{ type: 'text', text }] };
    } catch (e) {
      return { content: [{ type: 'text', text: (e as Error).message }], isError: true };
    }
  }
);

// --- joomla_hover ---
registerTool(
  {
    name: 'joomla_hover',
    description: 'Get type information, docblock, and signature for a symbol at a specific position. Provide filePath or code, plus line and character (0-indexed).',
    inputSchema: lspInputSchema({
      line: { type: 'number', description: 'Line number (0-indexed)' },
      character: { type: 'number', description: 'Character offset (0-indexed)' },
    }),
  },
  async (args, ctx) => {
    try {
      const bridge = requireBridge(ctx);
      const { line, character, ...input } = args as any;
      const text = await runHover(bridge, input, line ?? 0, character ?? 0);
      return { content: [{ type: 'text', text }] };
    } catch (e) {
      return { content: [{ type: 'text', text: (e as Error).message }], isError: true };
    }
  }
);

// --- joomla_definition ---
registerTool(
  {
    name: 'joomla_definition',
    description: 'Go to definition for a symbol at a specific position. Returns the source location and surrounding code. Provide filePath or code, plus line and character (0-indexed).',
    inputSchema: lspInputSchema({
      line: { type: 'number', description: 'Line number (0-indexed)' },
      character: { type: 'number', description: 'Character offset (0-indexed)' },
    }),
  },
  async (args, ctx) => {
    try {
      const bridge = requireBridge(ctx);
      const { line, character, ...input } = args as any;
      const text = await runDefinition(bridge, input, line ?? 0, character ?? 0);
      return { content: [{ type: 'text', text }] };
    } catch (e) {
      return { content: [{ type: 'text', text: (e as Error).message }], isError: true };
    }
  }
);

// --- joomla_completion ---
registerTool(
  {
    name: 'joomla_completion',
    description: 'Get code completion suggestions at a specific position. Returns up to 50 suggestions with kind and documentation. Provide filePath or code, plus line and character (0-indexed).',
    inputSchema: lspInputSchema({
      line: { type: 'number', description: 'Line number (0-indexed)' },
      character: { type: 'number', description: 'Character offset (0-indexed)' },
    }),
  },
  async (args, ctx) => {
    try {
      const bridge = requireBridge(ctx);
      const { line, character, ...input } = args as any;
      const text = await runCompletion(bridge, input, line ?? 0, character ?? 0);
      return { content: [{ type: 'text', text }] };
    } catch (e) {
      return { content: [{ type: 'text', text: (e as Error).message }], isError: true };
    }
  }
);

// --- joomla_schema ---
registerTool(
  {
    name: 'joomla_schema',
    description: 'Look up Joomla 6 database table schemas. Provide a tableName (e.g. "content" or "#__content"), a component name (e.g. "com_content"), or set listAll=true to see all tables.',
    inputSchema: {
      type: 'object',
      properties: {
        tableName: { type: 'string', description: 'Table name (with or without #__ prefix)' },
        component: { type: 'string', description: 'Component name (e.g. com_content)' },
        listAll: { type: 'boolean', description: 'List all available tables' },
      },
    },
  },
  async (args, ctx) => {
    const schema = ctx.getSchema();
    if (!schema) {
      return { content: [{ type: 'text', text: 'Schema not available. Run joomla_sync first to fetch SQL files.' }], isError: true };
    }
    const text = lookupSchema(schema, args as any);
    return { content: [{ type: 'text', text }] };
  }
);

// --- joomla_lint ---
registerTool(
  {
    name: 'joomla_lint',
    description: 'Check PHP code against coding standards using phpcs. Requires PHP to be installed on the server.',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Path to PHP file' },
        code: { type: 'string', description: 'Inline PHP code' },
        standard: { type: 'string', description: 'Coding standard (default: Joomla)' },
      },
    },
  },
  async (args, _ctx) => {
    const text = await runLint(args as any);
    return { content: [{ type: 'text', text }] };
  }
);

// --- joomla_fix ---
registerTool(
  {
    name: 'joomla_fix',
    description: 'Auto-fix PHP coding standard violations using phpcbf. Requires PHP to be installed on the server.',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Path to PHP file' },
        code: { type: 'string', description: 'Inline PHP code' },
        standard: { type: 'string', description: 'Coding standard (default: Joomla)' },
      },
    },
  },
  async (args, _ctx) => {
    const text = await runFix(args as any);
    return { content: [{ type: 'text', text }] };
  }
);

// --- Public API ---

export function getToolDefinitions(): ToolDefinition[] {
  return toolDefinitions;
}

export function getToolHandler(name: string): ToolHandler | undefined {
  return toolHandlers.get(name);
}
