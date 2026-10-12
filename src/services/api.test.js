import { describe, it, expect } from 'vitest';
import { resolveApiBase } from './api';

describe('resolveApiBase', () => {
  it('uses port 3001 on the host that served the page, so a phone on the same network reaches it', () => {
    expect(resolveApiBase({}, { protocol: 'http:', hostname: 'localhost' })).toBe('http://localhost:3001/api');
    expect(resolveApiBase({}, { protocol: 'http:', hostname: '192.168.1.20' })).toBe('http://192.168.1.20:3001/api');
  });

  it('lets VITE_API_BASE override it, ignoring a trailing slash', () => {
    expect(resolveApiBase({ VITE_API_BASE: 'https://api.example.com/api/' }, { protocol: 'http:', hostname: 'x' })).toBe('https://api.example.com/api');
  });

  it('falls back to localhost without a usable location', () => {
    expect(resolveApiBase({}, null)).toBe('http://localhost:3001/api');
    expect(resolveApiBase({}, { protocol: 'file:', hostname: '' })).toBe('http://localhost:3001/api');
  });
});
