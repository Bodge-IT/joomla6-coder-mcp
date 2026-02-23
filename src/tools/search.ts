import { JoomlaIndex } from '../parser/index-builder.js';
import { ParsedClass, ParsedMethod, ParsedProperty } from '../parser/php-parser.js';

export interface SearchInput {
  query: string;
  type?: 'class' | 'method' | 'constant' | 'property' | 'all';
  limit?: number;
  verbose?: boolean;
}

export interface SearchResult {
  type: 'class' | 'method' | 'constant' | 'property';
  name: string;
  fqn: string;
  context?: string;
  docblock?: string;
  signature?: string;
}

export interface SearchOutput {
  query: string;
  results: SearchResult[];
  total: number;
}

export function search(index: JoomlaIndex, input: SearchInput): SearchOutput {
  const { query, type = 'all', limit = 10 } = input;
  const searchTerm = query.toLowerCase();
  const results: SearchResult[] = [];

  for (const cls of index.classes) {
    // Search class names
    if (type === 'all' || type === 'class') {
      if (
        cls.name.toLowerCase().includes(searchTerm) ||
        cls.fqn.toLowerCase().includes(searchTerm) ||
        (cls.docblock && cls.docblock.toLowerCase().includes(searchTerm))
      ) {
        results.push({
          type: 'class',
          name: cls.name,
          fqn: cls.fqn,
          docblock: truncateDocblock(cls.docblock),
          signature: formatClassSignature(cls)
        });
      }
    }

    // Search methods
    if (type === 'all' || type === 'method') {
      for (const method of cls.methods) {
        if (
          method.name.toLowerCase().includes(searchTerm) ||
          (method.docblock && method.docblock.toLowerCase().includes(searchTerm))
        ) {
          results.push({
            type: 'method',
            name: method.name,
            fqn: `${cls.fqn}::${method.name}()`,
            context: cls.fqn,
            docblock: truncateDocblock(method.docblock),
            signature: formatMethodSignature(method)
          });
        }
      }
    }

    // Search constants
    if (type === 'all' || type === 'constant') {
      for (const constant of cls.constants) {
        if (constant.name.toLowerCase().includes(searchTerm)) {
          results.push({
            type: 'constant',
            name: constant.name,
            fqn: `${cls.fqn}::${constant.name}`,
            context: cls.fqn,
            signature: constant.value ? `${constant.name} = ${constant.value}` : constant.name
          });
        }
      }
    }

    // Search properties
    if (type === 'all' || type === 'property') {
      for (const prop of cls.properties) {
        if (prop.name.toLowerCase().includes(searchTerm)) {
          results.push({
            type: 'property',
            name: prop.name,
            fqn: `${cls.fqn}::$${prop.name}`,
            context: cls.fqn,
            signature: formatPropertySignature(prop)
          });
        }
      }
    }
  }

  // Sort by relevance (exact matches first, then by name length)
  results.sort((a, b) => {
    const aExact = a.name.toLowerCase() === searchTerm;
    const bExact = b.name.toLowerCase() === searchTerm;
    if (aExact && !bExact) return -1;
    if (!aExact && bExact) return 1;

    const aStarts = a.name.toLowerCase().startsWith(searchTerm);
    const bStarts = b.name.toLowerCase().startsWith(searchTerm);
    if (aStarts && !bStarts) return -1;
    if (!aStarts && bStarts) return 1;

    return a.name.length - b.name.length;
  });

  return {
    query,
    results: results.slice(0, limit),
    total: results.length
  };
}

function truncateDocblock(docblock?: string): string | undefined {
  if (!docblock) return undefined;

  const cleaned = docblock
    .replace(/^\/\*\*\s*\n?/, '')
    .replace(/\n?\s*\*\/$/, '')
    .split('\n')
    .map(line => line.replace(/^\s*\*\s?/, ''))
    .join(' ')
    .trim();

  if (cleaned.length > 100) {
    return cleaned.substring(0, 100) + '...';
  }

  return cleaned;
}

function formatClassSignature(cls: ParsedClass): string {
  const type = cls.isInterface ? 'interface' : cls.isTrait ? 'trait' : 'class';
  const abstract_ = cls.isAbstract ? 'abstract ' : '';
  let sig = `${abstract_}${type} ${cls.name}`;

  if (cls.extends) {
    sig += ` extends ${cls.extends}`;
  }

  if (cls.implements.length > 0) {
    sig += ` implements ${cls.implements.join(', ')}`;
  }

  return sig;
}

function formatMethodSignature(method: ParsedMethod): string {
  const static_ = method.isStatic ? 'static ' : '';
  const visibility = method.visibility;
  const returnType = method.returnType ? `: ${method.returnType}` : '';

  const params = method.parameters.map(p => {
    const type = p.type ? `${p.type} ` : '';
    return `${type}$${p.name}`;
  }).join(', ');

  return `${visibility} ${static_}function ${method.name}(${params})${returnType}`;
}

function formatPropertySignature(prop: ParsedProperty): string {
  const static_ = prop.isStatic ? 'static ' : '';
  const type = prop.type ? `${prop.type} ` : '';
  return `${prop.visibility} ${static_}${type}$${prop.name}`;
}

// Concept → tool suggestion map for zero-result fallbacks
const zeroResultFallbacks: Array<{ keywords: string[]; suggestion: string }> = [
  {
    keywords: ['webservices', 'web services', 'webservice', 'rest api', 'api route', 'apiroute'],
    suggestion: '`joomla_coding_patterns(category: "api")` for Web Services plugin patterns, or `joomla_list_events(filter: "api")` for API-related events'
  },
  {
    keywords: ['event', 'plugin', 'trigger', 'dispatch', 'subscriber'],
    suggestion: '`joomla_list_events()` to browse all event classes, or `joomla_coding_patterns(category: "events")` for plugin/event patterns'
  },
  {
    keywords: ['form', 'field', 'fieldset', 'validate', 'validation'],
    suggestion: '`joomla_coding_patterns(category: "forms")` for form field and validation patterns'
  },
  {
    keywords: ['database', 'query', 'dbo', 'sql', 'select', 'insert', 'update', 'delete'],
    suggestion: '`joomla_coding_patterns(category: "database")` for database query patterns, or `joomla_schema(listAll: true)` to browse table schemas'
  },
  {
    keywords: ['auth', 'login', 'authentication', 'session', 'token', 'user'],
    suggestion: '`joomla_coding_patterns(category: "authentication")` for authentication patterns'
  },
  {
    keywords: ['route', 'router', 'url', 'routing', 'link'],
    suggestion: '`joomla_coding_patterns(category: "routing")` for URL routing patterns'
  },
  {
    keywords: ['asset', 'css', 'javascript', 'script', 'style', 'webasset'],
    suggestion: '`joomla_coding_patterns(category: "assets")` for asset management patterns'
  },
  {
    keywords: ['language', 'translation', 'i18n', 'locale', 'text'],
    suggestion: '`joomla_coding_patterns(category: "language")` for language and translation patterns'
  },
  {
    keywords: ['cli', 'command', 'console', 'terminal'],
    suggestion: '`joomla_coding_patterns(category: "cli")` for CLI command patterns'
  },
  {
    keywords: ['mvc', 'model', 'view', 'controller', 'component', 'com_'],
    suggestion: '`joomla_coding_patterns(category: "mvc")` for MVC patterns, or `joomla_extension_structure(type: "component")` for component scaffolding'
  },
  {
    keywords: ['service', 'di', 'container', 'dependency', 'provider', 'factory'],
    suggestion: '`joomla_get_services()` to browse DI service providers and factories'
  },
  {
    keywords: ['schema', 'table', 'column', 'migration'],
    suggestion: '`joomla_schema(listAll: true)` to browse all database table schemas'
  },
];

function getZeroResultSuggestions(query: string): string[] {
  const q = query.toLowerCase();
  const suggestions: string[] = [];
  for (const entry of zeroResultFallbacks) {
    if (entry.keywords.some(kw => q.includes(kw))) {
      suggestions.push(entry.suggestion);
    }
  }
  return suggestions;
}

export function formatSearchResults(output: SearchOutput, verbose: boolean = false): string {
  const lines: string[] = [];

  lines.push(`## Search Results for "${output.query}"`);
  lines.push(`Found ${output.total} results${output.results.length < output.total ? ` (showing ${output.results.length})` : ''}`);
  lines.push('');

  if (output.results.length === 0) {
    lines.push('No results found.');
    const suggestions = getZeroResultSuggestions(output.query);
    if (suggestions.length > 0) {
      lines.push('');
      lines.push('**Try instead:**');
      for (const s of suggestions) {
        lines.push(`- ${s}`);
      }
    } else {
      lines.push('');
      lines.push('**Try instead:**');
      lines.push('- `joomla_coding_patterns()` to browse patterns by concept (mvc, events, forms, database, authentication, routing, assets, language, api, cli)');
      lines.push('- `joomla_list_events()` to browse event classes');
      lines.push('- `joomla_get_services()` to browse DI service providers');
    }
    return lines.join('\n');
  }

  // Group by type
  const grouped: Record<string, SearchResult[]> = {};
  for (const result of output.results) {
    if (!grouped[result.type]) {
      grouped[result.type] = [];
    }
    grouped[result.type].push(result);
  }

  const typeLabels: Record<string, string> = {
    class: 'Classes',
    method: 'Methods',
    constant: 'Constants',
    property: 'Properties',
  };
  const typeOrder = ['class', 'method', 'constant', 'property'];

  for (const type of typeOrder) {
    if (!grouped[type]) continue;

    lines.push(`### ${typeLabels[type]}`);
    lines.push('');

    for (const result of grouped[type]) {
      lines.push(`**${result.name}**`);
      lines.push(`\`${result.fqn}\``);
      if (verbose && result.signature) {
        lines.push(`\`${result.signature}\``);
      }
      if (verbose && result.docblock) {
        lines.push(`> ${result.docblock}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}
