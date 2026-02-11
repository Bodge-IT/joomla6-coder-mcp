import { describe, it, expect } from 'vitest';
import { lookupClass, formatClassInfo, formatClassSummary } from '../lookup-class.js';
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

const testClass = makeClass('ContentModel', 'Joomla\\CMS\\MVC\\Model', {
  extends: 'BaseDatabaseModel',
  implements: ['ContentInterface'],
  methods: [
    { name: 'getItem', visibility: 'public', isStatic: false, isAbstract: false, parameters: [{ name: 'pk', type: 'int', isVariadic: false, isReference: false }], returnType: 'object', docblock: '/** Get an item */' },
    { name: 'getListQuery', visibility: 'protected', isStatic: false, isAbstract: false, parameters: [] },
    { name: 'save', visibility: 'public', isStatic: false, isAbstract: false, parameters: [{ name: 'data', type: 'array', isVariadic: false, isReference: false }], returnType: 'bool' },
  ],
  properties: [
    { name: 'table', visibility: 'public', isStatic: false, type: 'string' },
    { name: 'cache', visibility: 'protected', isStatic: false },
  ],
  constants: [{ name: 'VERSION', value: "'1.0'", visibility: 'public' }],
});

describe('lookupClass', () => {
  it('finds by exact class name', () => {
    const index = mockIndex([testClass]);
    const result = lookupClass(index, { className: 'ContentModel' });
    expect(result.found).toBe(true);
    expect(result.class?.name).toBe('ContentModel');
  });

  it('finds by FQN', () => {
    const index = mockIndex([testClass]);
    const result = lookupClass(index, { className: 'Joomla\\CMS\\MVC\\Model\\ContentModel' });
    expect(result.found).toBe(true);
  });

  it('finds by partial match (single result)', () => {
    const index = mockIndex([testClass]);
    const result = lookupClass(index, { className: 'Content' });
    expect(result.found).toBe(true);
  });

  it('returns suggestions for multiple partial matches', () => {
    const classes = [
      makeClass('ContentModel', 'Joomla\\CMS'),
      makeClass('ContentTable', 'Joomla\\CMS'),
    ];
    const index = mockIndex(classes);
    const result = lookupClass(index, { className: 'Content' });
    expect(result.found).toBe(false);
    expect(result.suggestions?.length).toBe(2);
  });

  it('finds a specific method', () => {
    const index = mockIndex([testClass]);
    const result = lookupClass(index, { className: 'ContentModel', methodName: 'getItem' });
    expect(result.found).toBe(true);
    expect(result.method?.name).toBe('getItem');
  });

  it('returns suggestions for method not found', () => {
    const index = mockIndex([testClass]);
    const result = lookupClass(index, { className: 'ContentModel', methodName: 'getXyz' });
    expect(result.found).toBe(true); // class found, method not
    expect(result.method).toBeUndefined();
  });

  it('returns not found for non-existent class', () => {
    const index = mockIndex([testClass]);
    const result = lookupClass(index, { className: 'NonExistent' });
    expect(result.found).toBe(false);
  });
});

describe('formatClassSummary', () => {
  it('includes class name and FQN', () => {
    const text = formatClassSummary(testClass);
    expect(text).toContain('ContentModel');
    expect(text).toContain('Joomla\\CMS\\MVC\\Model\\ContentModel');
  });

  it('lists method names without signatures', () => {
    const text = formatClassSummary(testClass);
    expect(text).toContain('getItem');
    expect(text).toContain('save');
    // Should not contain full signatures
    expect(text).not.toContain('int $pk');
  });

  it('lists property names', () => {
    const text = formatClassSummary(testClass);
    expect(text).toContain('$table');
  });

  it('lists constant names', () => {
    const text = formatClassSummary(testClass);
    expect(text).toContain('VERSION');
  });

  it('includes hint about full details', () => {
    const text = formatClassSummary(testClass);
    expect(text).toContain('summary=false');
  });

  it('is shorter than full format', () => {
    const summary = formatClassSummary(testClass);
    const full = formatClassInfo(testClass);
    expect(summary.length).toBeLessThan(full.length);
  });
});

describe('formatClassInfo', () => {
  it('includes full method signatures', () => {
    const text = formatClassInfo(testClass);
    expect(text).toContain('int $pk');
    expect(text).toContain(': object');
  });

  it('includes extends and implements', () => {
    const text = formatClassInfo(testClass);
    expect(text).toContain('BaseDatabaseModel');
    expect(text).toContain('ContentInterface');
  });

  it('separates public and protected methods', () => {
    const text = formatClassInfo(testClass);
    expect(text).toContain('### Public Methods');
    expect(text).toContain('### Protected Methods');
  });
});
