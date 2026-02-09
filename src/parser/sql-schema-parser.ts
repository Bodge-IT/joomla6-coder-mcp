/**
 * Parses Joomla installation SQL files to extract table schemas.
 * Handles CREATE TABLE statements from installation/sql/*.sql files.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export interface ColumnDefinition {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue?: string;
  autoIncrement: boolean;
  comment?: string;
}

export interface IndexDefinition {
  name: string;
  type: 'PRIMARY' | 'UNIQUE' | 'INDEX' | 'FULLTEXT';
  columns: string[];
}

export interface TableSchema {
  name: string;         // e.g. "#__content"
  shortName: string;    // e.g. "content"
  columns: ColumnDefinition[];
  indexes: IndexDefinition[];
  engine?: string;
  charset?: string;
  comment?: string;
}

export interface SchemaIndex {
  tables: TableSchema[];
  tableMap: Map<string, TableSchema>;  // keyed by shortName
}

export class SqlSchemaParser {
  /**
   * Parse all SQL files in a directory and return the combined schema.
   */
  async parseDirectory(sqlDir: string): Promise<SchemaIndex> {
    const tables: TableSchema[] = [];

    try {
      const entries = await fs.readdir(sqlDir, { withFileTypes: true });
      const sqlFiles = entries
        .filter(e => e.isFile() && e.name.endsWith('.sql'))
        .map(e => path.join(sqlDir, e.name));

      for (const file of sqlFiles) {
        const content = await fs.readFile(file, 'utf-8');
        const parsed = this.parseSql(content);
        tables.push(...parsed);
      }
    } catch (e) {
      console.error('Error reading SQL directory:', e);
    }

    const tableMap = new Map<string, TableSchema>();
    for (const t of tables) {
      tableMap.set(t.shortName, t);
    }

    return { tables, tableMap };
  }

  /**
   * Parse CREATE TABLE statements from SQL content.
   */
  parseSql(content: string): TableSchema[] {
    const tables: TableSchema[] = [];

    // Match CREATE TABLE statements (may span multiple lines)
    const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?([^`\s(]+)`?\s*\(([\s\S]*?)\)([^;]*);/gi;

    let match;
    while ((match = createTableRegex.exec(content)) !== null) {
      const tableName = match[1];
      const body = match[2];
      const suffix = match[3];

      const shortName = tableName.replace(/^#__/, '');

      const columns: ColumnDefinition[] = [];
      const indexes: IndexDefinition[] = [];

      // Split body by commas, but respect parentheses
      const parts = this.splitTableBody(body);

      for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;

        const idx = this.parseIndex(trimmed);
        if (idx) {
          indexes.push(idx);
          continue;
        }

        const col = this.parseColumn(trimmed);
        if (col) {
          columns.push(col);
        }
      }

      // Parse table options from suffix
      const engineMatch = suffix.match(/ENGINE\s*=\s*(\w+)/i);
      const charsetMatch = suffix.match(/(?:DEFAULT\s+)?CHARSET\s*=\s*(\w+)/i);
      const commentMatch = suffix.match(/COMMENT\s*=\s*'([^']*)'/i);

      tables.push({
        name: tableName,
        shortName,
        columns,
        indexes,
        engine: engineMatch?.[1],
        charset: charsetMatch?.[1],
        comment: commentMatch?.[1],
      });
    }

    return tables;
  }

  private splitTableBody(body: string): string[] {
    const parts: string[] = [];
    let current = '';
    let depth = 0;

    for (const char of body) {
      if (char === '(') depth++;
      else if (char === ')') depth--;
      else if (char === ',' && depth === 0) {
        parts.push(current);
        current = '';
        continue;
      }
      current += char;
    }
    if (current.trim()) parts.push(current);

    return parts;
  }

  private parseColumn(definition: string): ColumnDefinition | null {
    // Match: `column_name` type(...) [NOT NULL] [DEFAULT ...] [AUTO_INCREMENT] [COMMENT '...']
    const colMatch = definition.match(/^`?(\w+)`?\s+(\w+(?:\([^)]*\))?(?:\s+(?:unsigned|signed))?)/i);
    if (!colMatch) return null;

    const name = colMatch[1];
    const type = colMatch[2];

    // Skip keywords that look like columns but aren't
    const keywords = ['PRIMARY', 'KEY', 'INDEX', 'UNIQUE', 'FULLTEXT', 'CONSTRAINT', 'FOREIGN', 'CHECK'];
    if (keywords.includes(name.toUpperCase())) return null;

    const nullable = !/NOT\s+NULL/i.test(definition);
    const autoIncrement = /AUTO_INCREMENT/i.test(definition);

    let defaultValue: string | undefined;
    const defaultMatch = definition.match(/DEFAULT\s+('(?:[^'\\]|\\.)*'|NULL|\d+(?:\.\d+)?|CURRENT_TIMESTAMP(?:\(\))?)/i);
    if (defaultMatch) {
      defaultValue = defaultMatch[1];
    }

    let comment: string | undefined;
    const commentMatch = definition.match(/COMMENT\s+'([^']*)'/i);
    if (commentMatch) {
      comment = commentMatch[1];
    }

    return { name, type, nullable, defaultValue, autoIncrement, comment };
  }

  private parseIndex(definition: string): IndexDefinition | null {
    // PRIMARY KEY
    const pkMatch = definition.match(/^PRIMARY\s+KEY\s*\(([^)]+)\)/i);
    if (pkMatch) {
      return {
        name: 'PRIMARY',
        type: 'PRIMARY',
        columns: this.parseIndexColumns(pkMatch[1]),
      };
    }

    // UNIQUE KEY/INDEX
    const uniqueMatch = definition.match(/^UNIQUE\s+(?:KEY|INDEX)\s+`?(\w+)`?\s*\(([^)]+)\)/i);
    if (uniqueMatch) {
      return {
        name: uniqueMatch[1],
        type: 'UNIQUE',
        columns: this.parseIndexColumns(uniqueMatch[2]),
      };
    }

    // FULLTEXT KEY/INDEX
    const ftMatch = definition.match(/^FULLTEXT\s+(?:KEY|INDEX)\s+`?(\w+)`?\s*\(([^)]+)\)/i);
    if (ftMatch) {
      return {
        name: ftMatch[1],
        type: 'FULLTEXT',
        columns: this.parseIndexColumns(ftMatch[2]),
      };
    }

    // Regular KEY/INDEX
    const idxMatch = definition.match(/^(?:KEY|INDEX)\s+`?(\w+)`?\s*\(([^)]+)\)/i);
    if (idxMatch) {
      return {
        name: idxMatch[1],
        type: 'INDEX',
        columns: this.parseIndexColumns(idxMatch[2]),
      };
    }

    return null;
  }

  private parseIndexColumns(columnList: string): string[] {
    return columnList
      .split(',')
      .map(c => c.trim().replace(/`/g, '').replace(/\(\d+\)/, ''))
      .filter(Boolean);
  }
}
