import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SliderLessonViewer, parseSliderContent } from '../SliderLessonViewer';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('slider content memoization', () => {
  it('parses the same content once across parent renders and slide navigation, then updates for new content', () => {
    const content = JSON.stringify({ slides: [{ id: 'a', title: 'First slide', content: '<p>First body</p>' }, { id: 'b', title: 'Second slide', content: '<p>Second body</p>' }] });
    const updated = JSON.stringify({ slides: [{ id: 'a', content: 'New first' }, { id: 'b', title: 'Updated second', content: 'New body' }] });
    const parse = vi.spyOn(JSON, 'parse');
    const view = render(<SliderLessonViewer content={content} title="Original title" lessonIndex={0} isMobile={false} />);
    const calls = (value: string) => parse.mock.calls.filter(([arg]) => arg === value).length;
    expect(screen.getByText('First slide')).toBeInTheDocument(); expect(calls(content)).toBe(1);
    view.rerender(<SliderLessonViewer content={content} title="Changed title" lessonIndex={0} isMobile />);
    fireEvent.click(screen.getByRole('button', { name: 'Далее' }));
    expect(screen.getByText('Second slide')).toBeInTheDocument(); expect(calls(content)).toBe(1);
    view.rerender(<SliderLessonViewer content={updated} title="Changed title" lessonIndex={0} isMobile />);
    expect(screen.getByText('Updated second')).toBeInTheDocument(); expect(calls(updated)).toBe(1);
  });

  it('preserves old array/object formats and the empty malformed-content fallback', () => {
    const slides = [{ id: 'one', content: 'One' }];
    expect(parseSliderContent(JSON.stringify(slides))).toEqual({ slides });
    expect(parseSliderContent(JSON.stringify({ slides, pptxFileUrl: 'https://example.invalid/slides.pptx' }))).toEqual({ slides, pptxFileUrl: 'https://example.invalid/slides.pptx' });
    render(<SliderLessonViewer content="{broken" title="Malformed" lessonIndex={0} isMobile={false} />);
    expect(screen.getByText('Презентация не загружена')).toBeInTheDocument();
  });
});
