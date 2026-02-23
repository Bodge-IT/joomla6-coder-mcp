import { JoomlaIndex } from '../parser/index-builder.js';
import { ParsedClass, ParsedMethod } from '../parser/php-parser.js';
import { sanitisePath } from './response-utils.js';

export interface LookupClassInput {
  className: string;
  methodName?: string;
  summary?: boolean;
}

export interface LookupClassResult {
  found: boolean;
  class?: ParsedClass;
  method?: ParsedMethod;
  suggestions?: string[];
  message: string;
}

export function lookupClass(index: JoomlaIndex, input: LookupClassInput): LookupClassResult {
  const { className, methodName } = input;
  const searchTerm = className.toLowerCase();

  // Try exact FQN match first
  let matchedClass = index.classes.find(c => c.fqn.toLowerCase() === searchTerm);

  // Try class name match
  if (!matchedClass) {
    matchedClass = index.classes.find(c => c.name.toLowerCase() === searchTerm);
  }

  // Try partial match
  if (!matchedClass) {
    const partialMatches = index.classes.filter(c =>
      c.name.toLowerCase().includes(searchTerm) ||
      c.fqn.toLowerCase().includes(searchTerm)
    );

    if (partialMatches.length === 1) {
      matchedClass = partialMatches[0];
    } else if (partialMatches.length > 1) {
      return {
        found: false,
        suggestions: partialMatches.slice(0, 10).map(c => c.fqn),
        message: `Multiple matches found for "${className}". Did you mean one of these?`
      };
    }
  }

  if (!matchedClass) {
    // Find similar names for suggestions
    const suggestions = index.classes
      .filter(c => levenshteinDistance(c.name.toLowerCase(), searchTerm) <= 3)
      .slice(0, 5)
      .map(c => c.fqn);

    return {
      found: false,
      suggestions: suggestions.length > 0 ? suggestions : undefined,
      message: `Class "${className}" not found in Joomla 6 API.`
    };
  }

  // If method requested, find it
  if (methodName) {
    const method = matchedClass.methods.find(m =>
      m.name.toLowerCase() === methodName.toLowerCase()
    );

    if (!method) {
      const methodSuggestions = matchedClass.methods
        .filter(m => m.name.toLowerCase().includes(methodName.toLowerCase()))
        .map(m => m.name);

      return {
        found: true,
        class: matchedClass,
        suggestions: methodSuggestions.length > 0 ? methodSuggestions : undefined,
        message: `Method "${methodName}" not found in ${matchedClass.fqn}. Available methods listed in class details.`
      };
    }

    return {
      found: true,
      class: matchedClass,
      method,
      message: `Found method ${methodName} in ${matchedClass.fqn}`
    };
  }

  return {
    found: true,
    class: matchedClass,
    message: `Found ${matchedClass.fqn}`
  };
}

export function formatClassSummary(cls: ParsedClass): string {
  const lines: string[] = [];

  const type = cls.isInterface ? 'interface' : cls.isTrait ? 'trait' : (cls.isAbstract ? 'abstract class' : 'class');
  lines.push(`## ${type} ${cls.name}`);
  lines.push(`**FQN:** \`${cls.fqn}\``);

  if (cls.extends) {
    lines.push(`**Extends:** \`${cls.extends}\``);
  }

  if (cls.implements.length > 0) {
    lines.push(`**Implements:** ${cls.implements.map(i => `\`${i}\``).join(', ')}`);
  }

  if (cls.constants.length > 0) {
    lines.push('');
    lines.push(`**Constants:** ${cls.constants.map(c => c.name).join(', ')}`);
  }

  const publicProps = cls.properties.filter(p => p.visibility === 'public');
  if (publicProps.length > 0) {
    lines.push(`**Properties:** ${publicProps.map(p => `$${p.name}`).join(', ')}`);
  }

  const publicMethods = cls.methods.filter(m => m.visibility === 'public');
  const protectedMethods = cls.methods.filter(m => m.visibility === 'protected');

  if (publicMethods.length > 0) {
    lines.push(`**Public methods:** ${publicMethods.map(m => m.name).join(', ')}`);
  }

  if (protectedMethods.length > 0) {
    lines.push(`**Protected methods:** ${protectedMethods.map(m => m.name).join(', ')}`);
  }

  lines.push('');
  lines.push(`**Source:** \`${sanitisePath(cls.filePath)}\``);
  lines.push('');
  lines.push('*Use summary=false for full details including signatures and docblocks.*');

  return lines.join('\n');
}

export function formatClassInfo(cls: ParsedClass): string {
  const lines: string[] = [];

  // Header
  const type = cls.isInterface ? 'interface' : cls.isTrait ? 'trait' : (cls.isAbstract ? 'abstract class' : 'class');
  lines.push(`## ${type} ${cls.name}`);
  lines.push(`**Namespace:** \`${cls.namespace}\``);
  lines.push(`**FQN:** \`${cls.fqn}\``);

  if (cls.extends) {
    lines.push(`**Extends:** \`${cls.extends}\``);
  }

  if (cls.implements.length > 0) {
    lines.push(`**Implements:** ${cls.implements.map(i => `\`${i}\``).join(', ')}`);
  }

  if (cls.traits.length > 0) {
    lines.push(`**Uses traits:** ${cls.traits.map(t => `\`${t}\``).join(', ')}`);
  }

  // Docblock
  if (cls.docblock) {
    lines.push('');
    lines.push('### Description');
    lines.push(cleanDocblock(cls.docblock));
  }

  // Constants
  if (cls.constants.length > 0) {
    lines.push('');
    lines.push('### Constants');
    for (const c of cls.constants) {
      lines.push(`- \`${c.name}\`${c.value ? ` = ${c.value}` : ''}`);
    }
  }

  // Properties
  const publicProps = cls.properties.filter(p => p.visibility === 'public');
  const protectedProps = cls.properties.filter(p => p.visibility === 'protected');

  if (publicProps.length > 0) {
    lines.push('');
    lines.push('### Public Properties');
    for (const p of publicProps) {
      const type = p.type ? `${p.type} ` : '';
      const static_ = p.isStatic ? 'static ' : '';
      lines.push(`- \`${static_}${type}$${p.name}\`${p.defaultValue ? ` = ${p.defaultValue}` : ''}`);
    }
  }

  if (protectedProps.length > 0) {
    lines.push('');
    lines.push('### Protected Properties');
    for (const p of protectedProps) {
      const type = p.type ? `${p.type} ` : '';
      const static_ = p.isStatic ? 'static ' : '';
      lines.push(`- \`${static_}${type}$${p.name}\``);
    }
  }

  // Methods
  const publicMethods = cls.methods.filter(m => m.visibility === 'public');
  const protectedMethods = cls.methods.filter(m => m.visibility === 'protected');

  if (publicMethods.length > 0) {
    lines.push('');
    lines.push('### Public Methods');
    for (const m of publicMethods) {
      lines.push(`- \`${formatMethodSignature(m)}\``);
    }
  }

  if (protectedMethods.length > 0) {
    lines.push('');
    lines.push('### Protected Methods');
    for (const m of protectedMethods) {
      lines.push(`- \`${formatMethodSignature(m)}\``);
    }
  }

  lines.push('');
  lines.push(`**Source:** \`${sanitisePath(cls.filePath)}\``);

  return lines.join('\n');
}

export function formatMethodInfo(method: ParsedMethod, className: string): string {
  const lines: string[] = [];

  lines.push(`## ${className}::${method.name}()`);
  lines.push('');
  lines.push('### Signature');
  lines.push('```php');
  lines.push(formatMethodSignature(method, true));
  lines.push('```');

  if (method.docblock) {
    lines.push('');
    lines.push('### Documentation');
    lines.push(cleanDocblock(method.docblock));
  }

  if (method.parameters.length > 0) {
    lines.push('');
    lines.push('### Parameters');
    for (const p of method.parameters) {
      const type = p.type || 'mixed';
      const ref = p.isReference ? '&' : '';
      const variadic = p.isVariadic ? '...' : '';
      const defaultVal = p.defaultValue ? ` (default: ${p.defaultValue})` : '';
      lines.push(`- \`${type} ${ref}${variadic}$${p.name}\`${defaultVal}`);
    }
  }

  if (method.returnType) {
    lines.push('');
    lines.push(`### Returns`);
    lines.push(`\`${method.returnType}\``);
  }

  return lines.join('\n');
}

function formatMethodSignature(method: ParsedMethod, full: boolean = false): string {
  const static_ = method.isStatic ? 'static ' : '';
  const abstract_ = method.isAbstract ? 'abstract ' : '';
  const visibility = full ? `${method.visibility} ` : '';
  const returnType = method.returnType ? `: ${method.returnType}` : '';

  const params = method.parameters.map(p => {
    const type = p.type ? `${p.type} ` : '';
    const ref = p.isReference ? '&' : '';
    const variadic = p.isVariadic ? '...' : '';
    const defaultVal = p.defaultValue ? ` = ${p.defaultValue}` : '';
    return `${type}${ref}${variadic}$${p.name}${defaultVal}`;
  }).join(', ');

  return `${visibility}${abstract_}${static_}function ${method.name}(${params})${returnType}`;
}

function cleanDocblock(docblock: string): string {
  return docblock
    .replace(/^\/\*\*\s*\n?/, '')
    .replace(/\n?\s*\*\/$/, '')
    .split('\n')
    .map(line => line.replace(/^\s*\*\s?/, ''))
    .join('\n')
    .trim();
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}
