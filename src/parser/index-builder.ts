import * as fs from 'fs/promises';
import * as path from 'path';
import { PhpParser, ParsedClass } from './php-parser.js';

export interface JoomlaIndex {
  version: string;
  lastSync: string;
  commit?: string;
  classes: ParsedClass[];
  namespaceMap: Record<string, string[]>;
  eventMap: Record<string, EventInfo>;
}

export interface EventInfo {
  name: string;
  class: string;
  parameters: string[];
  description?: string;
}

export class IndexBuilder {
  private parser: PhpParser;

  constructor() {
    this.parser = new PhpParser();
  }

  async buildIndex(librariesPath: string, commit?: string, branch?: string): Promise<JoomlaIndex> {
    const classes: ParsedClass[] = [];
    const phpFiles = await this.findPhpFiles(librariesPath);

    console.log(`Found ${phpFiles.length} PHP files to parse...`);

    for (const file of phpFiles) {
      const parsed = await this.parser.parseFile(file);
      classes.push(...parsed);
    }

    console.log(`Parsed ${classes.length} classes/interfaces/traits`);

    const namespaceMap = this.buildNamespaceMap(classes);
    const eventMap = this.buildEventMap(classes);

    return {
      version: branch || 'unknown',
      lastSync: new Date().toISOString(),
      commit,
      classes,
      namespaceMap,
      eventMap
    };
  }

  private async findPhpFiles(dir: string): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          const subFiles = await this.findPhpFiles(fullPath);
          files.push(...subFiles);
        } else if (entry.isFile() && entry.name.endsWith('.php')) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      console.error(`Error scanning directory ${dir}:`, error);
    }

    return files;
  }

  private buildNamespaceMap(classes: ParsedClass[]): Record<string, string[]> {
    const map: Record<string, string[]> = {};

    for (const cls of classes) {
      if (!cls.namespace) continue;

      if (!map[cls.namespace]) {
        map[cls.namespace] = [];
      }
      map[cls.namespace].push(cls.name);
    }

    return map;
  }

  private buildEventMap(classes: ParsedClass[]): Record<string, EventInfo> {
    const map: Record<string, EventInfo> = {};

    // Exclusion list for false positives
    const EVENT_EXCLUSIONS = new Set([
      'EventManager', 'EventManagerInterface',
      'EventListener', 'EventListenerInterface',
      'EventSubscriber', 'EventSubscriberInterface',
      'EventDispatcher', 'EventDispatcherInterface',
      'EventAwareInterface', 'EventAwareTrait',
    ]);

    const eventClasses = classes.filter(cls => {
      // Skip known non-event classes
      if (EVENT_EXCLUSIONS.has(cls.name)) return false;

      // Must satisfy namespace condition: namespace contains \Event\ segment or ends with \Event
      const nsHasEvent = /\\Event\\/.test(cls.namespace) || cls.namespace.endsWith('\\Event');

      // Must also satisfy at least one of:
      // - Extends an Event base class
      // - Name ends with 'Event'
      const extendsEvent = cls.extends?.endsWith('Event') === true ||
                           cls.extends?.includes('AbstractEvent') === true;
      const nameIsEvent = cls.name.endsWith('Event');

      return nsHasEvent && (extendsEvent || nameIsEvent);
    });

    for (const cls of eventClasses) {
      const constructorMethod = cls.methods.find(m => m.name === '__construct');
      const parameters = constructorMethod?.parameters.map(p => {
        let param = p.name;
        if (p.type) param = `${p.type} $${param}`;
        else param = `$${param}`;
        if (p.defaultValue) param += ` = ${p.defaultValue}`;
        return param;
      }) || [];

      map[cls.fqn] = {
        name: cls.name,
        class: cls.fqn,
        parameters,
        description: cls.docblock
      };
    }

    return map;
  }

  async saveIndex(index: JoomlaIndex, outputPath: string): Promise<void> {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(index, null, 2));
    console.log(`Index saved to ${outputPath}`);
  }

  async loadIndex(indexPath: string): Promise<JoomlaIndex | null> {
    try {
      const content = await fs.readFile(indexPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }
}
