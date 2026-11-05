import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ submit: vi.fn() }));
vi.mock('@/lib/support/videoProblemReport', () => ({submitVideoProblemReport: mocks.submit, validVideoReportContext: () => true}));
import { VideoProblemReportButton } from '../VideoProblemReportButton';
const context = {userId:'actor', courseId:'course', lessonId:'lesson'};
const failure = {backend:'kinescope' as const, stage:'provider-media', message:'private'};
beforeEach(() => {vi.clearAllMocks();});
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
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Не удалось отправить'));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('saved'));
  });
  it('invalidates the pending context after the old lesson unmounts', () => {
    mocks.submit.mockReturnValue(new Promise(() => {}));
    const view = render(<VideoProblemReportButton context={context} failure={failure} />);
    fireEvent.click(screen.getByRole('button'));
    const isCurrent = mocks.submit.mock.calls[0][2]; expect(isCurrent()).toBe(true);
    view.unmount(); expect(isCurrent()).toBe(false);
  });
});
