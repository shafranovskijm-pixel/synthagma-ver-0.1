import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PptxPickerDialog } from "../PptxPickerDialog";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(), single: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: mocks.rpc, from: mocks.from,
} }));
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, onOpenChange, children }: any) => open ? <div role="dialog">
    <button aria-label="Close picker" onClick={() => onOpenChange(false)}>Close</button>{children}
  </div> : null,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
}));
vi.mock("@/components/ui/scroll-area", () => ({ ScrollArea: ({ children }: any) => <div>{children}</div> }));

const metadata = (id = "source-lesson", title = "Готовая презентация") => ({
  lesson_id: id, lesson_title: title, course_title: "Учебный курс", slides_count: 2,
  created_at: "2026-11-18T00:00:00Z",
});
// Whitespace and image strings must be delivered unchanged after a single selection.
const content = ' { "slides": [{"src":"data:image/png;base64,ONE"},{"src":"data:image/png;base64,TWO"}] } ';
const props = () => ({ open: true, currentLessonId: "current-lesson", onClose: vi.fn(), onSelect: vi.fn(), onSelectSliderContent: vi.fn() });
const openSliders = () => fireEvent.click(screen.getByRole("button", { name: /^Из уроков/ }));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name === "get_user_storage_files") return { data: [{ file_path: "course/demo.pptx", file_size: 2048 }], error: null };
    if (name === "list_slider_lesson_metadata") return { data: [metadata(), metadata("current-lesson", "Текущий урок")], error: null };
    throw new Error(`Unexpected RPC ${name}`);
  });
  mocks.single.mockResolvedValue({ data: { content }, error: null });
  const query = { select: mocks.select, eq: mocks.eq, maybeSingle: mocks.single };
  mocks.select.mockReturnValue(query);
  mocks.eq.mockReturnValue(query);
  mocks.from.mockReturnValue(query);
});
afterEach(cleanup);

describe("PptxPickerDialog lazy presentation loading", () => {
  it("opens the existing PPTX list without reading lessons or slider metadata", async () => {
    const callbacks = props();
    render(<PptxPickerDialog {...callbacks} />);
    fireEvent.click(await screen.findByText("demo.pptx"));
    expect(mocks.rpc.mock.calls).toEqual([["get_user_storage_files", { bucket_name: "presentations" }]]);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(callbacks.onSelect).toHaveBeenCalledWith(expect.stringContaining("/storage/v1/object/public/presentations/course/demo.pptx"));
    expect(screen.getByRole("button", { name: "Из уроков" })).toBeInTheDocument();
  });

  it("loads only metadata when its tab opens, excludes the current lesson, and reuses that list on tab changes", async () => {
    render(<PptxPickerDialog {...props()} />);
    await screen.findByText("demo.pptx");
    openSliders();
    expect(await screen.findByText("Готовая презентация")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Из уроков (1)" })).toBeInTheDocument();
    expect(screen.getByText(/2 сл\. · Учебный курс/)).toBeInTheDocument();
    expect(screen.queryByText("Текущий урок")).not.toBeInTheDocument();
    expect(mocks.from).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText("Поиск..."), { target: { value: "Учебный курс" } });
    expect(screen.getByText("Готовая презентация")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "PPTX файлы" }));
    openSliders();
    expect(mocks.rpc.mock.calls.filter(([name]) => name === "list_slider_lesson_metadata")).toHaveLength(1);
  });

  it("fetches exactly the chosen lesson and passes its original content bytes to the existing callback", async () => {
    const callbacks = props();
    const pending = deferred<any>();
    mocks.single.mockReturnValue(pending.promise);
    render(<PptxPickerDialog {...callbacks} />);
    openSliders();
    fireEvent.click(await screen.findByText("Готовая презентация"));
    expect(mocks.from.mock.calls).toEqual([["lessons"]]);
    expect(mocks.select.mock.calls).toEqual([["content"]]);
    expect(mocks.eq.mock.calls).toEqual([["id", "source-lesson"], ["type", "slider"]]);
    expect(screen.getByRole("button", { name: /Готовая презентация/ })).toBeDisabled();
    expect(callbacks.onSelectSliderContent).not.toHaveBeenCalled();
    await act(async () => pending.resolve({ data: { content }, error: null }));
    expect(callbacks.onSelectSliderContent.mock.calls).toEqual([[content, "Готовая презентация"]]);
    expect(callbacks.onClose).not.toHaveBeenCalled();
  });

  it.each([
    ["revoked/missing", { data: null, error: null }],
    ["denied", { data: null, error: { code: "42501" } }],
    ["malformed", { data: { content: "not json" }, error: null }],
    ["empty", { data: { content: "[]" }, error: null }],
    ["null", { data: { content: "null" }, error: null }],
    ["nonarray slides", { data: { content: '{"slides":"wrong"}' }, error: null }],
  ])("keeps %s selected content out of the callback and permits a deliberate retry", async (_label, response) => {
    const callbacks = props();
    mocks.single.mockResolvedValueOnce(response).mockResolvedValueOnce({ data: { content }, error: null });
    render(<PptxPickerDialog {...callbacks} />);
    openSliders();
    fireEvent.click(await screen.findByText("Готовая презентация"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось открыть презентацию");
    expect(callbacks.onSelectSliderContent).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Готовая презентация"));
    await waitFor(() => expect(callbacks.onSelectSliderContent).toHaveBeenCalledWith(content, "Готовая презентация"));
    expect(mocks.single).toHaveBeenCalledTimes(2);
  });

  it("shows metadata failure without claiming an empty list and retries only on request", async () => {
    mocks.rpc.mockImplementation(async (name: string) => name === "list_slider_lesson_metadata"
      ? { data: null, error: { code: "42501" } } : { data: [], error: null });
    render(<PptxPickerDialog {...props()} />);
    openSliders();
    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось загрузить презентации");
    expect(screen.queryByText("Нет слайдеров в других уроках")).not.toBeInTheDocument();
    expect(mocks.rpc.mock.calls.filter(([name]) => name === "list_slider_lesson_metadata")).toHaveLength(1);
    mocks.rpc.mockImplementation(async () => ({ data: [metadata()], error: null }));
    fireEvent.click(screen.getByRole("button", { name: "Повторить загрузку" }));
    expect(await screen.findByText("Готовая презентация")).toBeInTheDocument();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("does not reuse stale metadata after closing and reopening", async () => {
    const oldRead = deferred<any>();
    let reads = 0;
    mocks.rpc.mockImplementation(async (name: string) => name !== "list_slider_lesson_metadata"
      ? { data: [], error: null }
      : ++reads === 1 ? oldRead.promise : { data: [metadata("new", "Новая презентация")], error: null });
    const callbacks = props();
    const { rerender } = render(<PptxPickerDialog {...callbacks} />);
    openSliders();
    await waitFor(() => expect(reads).toBe(1));
    rerender(<PptxPickerDialog {...callbacks} open={false} />);
    rerender(<PptxPickerDialog {...callbacks} />);
    openSliders();
    expect(await screen.findByText("Новая презентация")).toBeInTheDocument();
    await act(async () => oldRead.resolve({ data: [metadata("old", "Старая презентация")], error: null }));
    expect(screen.queryByText("Старая презентация")).not.toBeInTheDocument();
  });

  it.each(["close", "tab", "context"])("ignores a selected presentation response after %s changes", async mode => {
    const callbacks = props();
    const pending = deferred<any>();
    mocks.single.mockReturnValue(pending.promise);
    const { rerender } = render(<PptxPickerDialog {...callbacks} />);
    openSliders();
    fireEvent.click(await screen.findByText("Готовая презентация"));
    if (mode === "close") fireEvent.click(screen.getByRole("button", { name: "Close picker" }));
    if (mode === "tab") fireEvent.click(screen.getByRole("button", { name: "PPTX файлы" }));
    if (mode === "context") rerender(<PptxPickerDialog {...callbacks} currentLessonId="another-lesson" />);
    await act(async () => pending.resolve({ data: { content }, error: null }));
    expect(callbacks.onSelectSliderContent).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
