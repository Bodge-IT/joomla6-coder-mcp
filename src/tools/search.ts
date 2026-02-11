import { JoomlaIndex } from '../parser/index-builder.js';
import { ParsedClass, ParsedMethod } from '../parser/php-parser.js';

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

function formatPropertySignature(prop: any): string {
  const static_ = prop.isStatic ? 'static ' : '';
  const type = prop.type ? `${prop.type} ` : '';
  return `${prop.visibility} ${static_}${type}$${prop.name}`;
}

export function formatSearchResults(output: SearchOutput, verbose: boolean = false): string {
  const lines: string[] = [];

  lines.push(`## Search Results for "${output.query}"`);
  lines.push(`Found ${output.total} results${output.results.length < output.total ? ` (showing ${output.results.length})` : ''}`);
  lines.push('');

  if (output.results.length === 0) {
    lines.push('No results found.');
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

  const typeOrder = ['class', 'method', 'constant', 'property'];

  for (const type of typeOrder) {
    if (!grouped[type]) continue;

    lines.push(`### ${type.charAt(0).toUpperCase() + type.slice(1)}es`);
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
