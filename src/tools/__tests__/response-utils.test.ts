import { describe, it, expect, beforeEach } from 'vitest';
import { truncateResponse, sanitisePath, configureSanitiser } from '../response-utils.js';

describe('sanitisePath', () => {
  beforeEach(() => {
    configureSanitiser([
      '/home/user/mcp/cache/libraries',
      '/home/user/mcp/cache/libraries/libraries/src',
      '/home/user/mcp/cache/libraries/libraries/src/.intelephense-storage',
      '/home/user/mcp/cache/libraries/libraries/src/.mcp-virtual',
    ]);
  });

  it('strips cacheDir prefix', () => {
    expect(sanitisePath('/home/user/mcp/cache/libraries/installation/sql/mysql.sql'))
      .toBe('installation/sql/mysql.sql');
  });

  it('strips workspaceRoot prefix (most specific match)', () => {
    expect(sanitisePath('/home/user/mcp/cache/libraries/libraries/src/Foo/Bar.php'))
      .toBe('Foo/Bar.php');
  });

  it('strips intelephense storage prefix', () => {
    expect(sanitisePath('/home/user/mcp/cache/libraries/libraries/src/.intelephense-storage/stubs/some.php'))
      .toBe('stubs/some.php');
  });

  it('strips virtual file dir prefix', () => {
    expect(sanitisePath('/home/user/mcp/cache/libraries/libraries/src/.mcp-virtual/virtual_abc123.php'))
      .toBe('virtual_abc123.php');
  });

  it('normalises Windows backslash paths with configured prefixes', () => {
    configureSanitiser([
      'C:\\Users\\dev\\mcp\\cache\\libraries',
      'C:\\Users\\dev\\mcp\\cache\\libraries\\libraries\\src',
    ]);
    expect(sanitisePath('C:\\Users\\dev\\mcp\\cache\\libraries\\libraries\\src\\Foo.php'))
      .toBe('Foo.php');
    expect(sanitisePath('C:\\Users\\dev\\mcp\\cache\\libraries\\installation\\sql\\mysql.sql'))
      .toBe('installation/sql/mysql.sql');
  });

  it('normalises Windows backslash paths via legacy fallback', () => {
    configureSanitiser([]);
    expect(sanitisePath('C:\\Users\\dev\\mcp\\cache\\libraries\\libraries\\src\\Foo.php'))
      .toBe('libraries/src/Foo.php');
  });

  it('falls back to legacy marker when unconfigured', () => {
    configureSanitiser([]);
    expect(sanitisePath('/some/other/path/cache/libraries/libraries/src/Foo.php'))
      .toBe('libraries/src/Foo.php');
  });

  it('returns path unchanged when no prefix matches', () => {
    expect(sanitisePath('relative/path/Foo.php'))
      .toBe('relative/path/Foo.php');
  });

  it('returns path unchanged for unrelated absolute paths', () => {
    expect(sanitisePath('/etc/something/unrelated.php'))
      .toBe('/etc/something/unrelated.php');
  });
});

describe('truncateResponse', () => {
  it('returns text unchanged when under limit', () => {
    const text = 'Hello world';
    expect(truncateResponse(text, 100)).toBe(text);
  });

  it('truncates at newline boundary', () => {
    const text = 'line1\nline2\nline3\nline4';
    const result = truncateResponse(text, 12);
    expect(result).toContain('line1\nline2');
    expect(result).toContain('Response truncated');
    expect(result).not.toContain('line3');
  });

  it('uses hard cutoff when no newline found', () => {
    const text = 'a'.repeat(200);
    const result = truncateResponse(text, 100);
    expect(result.length).toBeLessThan(250); // truncated + hint
    expect(result).toContain('Response truncated');
  });

  it('defaults to 20000 char limit', () => {
    const short = 'short text';
    expect(truncateResponse(short)).toBe(short);

    const long = 'line\n'.repeat(8000);
    const result = truncateResponse(long);
    expect(result.length).toBeLessThan(long.length);
    expect(result).toContain('Response truncated');
  });

  it('appends filter hint on truncation', () => {
    const text = 'a\nb\nc\nd\ne';
    const result = truncateResponse(text, 3);
    expect(result).toContain('Use filters or parameters to narrow results');
  });
});
