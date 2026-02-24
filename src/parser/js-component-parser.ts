/**
 * Parses Joomla web component source files (.es6.js, .w-c.es6.js) to extract
 * custom element definitions, attributes, properties, events, and slots.
 * Uses regex-based parsing against Joomla's ES6 source files.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export interface WebComponentProperty {
  name: string;
  type?: string;
  description?: string;
}

export interface ParsedWebComponent {
  tagName: string;
  className: string;
  filePath: string;
  attributes: string[];
  properties: WebComponentProperty[];
  events: string[];
  slots: string[];
  extendsElement?: string;
  docblock?: string;
}

export interface WebComponentIndex {
  version: string;
  lastSync: string;
  commit?: string;
  components: ParsedWebComponent[];
}

export class JsComponentParser {
  /**
   * Recursively scan a directory for .es6.js and .w-c.es6.js files,
   * parse each one, and return all discovered web components.
   */
  async parseDirectory(mediaSourceDir: string): Promise<ParsedWebComponent[]> {
    const components: ParsedWebComponent[] = [];
    const jsFiles = await this.findComponentFiles(mediaSourceDir);

    for (const file of jsFiles) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const relativePath = path.relative(mediaSourceDir, file).replace(/\\/g, '/');
        const component = this.parseFile(content, relativePath);
        if (component) {
          components.push(component);
        }
      } catch (error) {
        console.error(`Error parsing ${file}:`, error);
      }
    }

    return components;
  }

  /**
   * Parse a single JS file's content and return a ParsedWebComponent,
   * or null if no customElements.define call is found.
   */
  parseFile(content: string, filePath: string): ParsedWebComponent | null {
    // Must have customElements.define to be considered a web component
    const defineMatch = content.match(/customElements\.define\(\s*['"`]([^'"`]+)['"`]\s*,\s*(\w+)\s*\)/);
    if (!defineMatch) {
      return null;
    }

    const tagName = defineMatch[1];
    const className = defineMatch[2];

    return {
      tagName,
      className,
      filePath,
      attributes: this.extractObservedAttributes(content),
      properties: this.extractProperties(content),
      events: this.extractEvents(content),
      slots: this.extractSlots(content),
      extendsElement: this.extractExtendsClause(content, className),
      docblock: this.extractDocblock(content, className),
    };
  }

  /**
   * Extract attribute names from static get observedAttributes() { return [...] }
   */
  private extractObservedAttributes(content: string): string[] {
    const match = content.match(/static\s+get\s+observedAttributes\s*\(\s*\)\s*\{[^}]*return\s*\[([^\]]*)\]/s);
    if (!match) return [];

    return match[1]
      .split(',')
      .map(attr => attr.trim().replace(/^['"`]|['"`]$/g, ''))
      .filter(Boolean);
  }

  /**
   * Extract property names from get/set accessor pairs or lone getters.
   */
  private extractProperties(content: string): WebComponentProperty[] {
    const properties: WebComponentProperty[] = [];
    const seen = new Set<string>();

    // Match get propertyName() and set propertyName(val) accessors
    const accessorRegex = /(?:get|set)\s+(\w+)\s*\(/g;
    let match;

    while ((match = accessorRegex.exec(content)) !== null) {
      const name = match[1];
      // Skip well-known static lifecycle callbacks — not instance properties
      if (name === 'observedAttributes') continue;

      if (!seen.has(name)) {
        seen.add(name);
        properties.push({ name });
      }
    }

    return properties;
  }

  /**
   * Extract custom event names from this.dispatchEvent(new CustomEvent('event-name')) calls.
   */
  private extractEvents(content: string): string[] {
    const events: string[] = [];
    const seen = new Set<string>();

    const eventRegex = /this\.dispatchEvent\(\s*new\s+CustomEvent\(\s*['"`]([^'"`]+)['"`]/g;
    let match;

    while ((match = eventRegex.exec(content)) !== null) {
      const name = match[1];
      if (!seen.has(name)) {
        seen.add(name);
        events.push(name);
      }
    }

    return events;
  }

  /**
   * Extract slot names from <slot> and <slot name="foo"> in template literals.
   * Returns '' for unnamed default slots, named values for named slots.
   */
  private extractSlots(content: string): string[] {
    const slots: string[] = [];
    const seen = new Set<string>();

    // Named slots: <slot name="foo"> or <slot name='foo'>
    const namedSlotRegex = /<slot\s+name=['"`]([^'"`]+)['"`]/gi;
    let match;

    while ((match = namedSlotRegex.exec(content)) !== null) {
      const name = match[1];
      if (!seen.has(name)) {
        seen.add(name);
        slots.push(name);
      }
    }

    // Unnamed (default) slots: <slot> or <slot />
    const defaultSlotRegex = /<slot(?:\s*\/?>|\s+[^n][^>]*>)/gi;
    if (defaultSlotRegex.test(content) && !seen.has('')) {
      seen.add('');
      slots.unshift('');
    }

    return slots;
  }

  /**
   * Extract the extends clause for the named class (e.g. HTMLElement, HTMLButtonElement).
   */
  private extractExtendsClause(content: string, className: string): string | undefined {
    const extendsRegex = new RegExp(
      `class\\s+${this.escapeRegex(className)}\\s+extends\\s+(\\w+)`
    );
    const match = content.match(extendsRegex);
    return match?.[1];
  }

  /**
   * Extract the JSDoc comment block immediately preceding the class definition.
   */
  private extractDocblock(content: string, className: string): string | undefined {
    // Look for /** ... */ block followed (possibly with whitespace) by class ClassName
    const docblockRegex = new RegExp(
      `(/\\*\\*[\\s\\S]*?\\*/)[\\s\\n]*(?:export\\s+)?(?:default\\s+)?class\\s+${this.escapeRegex(className)}(?:\\s|\\{)`
    );
    const match = content.match(docblockRegex);
    return match?.[1];
  }

  /**
   * Recursively walk a directory and return paths to all .es6.js and .w-c.es6.js files.
   */
  private async findComponentFiles(dir: string): Promise<string[]> {
    const results: string[] = [];

    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return results;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const nested = await this.findComponentFiles(fullPath);
        results.push(...nested);
      } else if (entry.isFile() && this.isComponentFile(entry.name)) {
        results.push(fullPath);
      }
    }

    return results;
  }

  /**
   * Return true if the filename matches .es6.js or .w-c.es6.js patterns.
   */
  private isComponentFile(name: string): boolean {
    return name.endsWith('.w-c.es6.js') || name.endsWith('.es6.js');
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
