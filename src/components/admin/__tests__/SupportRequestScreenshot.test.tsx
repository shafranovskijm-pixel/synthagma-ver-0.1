import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ from: vi.fn(), sign: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { storage: { from: mocks.from } } }));
import { SupportRequestScreenshot } from '../SupportRequestScreenshot';
import { buildSupportScreenshotReference } from '@/lib/support/supportScreenshotReference';

const userId = '10000000-0000-4000-8000-000000000001';
const requestId = '20000000-0000-4000-8000-000000000002';
const built = buildSupportScreenshotReference(userId, requestId, 'a'.repeat(64), 'image/png');
const props = { reference: built.reference, userId, requestId };
const signedUrl = 'https://private.example.invalid/storage/v1/object/sign/student-documents/screenshot.png?token=temporary';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockReturnValue({ createSignedUrl: mocks.sign });
  mocks.sign.mockResolvedValue({ data: { signedUrl }, error: null });
});
afterEach(cleanup);

describe('admin request-bound screenshot viewer', () => {
  it('signs only the validated private path for five minutes and displays the image', async () => {
    render(<SupportRequestScreenshot {...props} />);
    await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('src', signedUrl));
    expect(mocks.from).toHaveBeenCalledWith('student-documents');
    expect(mocks.sign).toHaveBeenCalledWith(built.path, 300);
    expect(screen.getByRole('img')).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByText(signedUrl)).not.toBeInTheDocument();
  });

  it('obtains a fresh URL after remount without persisting the temporary URL in browser storage', async () => {
    const persisted = vi.spyOn(Storage.prototype, 'setItem');
    try {
      const view = render(<SupportRequestScreenshot {...props} />);
      await screen.findByRole('img');
      view.unmount();
      mocks.sign.mockResolvedValueOnce({ data: { signedUrl: `${signedUrl}-fresh` }, error: null });
      render(<SupportRequestScreenshot {...props} />);
      await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('src', `${signedUrl}-fresh`));
      expect(mocks.sign).toHaveBeenCalledTimes(2);
      expect(persisted).not.toHaveBeenCalled();
    } finally { persisted.mockRestore(); }
  });

  it.each([
    { ...props, userId: requestId }, { ...props, requestId: userId },
    { ...props, reference: `${built.reference}?token=secret` },
    { ...props, reference: built.reference.replace('student-documents', 'org-documents') },
    { ...props, reference: built.reference.replace('support/', 'support/../') },
  ])('never signs a malformed or foreign user/request reference', invalid => {
    render(<SupportRequestScreenshot {...invalid} />);
    expect(screen.getByRole('alert')).toHaveTextContent('не соответствует');
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.sign).not.toHaveBeenCalled();
  });

  it('ignores a stale signing response after the displayed request changes', async () => {
    let finishOld!: (value: { data: { signedUrl: string }; error: null }) => void;
    mocks.sign.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }));
    const view = render(<SupportRequestScreenshot {...props} />);
    const nextRequestId = '30000000-0000-4000-8000-000000000003';
    const next = buildSupportScreenshotReference(userId, nextRequestId, 'b'.repeat(64), 'image/jpeg');
    view.rerender(<SupportRequestScreenshot reference={next.reference} userId={userId} requestId={nextRequestId} />);
    await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('src', signedUrl));
    await act(async () => finishOld({ data: { signedUrl: 'https://old.example.invalid/?token=old' }, error: null }));
    expect(screen.getByRole('img')).toHaveAttribute('src', signedUrl);
    expect(mocks.sign).toHaveBeenLastCalledWith(next.path, 300);
  });

  it('removes a previous image immediately when its new context is invalid', async () => {
    const view = render(<SupportRequestScreenshot {...props} />);
    await screen.findByRole('img');
    view.rerender(<SupportRequestScreenshot {...props} requestId={userId} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(mocks.sign).toHaveBeenCalledTimes(1);
  });

  it('does not render or request again when an in-flight signing finishes after unmount', async () => {
    let finish!: (value: { data: { signedUrl: string }; error: null }) => void;
    mocks.sign.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const view = render(<SupportRequestScreenshot {...props} />);
    view.unmount();
    await act(async () => finish({ data: { signedUrl }, error: null }));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(mocks.sign).toHaveBeenCalledTimes(1);
  });

  it('shows an honest signing failure and signs again only after an explicit retry', async () => {
    mocks.sign.mockRejectedValueOnce(new Error('private transport details'));
    render(<SupportRequestScreenshot {...props} />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Не удалось загрузить'));
    expect(screen.queryByText('private transport details')).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить скриншот снова' }));
    await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('src', signedUrl));
    expect(mocks.sign).toHaveBeenCalledTimes(2);
  });

  it('drops a broken/expired image and obtains a new URL on retry', async () => {
    mocks.sign.mockResolvedValueOnce({ data: { signedUrl }, error: null })
      .mockResolvedValueOnce({ data: { signedUrl: `${signedUrl}-new` }, error: null });
    render(<SupportRequestScreenshot {...props} />);
    fireEvent.error(await screen.findByRole('img'));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось загрузить');
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить скриншот снова' }));
    await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('src', `${signedUrl}-new`));
  });

  it.each([
    { data: null, error: { message: 'not allowed' } },
    { data: { signedUrl: '' }, error: null },
    { data: { signedUrl: 'javascript:alert(1)' }, error: null },
    { data: { signedUrl: 'https://user:pass@example.invalid/image' }, error: null },
  ])('does not display missing, rejected or unsafe signing results', async result => {
    mocks.sign.mockResolvedValueOnce(result);
    render(<SupportRequestScreenshot {...props} />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
