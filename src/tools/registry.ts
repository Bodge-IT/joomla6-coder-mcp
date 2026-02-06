import { JoomlaIndex } from '../parser/index-builder.js';
import { GitHubSync } from '../sync/github-sync.js';
import { IndexBuilder } from '../parser/index-builder.js';
import { lookupClass, formatClassInfo, formatMethodInfo } from './lookup-class.js';
import { search, formatSearchResults } from './search.js';
import { listEvents, formatEventsResult } from './list-events.js';
import { getServices, formatServicesResult } from './get-services.js';
import { getExtensionStructure, formatExtensionStructure, ExtensionType } from './extension-structure.js';
import { getCodingPatterns, formatCodingPatterns, listPatternCategories, PatternCategory } from './coding-patterns.js';

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

// --- Public API ---

export function getToolDefinitions(): ToolDefinition[] {
  return toolDefinitions;
}

export function getToolHandler(name: string): ToolHandler | undefined {
  return toolHandlers.get(name);
}
