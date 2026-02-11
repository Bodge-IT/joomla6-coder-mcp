import { describe, it, expect } from 'vitest';
import { listEvents, formatEventsResult, formatEventsCompact } from '../list-events.js';
import type { JoomlaIndex, EventInfo } from '../../parser/index-builder.js';

function mockIndex(events: Record<string, EventInfo>): JoomlaIndex {
  return {
    version: '6.0-dev',
    lastSync: '2026-01-01',
    classes: [],
    namespaceMap: {},
    eventMap: events,
  };
}

const sampleEvents: Record<string, EventInfo> = {
  'Joomla\\CMS\\Event\\Content\\AfterSaveEvent': {
    name: 'AfterSaveEvent',
    class: 'Joomla\\CMS\\Event\\Content\\AfterSaveEvent',
    parameters: ['string $context', 'object $article', 'bool $isNew'],
    description: 'Triggered after content is saved',
  },
  'Joomla\\CMS\\Event\\Content\\BeforeSaveEvent': {
    name: 'BeforeSaveEvent',
    class: 'Joomla\\CMS\\Event\\Content\\BeforeSaveEvent',
    parameters: ['string $context', 'object $article'],
  },
  'Joomla\\CMS\\Event\\User\\LoginEvent': {
    name: 'LoginEvent',
    class: 'Joomla\\CMS\\Event\\User\\LoginEvent',
    parameters: ['array $options'],
  },
};

describe('listEvents', () => {
  it('returns all events with no filter', () => {
    const index = mockIndex(sampleEvents);
    const result = listEvents(index);
    expect(result.total).toBe(3);
    expect(result.filtered).toBe(3);
  });

  it('filters by name', () => {
    const index = mockIndex(sampleEvents);
    const result = listEvents(index, { filter: 'Login' });
    expect(result.filtered).toBe(1);
    expect(result.events[0].name).toBe('LoginEvent');
  });

  it('filters by namespace', () => {
    const index = mockIndex(sampleEvents);
    const result = listEvents(index, { namespace: 'Content' });
    expect(result.filtered).toBe(2);
  });

  it('applies limit', () => {
    const index = mockIndex(sampleEvents);
    const result = listEvents(index, { limit: 1 });
    expect(result.events.length).toBe(1);
    expect(result.filtered).toBe(3);
  });

  it('clamps limit to 100 max', () => {
    const index = mockIndex(sampleEvents);
    const result = listEvents(index, { limit: 500 });
    expect(result.events.length).toBe(3); // only 3 events exist
  });

  it('clamps limit to 1 min', () => {
    const index = mockIndex(sampleEvents);
    const result = listEvents(index, { limit: 0 });
    expect(result.events.length).toBe(1);
  });
});

describe('formatEventsResult', () => {
  it('shows compact format when summary=true', () => {
    const index = mockIndex(sampleEvents);
    const result = listEvents(index);
    const text = formatEventsResult(result, true);
    expect(text).toContain('compact');
    expect(text).toContain('AfterSaveEvent');
    expect(text).toContain('3 params');
  });

  it('shows full format when summary=false', () => {
    const index = mockIndex(sampleEvents);
    const result = listEvents(index);
    const text = formatEventsResult(result, false);
    expect(text).toContain('#### AfterSaveEvent');
    expect(text).toContain('**Parameters:**');
  });

  it('shows no results message when empty', () => {
    const index = mockIndex({});
    const result = listEvents(index);
    const text = formatEventsResult(result);
    expect(text).toContain('No events found');
  });
});

describe('formatEventsCompact', () => {
  it('shows event name, FQN, and param count', () => {
    const index = mockIndex(sampleEvents);
    const result = listEvents(index);
    const text = formatEventsCompact(result);
    expect(text).toContain('AfterSaveEvent');
    expect(text).toContain('Joomla\\CMS\\Event\\Content\\AfterSaveEvent');
    expect(text).toContain('3 params');
    expect(text).toContain('1 param)'); // LoginEvent has 1
  });

  it('shows truncation hint when limited', () => {
    const index = mockIndex(sampleEvents);
    const result = listEvents(index, { limit: 1 });
    const text = formatEventsCompact(result);
    expect(text).toContain('more events not shown');
  });
});
