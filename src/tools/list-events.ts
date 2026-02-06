import { JoomlaIndex, EventInfo } from '../parser/index-builder.js';

export interface ListEventsInput {
  filter?: string;
  namespace?: string;
}

export interface ListEventsResult {
  events: EventInfo[];
  total: number;
  filtered: number;
}

export function listEvents(index: JoomlaIndex, input: ListEventsInput = {}): ListEventsResult {
  const { filter, namespace } = input;

  let events = Object.values(index.eventMap);
  const total = events.length;

  if (namespace) {
    const nsLower = namespace.toLowerCase();
    events = events.filter(e => e.class.toLowerCase().includes(nsLower));
  }

  if (filter) {
    const filterLower = filter.toLowerCase();
    events = events.filter(e =>
      e.name.toLowerCase().includes(filterLower) ||
      e.class.toLowerCase().includes(filterLower) ||
      (e.description && e.description.toLowerCase().includes(filterLower))
    );
  }

  return {
    events,
    total,
    filtered: events.length
  };
}

export function formatEventsResult(result: ListEventsResult): string {
  const lines: string[] = [];

  lines.push(`## Joomla 6 Events`);
  lines.push(`Showing ${result.filtered} of ${result.total} events`);
  lines.push('');

  if (result.events.length === 0) {
    lines.push('No events found matching the criteria.');
    return lines.join('\n');
  }

  // Group by namespace
  const grouped: Record<string, EventInfo[]> = {};
  for (const event of result.events) {
    const ns = event.class.split('\\').slice(0, -1).join('\\');
    if (!grouped[ns]) {
      grouped[ns] = [];
    }
    grouped[ns].push(event);
  }

  for (const [ns, events] of Object.entries(grouped).sort()) {
    lines.push(`### ${ns}`);
    lines.push('');

    for (const event of events.sort((a, b) => a.name.localeCompare(b.name))) {
      lines.push(`#### ${event.name}`);
      lines.push(`**Class:** \`${event.class}\``);

      if (event.parameters.length > 0) {
        lines.push(`**Parameters:**`);
        for (const param of event.parameters) {
          lines.push(`- \`${param}\``);
        }
      }

      if (event.description) {
        const desc = event.description
          .replace(/^\/\*\*\s*\n?/, '')
          .replace(/\n?\s*\*\/$/, '')
          .split('\n')
          .map(line => line.replace(/^\s*\*\s?/, ''))
          .join(' ')
          .trim()
          .substring(0, 200);
        lines.push(`${desc}${desc.length >= 200 ? '...' : ''}`);
      }

      lines.push('');
    }
  }

  return lines.join('\n');
}
