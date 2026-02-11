import { describe, it, expect } from 'vitest';
import { truncateResponse } from '../response-utils.js';

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

  it('defaults to 50000 char limit', () => {
    const short = 'short text';
    expect(truncateResponse(short)).toBe(short);

    const long = 'line\n'.repeat(20000);
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
