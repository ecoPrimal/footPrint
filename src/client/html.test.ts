import { describe, it, expect } from 'vitest';
import { escHtml } from './html.js';

describe('escHtml', () => {
  it('escapes ampersands', () => {
    expect(escHtml('a&b')).toBe('a&amp;b');
  });

  it('escapes angle brackets', () => {
    expect(escHtml('<script>')).toBe('&lt;script&gt;');
  });

  it('escapes double quotes', () => {
    expect(escHtml('"hello"')).toBe('&quot;hello&quot;');
  });

  it('escapes single quotes', () => {
    expect(escHtml("it's")).toBe("it&#39;s");
  });

  it('handles empty string', () => {
    expect(escHtml('')).toBe('');
  });

  it('passes through safe strings unchanged', () => {
    expect(escHtml('hello world 123')).toBe('hello world 123');
  });

  it('escapes all special chars together', () => {
    expect(escHtml('<a href="x&y">it\'s</a>')).toBe(
      '&lt;a href=&quot;x&amp;y&quot;&gt;it&#39;s&lt;/a&gt;'
    );
  });
});
