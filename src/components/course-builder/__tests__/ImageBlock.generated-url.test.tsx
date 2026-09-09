import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageBlock } from '../block-editor/blocks/media/ImageBlock';

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), checkLimit: vi.fn(), incrementLimit: vi.fn(), toastError: vi.fn() }));
vi.mock('@/utils/safeInvoke', () => ({ safeInvoke: mocks.invoke }));
vi.mock('@/hooks/useAiGenerationLimit', () => ({ checkAiLimitGlobal: mocks.checkLimit, incrementAiLimitGlobal: mocks.incrementLimit }));
vi.mock('sonner', () => ({ toast: { error: mocks.toastError, success: vi.fn() } }));

const onUpdate = vi.fn();
beforeEach(() => {
  vi.clearAllMocks(); mocks.invoke.mockReset();
  mocks.checkLimit.mockResolvedValue(true); mocks.incrementLimit.mockResolvedValue(undefined);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function start() {
  render(<ImageBlock block={{ id: 'qa-image', type: 'image', content: '' }} onUpdate={onUpdate} />);
  fireEvent.click(screen.getByRole('button', { name: 'ИИ генерация' }));
  fireEvent.change(screen.getByPlaceholderText('Опишите изображение...'), { target: { value: 'QA описание' } });
  fireEvent.click(screen.getByRole('button', { name: 'Сгенерировать' }));
}

describe('ImageBlock generation validates its URL before updating or counting success', () => {
  it.each(['https://example.test/image.png', 'http://example.test/image.png', 'data:image/png;base64,aGVsbG8='])('accepts a supported primary URL: %s', async url => {
    mocks.invoke.mockResolvedValueOnce({ data: { url }, error: null });
    start(); await waitFor(() => expect(mocks.incrementLimit).toHaveBeenCalledTimes(1));
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledExactlyOnceWith({ imageSrc: url, imageAlt: 'QA описание' });
    expect(mocks.toastError).not.toHaveBeenCalled();
  });
  it('uses the existing fallback after an invalid primary URL', async () => {
    mocks.invoke.mockResolvedValueOnce({ data: { url: '   ' }, error: null });
    mocks.invoke.mockResolvedValueOnce({ data: { url: ' https://example.test/fallback.png ' }, error: null });
    start(); await waitFor(() => expect(mocks.incrementLimit).toHaveBeenCalledTimes(1));
    expect(mocks.invoke.mock.calls.map(call => call[0])).toEqual(['generate-block-image', 'generate-image']);
    expect(onUpdate).toHaveBeenCalledExactlyOnceWith({ imageSrc: 'https://example.test/fallback.png', imageAlt: 'QA описание' });
  });
  it.each([null, undefined, '', '   ', 42, {}, 'not-a-url', 'javascript:alert(1)', 'data:text/html,hello', 'data:image/png;base64,'])('rejects invalid primary and fallback values (%#)', async url => {
    mocks.invoke.mockResolvedValue({ data: { url }, error: null });
    start(); await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
    expect(onUpdate).not.toHaveBeenCalled();
    expect(mocks.incrementLimit).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('Опишите изображение...')).toHaveValue('QA описание');
  });
  it('does not update or count success on fallback provider error', async () => {
    mocks.invoke.mockResolvedValueOnce({ data: null, error: new Error('primary failed') });
    mocks.invoke.mockResolvedValueOnce({ data: null, error: new Error('fallback failed') });
    start(); await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
    expect(onUpdate).not.toHaveBeenCalled();
    expect(mocks.incrementLimit).not.toHaveBeenCalled();
  });
});
