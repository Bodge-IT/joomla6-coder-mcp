import { SchemaIndex, TableSchema } from '../parser/sql-schema-parser.js';

export function formatTableSchema(table: TableSchema): string {
  const lines: string[] = [];

  lines.push(`## Table: \`${table.name}\``);
  if (table.comment) lines.push(`> ${table.comment}`);
  if (table.engine) lines.push(`**Engine:** ${table.engine}`);
  if (table.charset) lines.push(`**Charset:** ${table.charset}`);
  lines.push('');

  // Columns
  lines.push('### Columns');
  lines.push('');
  lines.push('| Column | Type | Nullable | Default | Auto | Comment |');
  lines.push('|--------|------|----------|---------|------|---------|');
  for (const col of table.columns) {
    lines.push(
      `| \`${col.name}\` | ${col.type} | ${col.nullable ? 'YES' : 'NO'} | ${col.defaultValue ?? '-'} | ${col.autoIncrement ? 'YES' : '-'} | ${col.comment ?? '-'} |`
    );
  }
  lines.push('');

  // Indexes
  if (table.indexes.length > 0) {
    lines.push('### Indexes');
    lines.push('');
    for (const idx of table.indexes) {
      const cols = idx.columns.map(c => `\`${c}\``).join(', ');
      lines.push(`- **${idx.name}** (${idx.type}): ${cols}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function formatSchemaList(schema: SchemaIndex): string {
  const lines: string[] = [];

  lines.push(`## Joomla 6 Database Schema`);
  lines.push(`Found ${schema.tables.length} tables`);
  lines.push('');

  // Group by prefix pattern
  const grouped = new Map<string, TableSchema[]>();
  for (const t of schema.tables) {
    const parts = t.shortName.split('_');
    const group = parts.length > 1 ? parts[0] : 'core';
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group)!.push(t);
  }

  for (const [group, tables] of [...grouped.entries()].sort()) {
    lines.push(`### ${group} (${tables.length} tables)`);
    for (const t of tables.sort((a, b) => a.shortName.localeCompare(b.shortName))) {
      const colCount = t.columns.length;
      lines.push(`- \`${t.name}\` — ${colCount} columns`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function lookupSchema(
  schema: SchemaIndex,
  input: { tableName?: string; component?: string; listAll?: boolean }
): string {
  if (input.listAll) {
    return formatSchemaList(schema);
  }

  if (input.tableName) {
    // Normalise: remove #__ prefix if present
    const normalised = input.tableName.replace(/^#__/, '');
    const table = schema.tableMap[normalised];
    if (table) {
      return formatTableSchema(table);
    }

    // Try partial match
    const matches = schema.tables.filter(t =>
      t.shortName.includes(normalised) || t.name.includes(input.tableName!)
    );
    if (matches.length === 1) {
      return formatTableSchema(matches[0]);
    }
    if (matches.length > 1) {
      const names = matches.map(t => `- \`${t.name}\``).join('\n');
      return `Multiple tables match "${input.tableName}":\n${names}`;
    }

    return `Table "${input.tableName}" not found in schema.`;
  }

  if (input.component) {
    // Component tables typically use the component name as prefix
    // e.g. com_content -> content_*, or just content
    const compName = input.component.replace(/^com_/, '');
    const matches = schema.tables.filter(t =>
      t.shortName.startsWith(compName + '_') || t.shortName === compName
    );

    if (matches.length === 0) {
      return `No tables found for component "${input.component}".`;
    }

    const lines: string[] = [];
    lines.push(`## Tables for ${input.component}`);
    lines.push('');
    for (const t of matches) {
      lines.push(formatTableSchema(t));
    }
    return lines.join('\n');
  }

  return 'Provide tableName, component, or listAll=true';
}
