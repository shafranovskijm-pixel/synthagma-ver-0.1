import { describe, expect, it } from 'vitest';
import { nativeStartupUrl } from './nativeNavigation';

describe('Capacitor hash routing bootstrap', () => {
  it('starts the installed application at sign-in', () => {
    expect(nativeStartupUrl({ pathname: '/', search: '', hash: '' })).toBe('/#/login');
    expect(nativeStartupUrl({ pathname: '/index.html', search: '', hash: '' })).toBe('/#/login');
  });

  it('keeps policy and registration paths, including their query parameters', () => {
    expect(nativeStartupUrl({ pathname: '/privacy', search: '', hash: '' })).toBe('/#/privacy');
    expect(nativeStartupUrl({ pathname: '/terms', search: '', hash: '' })).toBe('/#/terms');
    expect(nativeStartupUrl({ pathname: '/register-organization', search: '?module=driving-school', hash: '' }))
      .toBe('/#/register-organization?module=driving-school');
  });

  it('does not replace the current HashRouter route on resume or reload', () => {
    expect(nativeStartupUrl({ pathname: '/', search: '', hash: '#/student/course/123' })).toBeNull();
    expect(nativeStartupUrl({ pathname: '/', search: '', hash: '#access_token=example' })).toBeNull();
  });

  it('preserves encoded segments of nested ordinary links', () => {
    expect(nativeStartupUrl({ pathname: '/documents/test%2Fname', search: '?next=%2Fprivacy', hash: '' }))
      .toBe('/#/documents/test%2Fname?next=%2Fprivacy');
  });
});
