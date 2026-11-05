import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ submit: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({supabase:{}}));
vi.mock('@/lib/support/videoProblemReport', async importOriginal => ({...await importOriginal<typeof import('@/lib/support/videoProblemReport')>(), submitVideoProblemReport:mocks.submit}));
import { VideoPlayerInline } from '../VideoPlayerInline';
const context = { userId:'10000000-0000-4000-8000-000000000001', courseId:'20000000-0000-4000-8000-000000000001', lessonId:'30000000-0000-4000-8000-000000000001' };
afterEach(() => {cleanup(); vi.clearAllMocks();});
describe('learner report context wiring', () => {
  it('submits only the current learner/lesson and invalidates a pending old lesson after navigation', () => {
    mocks.submit.mockReturnValue(new Promise(() => {}));
    const complete = vi.fn(); const progress = vi.fn();
    const view = render(<VideoPlayerInline {...context} content="https://example.invalid/private.mp4?token=secret" onVideoComplete={complete} onProgressChange={progress} />);
    fireEvent.error(view.container.querySelector('video')!);
    expect(mocks.submit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'Сообщить об ошибке видео'}));
    expect(mocks.submit).toHaveBeenCalledWith(context, expect.objectContaining({backend:'native'}), expect.any(Function));
    const previousCurrent = mocks.submit.mock.calls[0][2];
    view.rerender(<VideoPlayerInline {...context} lessonId="30000000-0000-4000-8000-000000000002" content="https://example.invalid/private.mp4?token=secret" />);
    expect(previousCurrent()).toBe(false);
    expect(screen.getByRole('button',{name:'Сообщить об ошибке видео'})).toBeEnabled();
    expect(progress).not.toHaveBeenCalled(); expect(complete).not.toHaveBeenCalled();
  });
  it('does not offer a report without a genuine learner context', () => {
    const view = render(<VideoPlayerInline content="https://example.invalid/private.mp4" />);
    fireEvent.error(view.container.querySelector('video')!);
    expect(screen.queryByRole('button',{name:'Сообщить об ошибке видео'})).not.toBeInTheDocument();
  });
});
