import { describe, expect, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({ value: 'android', native: true }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => platform.native, getPlatform: () => platform.value },
  registerPlugin: () => ({}),
}));
import { isNativeSpeechPlatform, nativeSpeechMessage, resolveTTSProvider } from './nativeSpeech';

describe('native speech availability and provider selection', () => {
  it('enables the Android bridge only inside the Android application', () => {
    expect(isNativeSpeechPlatform()).toBe(true);
    platform.value = 'ios';
    expect(isNativeSpeechPlatform()).toBe(false);
    platform.value = 'android';
    platform.native = false;
    expect(isNativeSpeechPlatform()).toBe(false);
    platform.native = true;
  });
  it('uses device speech on Android without silently selecting a paid cloud provider', () => {
    expect(resolveTTSProvider('browser', true, true)).toBe('native');
    expect(resolveTTSProvider('salutespeech', true, false)).toBe('native');
    expect(resolveTTSProvider(undefined, true, false)).toBe('native');
    expect(resolveTTSProvider('salutespeech', true, true)).toBe('salutespeech');
  });

  it('preserves browser behavior outside the native application', () => {
    expect(resolveTTSProvider('browser', false, true)).toBe('browser');
    expect(resolveTTSProvider('native', false, true)).toBe('browser');
    expect(resolveTTSProvider(undefined, false, false)).toBe('salutespeech');
  });

  it('distinguishes a missing engine from a missing installed Russian voice', () => {
    expect(nativeSpeechMessage({ available: false, reason: 'no_engine' })).toContain('не установлен синтезатор');
    expect(nativeSpeechMessage({ available: false, reason: 'missing_voice' })).toContain('Нет установленного русского голоса');
    expect(nativeSpeechMessage({ available: false, reason: 'init_failed' })).toContain('Не удалось запустить');
  });
});
