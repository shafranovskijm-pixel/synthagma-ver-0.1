import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CoursePreviewView } from '../CoursePreviewView';

type ContentResponse = { data: { content: string | null } | null; error: Error | null };
const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  lessons: [] as { id: string; title: string; type: string; order_index: number }[],
  contents: new Map<string, () => Promise<ContentResponse>>(),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'synthetic-user' } }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mocks.from } }));
vi.mock('@/components/course-learning/FilePreviewDialog', () => ({ FilePreviewDialog: () => null }));

// Real preview hook, query cache and view; only the database is replaced.
class Query {
  columns = '';
  id = '';
  constructor(private table: string) {}
  select(columns: string) { this.columns = columns; return this; }
  eq(column: string, value: string) { if (column === 'id') this.id = value; return this; }
  in() { return this; }
  order() { return this; }
  single() { return this.response(); }
  maybeSingle() { return this.response(); }
  then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
    return this.response().then(resolve, reject);
  }
  response(): Promise<unknown> {
    if (this.table === 'lessons' && this.columns === 'content') {
      const reply = mocks.contents.get(this.id);
      if (!reply) throw new Error(`Unexpected content read: ${this.id}`);
      return reply();
    }
    const data = this.table === 'courses' ? { id: 'course-a', title: 'Учебный курс', is_published: false }
      : this.table === 'lessons' ? mocks.lessons : [];
    return Promise.resolve({ data, error: null });
  }
}

function deferred() {
  let resolve!: (response: ContentResponse) => void;
  const promise = new Promise<ContentResponse>(res => { resolve = res; });
  return { promise, resolve };
}
const successful = (content: string | null): ContentResponse => ({ data: { content }, error: null });
let client: QueryClient;
const originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo');
function renderPreview() {
  return render(<QueryClientProvider client={client}><MemoryRouter>
    <CoursePreviewView courseId="course-a" embedded />
  </MemoryRouter></QueryClientProvider>);
}
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  mocks.lessons = [{ id: 'lecture-a', title: 'Лекция 1', type: 'text', order_index: 0 }];
  mocks.contents.clear();
  mocks.from.mockImplementation(table => new Query(table));
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
});
afterEach(() => {
  cleanup(); client.clear(); vi.restoreAllMocks();
  if (originalScrollTo) Object.defineProperty(HTMLElement.prototype, 'scrollTo', originalScrollTo);
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
});

describe('lazy lesson content in preview', () => {
  it.each(['text', 'homework'])('shows loading until the actual %s content arrives', async type => {
    mocks.lessons[0].type = type;
    const content = deferred();
    mocks.contents.set('lecture-a', () => content.promise);
    renderPreview();
    expect(await screen.findByRole('status')).toHaveTextContent('Загрузка содержимого урока');
    expect(screen.queryByText('Контент урока пуст')).toBeNull();
    expect(screen.queryByText(/Содержимое задания недоступно/)).toBeNull();
    await act(async () => content.resolve(successful('Полный учебный текст.')));
    expect(await screen.findByText('Полный учебный текст.')).toBeInTheDocument();
    expect(screen.queryByText('Загрузка содержимого урока...')).toBeNull();
  });

  it.each([
    { data: null, error: new Error('Synthetic read failure') },
    { data: null, error: null },
  ])('does not label an error or missing row as empty, and retries explicitly %#', async failure => {
    mocks.contents.set('lecture-a', async () => failure);
    renderPreview();
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить содержимое урока');
    expect(screen.queryByText('Контент урока пуст')).toBeNull();
    mocks.contents.set('lecture-a', async () => successful('Лекция после повторной загрузки.'));
    fireEvent.click(screen.getByRole('button', { name: 'Повторить загрузку' }));
    expect(await screen.findByText('Лекция после повторной загрузки.')).toBeInTheDocument();
  });

  it('shows empty only after a successful response with null content', async () => {
    mocks.contents.set('lecture-a', async () => successful(null));
    renderPreview();
    expect(await screen.findByText('Контент урока пуст')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('does not cache a failed prefetch as successful empty content for the next lesson', async () => {
    mocks.lessons.push({ id: 'lecture-b', title: 'Лекция 2', type: 'text', order_index: 1 });
    mocks.contents.set('lecture-a', async () => successful('Первая лекция.'));
    mocks.contents.set('lecture-b', async () => ({ data: null, error: new Error('Prefetch failed') }));
    renderPreview();
    await screen.findByText('Первая лекция.');
    await waitFor(() => expect(client.getQueryState(['lesson-content', 'lecture-b'])?.status).toBe('error'));
    const content = deferred();
    mocks.contents.set('lecture-b', () => content.promise);
    fireEvent.click(screen.getByRole('button', { name: /Лекция 2/ }));
    expect(await screen.findByRole('status')).toHaveTextContent('Загрузка содержимого урока');
    expect(screen.queryByText('Контент урока пуст')).toBeNull();
    await act(async () => content.resolve(successful('Вторая полная лекция.')));
    expect(await screen.findByText('Вторая полная лекция.')).toBeInTheDocument();
  });
});
