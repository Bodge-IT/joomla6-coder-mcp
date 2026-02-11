import { describe, it, expect } from 'vitest';
import { search, formatSearchResults } from '../search.js';
import type { JoomlaIndex } from '../../parser/index-builder.js';
import type { ParsedClass } from '../../parser/php-parser.js';

function makeClass(name: string, ns: string, opts: Partial<ParsedClass> = {}): ParsedClass {
  return {
    name,
    namespace: ns,
    fqn: `${ns}\\${name}`,
    implements: [],
    methods: [],
    properties: [],
    constants: [],
    traits: [],
    isAbstract: false,
    isInterface: false,
    isTrait: false,
    filePath: `/src/${name}.php`,
    ...opts,
  };
}

function mockIndex(classes: ParsedClass[]): JoomlaIndex {
  return {
    version: '6.0-dev',
    lastSync: '2026-01-01',
    classes,
    namespaceMap: {},
    eventMap: {},
  };
}

describe('search', () => {
  const classes = [
    makeClass('ContentModel', 'Joomla\\CMS\\MVC\\Model', {
      methods: [
        { name: 'getItem', visibility: 'public', isStatic: false, isAbstract: false, parameters: [], returnType: 'object' },
        { name: 'getListQuery', visibility: 'protected', isStatic: false, isAbstract: false, parameters: [] },
      ],
      constants: [{ name: 'TABLE_NAME', value: "'#__content'", visibility: 'public' }],
    }),
    makeClass('ArticleTable', 'Joomla\\CMS\\Table'),
    makeClass('UserFactory', 'Joomla\\CMS\\User'),
  ];

  it('searches class names', () => {
    const index = mockIndex(classes);
    const result = search(index, { query: 'Content' });
    expect(result.results.some(r => r.name === 'ContentModel')).toBe(true);
  });

  it('searches method names', () => {
    const index = mockIndex(classes);
    const result = search(index, { query: 'getItem', type: 'method' });
    expect(result.results.length).toBe(1);
    expect(result.results[0].type).toBe('method');
  });

  it('searches constants', () => {
    const index = mockIndex(classes);
    const result = search(index, { query: 'TABLE_NAME', type: 'constant' });
    expect(result.results.length).toBe(1);
  });

  it('filters by type', () => {
    const index = mockIndex(classes);
    const result = search(index, { query: 'Content', type: 'class' });
    expect(result.results.every(r => r.type === 'class')).toBe(true);
  });

  it('defaults to limit of 10', () => {
    const manyClasses = Array.from({ length: 50 }, (_, i) =>
      makeClass(`TestClass${i}`, 'Joomla\\Test')
    );
    const index = mockIndex(manyClasses);
    const result = search(index, { query: 'Test' });
    expect(result.results.length).toBe(10);
    expect(result.total).toBe(50);
  });

  it('respects custom limit', () => {
    const index = mockIndex(classes);
    const result = search(index, { query: 'Content', limit: 1 });
    expect(result.results.length).toBe(1);
  });

  it('sorts exact matches first', () => {
    const index = mockIndex(classes);
    const result = search(index, { query: 'ArticleTable', type: 'class' });
    expect(result.results[0].name).toBe('ArticleTable');
  });
});

describe('formatSearchResults', () => {
  it('omits docblocks and signatures in non-verbose mode', () => {
    const output = {
      query: 'test',
      results: [{
        type: 'class' as const,
        name: 'TestClass',
        fqn: 'Joomla\\Test\\TestClass',
        docblock: 'Some documentation',
        signature: 'class TestClass extends Base',
      }],
      total: 1,
    };
    const text = formatSearchResults(output, false);
    expect(text).toContain('TestClass');
    expect(text).not.toContain('Some documentation');
    expect(text).not.toContain('extends Base');
  });

  it('includes docblocks and signatures in verbose mode', () => {
    const output = {
      query: 'test',
      results: [{
        type: 'class' as const,
        name: 'TestClass',
        fqn: 'Joomla\\Test\\TestClass',
        docblock: 'Some documentation',
        signature: 'class TestClass extends Base',
      }],
      total: 1,
    };
    const text = formatSearchResults(output, true);
    expect(text).toContain('Some documentation');
    expect(text).toContain('extends Base');
  });

  it('shows showing count when results are limited', () => {
    const output = {
      query: 'test',
      results: [{ type: 'class' as const, name: 'A', fqn: 'A' }],
      total: 50,
    };
    const text = formatSearchResults(output);
    expect(text).toContain('showing 1');
  });
});
