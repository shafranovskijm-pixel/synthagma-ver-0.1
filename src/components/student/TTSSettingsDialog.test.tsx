import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getStoredTTSSettings, saveTTSSettings, TTSSettingsDialog } from './TTSSettingsDialog';
import { BROWSER_VOICES_WAIT_MS } from '@/lib/browserSpeech';

const voices = [
  { name: 'Анна', lang: 'ru-RU', voiceURI: 'ru-anna' },
  { name: 'Иван', lang: 'ru-RU', voiceURI: 'ru-ivan' },
] as SpeechSynthesisVoice[];
let available: SpeechSynthesisVoice[];
let synth: EventTarget & { getVoices: () => SpeechSynthesisVoice[] };
beforeEach(() => {
  localStorage.clear(); available = voices;
  synth = Object.assign(new EventTarget(), { getVoices: () => available });
  vi.stubGlobal('speechSynthesis', synth); vi.stubGlobal('SpeechSynthesisUtterance', class {});
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const settings = { provider: 'browser' as const, saluteVoice: 'Boris_24000' };

it('offers Russian browser voices in the existing dialog and persists the selected voice', async () => {
  const onChange = vi.fn(); const onOpenChange = vi.fn();
  render(<TTSSettingsDialog open onOpenChange={onOpenChange} settings={settings} onSettingsChange={onChange} />);
  fireEvent.keyDown(screen.getByLabelText('Русский голос'), { key: 'ArrowDown' });
  fireEvent.click(await screen.findByRole('option', { name: 'Иван' }));
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  expect(onChange).toHaveBeenCalledWith({ ...settings, browserVoiceURI: 'ru-ivan' });
  expect(getStoredTTSSettings()).toEqual({ ...settings, browserVoiceURI: 'ru-ivan' });
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

it('waits for asynchronous voices and explains an unavailable saved voice without changing it', () => {
  available = [];
  const stored = { ...settings, browserVoiceURI: 'another-device' }; saveTTSSettings(stored);
  render(<TTSSettingsDialog open onOpenChange={vi.fn()} settings={stored} onSettingsChange={vi.fn()} />);
  expect(screen.getByRole('status')).toHaveTextContent('Загружаем русские голоса');
  act(() => { available = voices; synth.dispatchEvent(new Event('voiceschanged')); });
  expect(screen.getByRole('status')).toHaveTextContent('Будет использован доступный русский голос');
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  expect(getStoredTTSSettings().browserVoiceURI).toBe('another-device');
});

it('shows a useful no-Russian-voice message rather than implying that speech is available', async () => {
  available = []; vi.useFakeTimers();
  render(<TTSSettingsDialog open onOpenChange={vi.fn()} settings={settings} onSettingsChange={vi.fn()} />);
  await act(async () => { await vi.advanceTimersByTimeAsync(BROWSER_VOICES_WAIT_MS); });
  expect(screen.getByRole('status')).toHaveTextContent('Русский голос не найден');
});

it('does not save a discarded voice selection', async () => {
  saveTTSSettings(settings);
  const onChange = vi.fn();
  render(<TTSSettingsDialog open onOpenChange={vi.fn()} settings={settings} onSettingsChange={onChange} />);
  fireEvent.keyDown(screen.getByLabelText('Русский голос'), { key: 'ArrowDown' });
  fireEvent.click(await screen.findByRole('option', { name: 'Анна' }));
  fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
  expect(onChange).not.toHaveBeenCalled();
  expect(getStoredTTSSettings().browserVoiceURI).toBeUndefined();
});
