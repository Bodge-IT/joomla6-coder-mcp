import { createRequire } from 'module';
import * as fs from 'fs/promises';
import * as path from 'path';

// php-parser doesn't have proper ESM exports, use require
const require = createRequire(import.meta.url);
const PhpParserEngine = require('php-parser');

type Engine = any;

export interface ParsedClass {
  name: string;
  namespace: string;
  fqn: string;
  extends?: string;
  implements: string[];
  docblock?: string;
  methods: ParsedMethod[];
  properties: ParsedProperty[];
  constants: ParsedConstant[];
  traits: string[];
  isAbstract: boolean;
  isInterface: boolean;
  isTrait: boolean;
  filePath: string;
}

export interface ParsedMethod {
  name: string;
  visibility: 'public' | 'protected' | 'private';
  isStatic: boolean;
  isAbstract: boolean;
  parameters: ParsedParameter[];
  returnType?: string;
  docblock?: string;
}

export interface ParsedParameter {
  name: string;
  type?: string;
  defaultValue?: string;
  isVariadic: boolean;
  isReference: boolean;
}

export interface ParsedProperty {
  name: string;
  visibility: 'public' | 'protected' | 'private';
  isStatic: boolean;
  type?: string;
  defaultValue?: string;
  docblock?: string;
}

export interface ParsedConstant {
  name: string;
  value?: string;
  visibility: 'public' | 'protected' | 'private';
  docblock?: string;
}

export class PhpParser {
  private parser: Engine;

  constructor() {
    this.parser = new PhpParserEngine({
      parser: {
        extractDoc: true,
        php7: true,
        locations: true,
        suppressErrors: true
      },
      ast: {
        withPositions: true
      }
    });
  }

  async parseFile(filePath: string): Promise<ParsedClass[]> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return this.parseContent(content, filePath);
    } catch (error) {
      console.error(`Error parsing ${filePath}:`, error);
      return [];
    }
  }

  parseContent(content: string, filePath: string): ParsedClass[] {
    try {
      const ast = this.parser.parseCode(content, path.basename(filePath));
      const classes: ParsedClass[] = [];
      let currentNamespace = '';

      this.walkAst(ast, (node: any) => {
        if (node.kind === 'namespace') {
          currentNamespace = this.resolveNamespace(node.name);
        }

        if (node.kind === 'class' || node.kind === 'interface' || node.kind === 'trait') {
          const parsed = this.parseClassNode(node, currentNamespace, filePath);
          if (parsed) {
            classes.push(parsed);
          }
        }
      });

      return classes;
    } catch (error) {
      console.error(`Parse error in ${filePath}:`, error);
      return [];
    }
  }

  private walkAst(node: any, callback: (node: any) => void): void {
    if (!node || typeof node !== 'object') return;

    callback(node);

    if (Array.isArray(node)) {
      node.forEach(child => this.walkAst(child, callback));
    } else if (node.children) {
      node.children.forEach((child: any) => this.walkAst(child, callback));
    } else if (node.body) {
      if (Array.isArray(node.body)) {
        node.body.forEach((child: any) => this.walkAst(child, callback));
      } else {
        this.walkAst(node.body, callback);
      }
    }
  }

  private parseClassNode(node: any, namespace: string, filePath: string): ParsedClass | null {
    const name = node.name?.name || node.name;
    if (!name) return null;

    const fqn = namespace ? `${namespace}\\${name}` : name;

    return {
      name,
      namespace,
      fqn,
      extends: this.resolveExtends(node.extends),
      implements: this.resolveImplements(node.implements),
      docblock: this.extractDocblock(node),
      methods: this.parseMethods(node.body || []),
      properties: this.parseProperties(node.body || []),
      constants: this.parseConstants(node.body || []),
      traits: this.parseTraits(node.body || []),
      isAbstract: node.isAbstract || false,
      isInterface: node.kind === 'interface',
      isTrait: node.kind === 'trait',
      filePath
    };
  }

  private resolveNamespace(name: any): string {
    if (!name) return '';
    if (typeof name === 'string') return name;
    if (name.name) return name.name;
    if (Array.isArray(name)) return name.join('\\');
    return '';
  }

  private resolveExtends(ext: any): string | undefined {
    if (!ext) return undefined;
    if (typeof ext === 'string') return ext;
    if (ext.name) return ext.name;
    return undefined;
  }

  private resolveImplements(impl: any[]): string[] {
    if (!impl || !Array.isArray(impl)) return [];
    return impl.map(i => {
      if (typeof i === 'string') return i;
      if (i.name) return i.name;
      return '';
    }).filter(Boolean);
  }

  private extractDocblock(node: any): string | undefined {
    if (node.leadingComments && node.leadingComments.length > 0) {
      const doc = node.leadingComments.find((c: any) => c.kind === 'commentblock');
      return doc?.value;
    }
    return undefined;
  }

  private parseMethods(body: any[]): ParsedMethod[] {
    if (!Array.isArray(body)) return [];

    return body
      .filter(node => node.kind === 'method')
      .map(node => ({
        name: node.name?.name || node.name || '',
        visibility: this.getVisibility(node),
        isStatic: node.isStatic || false,
        isAbstract: node.isAbstract || false,
        parameters: this.parseParameters(node.arguments || []),
        returnType: this.resolveType(node.type),
        docblock: this.extractDocblock(node)
      }));
  }

  private parseParameters(args: any[]): ParsedParameter[] {
    if (!Array.isArray(args)) return [];

    return args.map(arg => ({
      name: arg.name?.name || arg.name || '',
      type: this.resolveType(arg.type),
      defaultValue: arg.value ? this.resolveValue(arg.value) : undefined,
      isVariadic: arg.variadic || false,
      isReference: arg.byref || false
    }));
  }

  private parseProperties(body: any[]): ParsedProperty[] {
    if (!Array.isArray(body)) return [];

    const properties: ParsedProperty[] = [];

    body.filter(node => node.kind === 'propertystatement').forEach(stmt => {
      if (stmt.properties && Array.isArray(stmt.properties)) {
        stmt.properties.forEach((prop: any) => {
          properties.push({
            name: prop.name?.name || prop.name || '',
            visibility: this.getVisibility(stmt),
            isStatic: stmt.isStatic || false,
            type: this.resolveType(stmt.type),
            defaultValue: prop.value ? this.resolveValue(prop.value) : undefined,
            docblock: this.extractDocblock(stmt)
          });
        });
      }
    });

    return properties;
  }

  private parseConstants(body: any[]): ParsedConstant[] {
    if (!Array.isArray(body)) return [];

    const constants: ParsedConstant[] = [];

    body.filter(node => node.kind === 'classconstant').forEach(stmt => {
      if (stmt.constants && Array.isArray(stmt.constants)) {
        stmt.constants.forEach((c: any) => {
          constants.push({
            name: c.name?.name || c.name || '',
            value: c.value ? this.resolveValue(c.value) : undefined,
            visibility: this.getVisibility(stmt),
            docblock: this.extractDocblock(stmt)
          });
        });
      }
    });

    return constants;
  }

  private parseTraits(body: any[]): string[] {
    if (!Array.isArray(body)) return [];

    return body
      .filter(node => node.kind === 'traituse')
      .flatMap(node => {
        if (node.traits && Array.isArray(node.traits)) {
          return node.traits.map((t: any) => t.name || '').filter(Boolean);
        }
        return [];
      });
  }

  private getVisibility(node: any): 'public' | 'protected' | 'private' {
    if (node.visibility === 'protected') return 'protected';
    if (node.visibility === 'private') return 'private';
    return 'public';
  }

  private resolveType(type: any): string | undefined {
    if (!type) return undefined;
    if (typeof type === 'string') return type;
    if (type.name) return type.name;
    if (type.kind === 'uniontype' && type.types) {
      return type.types.map((t: any) => this.resolveType(t)).join('|');
    }
    if (type.kind === 'intersectiontype' && type.types) {
      return type.types.map((t: any) => this.resolveType(t)).join('&');
    }
    if (type.kind === 'nullabletype' && type.type) {
      return '?' + this.resolveType(type.type);
    }
    return undefined;
  }

  private resolveValue(value: any): string | undefined {
    if (!value) return undefined;
    if (value.kind === 'string') return `"${value.value}"`;
    if (value.kind === 'number') return String(value.value);
    if (value.kind === 'boolean') return value.value ? 'true' : 'false';
    if (value.kind === 'nullkeyword') return 'null';
    if (value.kind === 'array') return '[...]';
    if (value.raw) return value.raw;
    return undefined;
  }
}
