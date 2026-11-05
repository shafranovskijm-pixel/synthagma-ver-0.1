import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ submit: vi.fn(), confirmed: vi.fn() }));
vi.mock('@/lib/support/videoProblemReport', () => ({submitVideoProblemReport: mocks.submit, validVideoReportContext: () => true,getConfirmedVideoReportId:mocks.confirmed}));
import { VideoProblemReportButton } from '../VideoProblemReportButton';
const context = {userId:'actor', courseId:'course', lessonId:'lesson'};
const failure = {backend:'kinescope' as const, stage:'provider-media', message:'private'};
beforeEach(() => {vi.clearAllMocks();mocks.confirmed.mockReturnValue(null);});
afterEach(cleanup);
describe('learner-initiated report', () => {
  it('does not send until clicked; simultaneous clicks create one call and show the persisted number', async () => {
    let finish!: (result: {id: string}) => void;
    mocks.submit.mockImplementation(() => new Promise(resolve => {finish=resolve;}));
    render(<VideoProblemReportButton context={context} failure={failure} />);
    expect(mocks.submit).not.toHaveBeenCalled();
    const button = screen.getByRole('button', {name:'Сообщить об ошибке видео'});
    fireEvent.click(button); fireEvent.click(button);
    expect(mocks.submit).toHaveBeenCalledTimes(1); expect(button).toBeDisabled();
    await act(async () => finish({id:'12345678-1234-4000-8000-123456789012'}));
    expect(screen.getByRole('status')).toHaveTextContent('12345678');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
  it('shows failure rather than success and permits an explicit retry', async () => {
    mocks.submit.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({id:'saved'});
    render(<VideoProblemReportButton context={context} failure={failure} />);
    fireEvent.click(screen.getByRole('button',{name:'Сообщить об ошибке видео'}));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Не удалось отправить'));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Сообщить об ошибке видео'}));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('saved'));
  });
  it('invalidates the pending context after the old lesson unmounts', () => {
    mocks.submit.mockReturnValue(new Promise(() => {}));
    const view = render(<VideoProblemReportButton context={context} failure={failure} />);
    fireEvent.click(screen.getByRole('button',{name:'Сообщить об ошибке видео'}));
    const isCurrent = mocks.submit.mock.calls[0][2]; expect(isCurrent()).toBe(true);
    view.unmount(); expect(isCurrent()).toBe(false);
  });
  it('keeps a confirmed receipt when the learning shell remounts', () => {
    mocks.confirmed.mockReturnValue('12345678-confirmed');
    render(<VideoProblemReportButton context={context} failure={failure} />);
    expect(screen.getByRole('status')).toHaveTextContent('12345678');
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
  it('sends an image only when explicitly chosen and reports an already-saved attachment honestly', async () => {
    mocks.submit.mockResolvedValue({id:'12345678',selectedScreenshotNotAdded:true});
    render(<VideoProblemReportButton context={context} failure={failure} />);
    const file=new File(['fake-png'], 'not-transmitted-original-name.png', {type:'image/png'});
    fireEvent.change(screen.getByLabelText('Скриншот ошибки видео'),{target:{files:[file]}});
    fireEvent.click(screen.getByRole('button',{name:'Сообщить об ошибке видео'}));
    expect(mocks.submit).toHaveBeenCalledWith(context,failure,expect.any(Function),file);
    await waitFor(()=>expect(screen.getByRole('status')).toBeInTheDocument());
    expect(screen.getByText(/Новое изображение не добавлялось/)).toBeInTheDocument();
  });
  it('rejects an unsupported selected file without sending it', () => {
    render(<VideoProblemReportButton context={context} failure={failure} />);
    fireEvent.change(screen.getByLabelText('Скриншот ошибки видео'),{target:{files:[new File(['document'], 'private.html', {type:'text/html'})]}});
    expect(screen.getByRole('alert')).toHaveTextContent('PNG, JPEG или WebP');
    expect(mocks.submit).not.toHaveBeenCalled();
  });
});
