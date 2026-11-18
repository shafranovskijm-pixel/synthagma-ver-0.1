import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MediaLibraryDialog } from "../MediaLibraryDialog";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), from: vi.fn(), rpc: vi.fn(), profile: vi.fn(), memberships: vi.fn(),
  courses: vi.fn(), usage: vi.fn(), list: vi.fn(), invoke: vi.fn(), remove: vi.fn(),
  success: vi.fn(), error: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: { getUser: mocks.getUser }, from: mocks.from, rpc: mocks.rpc,
  functions: { invoke: mocks.invoke },
  storage: { from: (bucket: string) => ({
    list: (prefix: string) => mocks.list(bucket, prefix), remove: mocks.remove,
  }) },
} }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));

const videoFile = (name = "staff-lesson.mp4") => ({ id: name, name, metadata: { size: 1024 }, created_at: "2026-10-12T00:00:00Z" });
const defaultProps = { open: true, onClose: vi.fn(), onSelect: vi.fn(), filter: "video" as const };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(resolver => { resolve = resolver; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "staff-user" } }, error: null });
  mocks.profile.mockResolvedValue({ data: { organization_id: null }, error: null });
  mocks.memberships.mockResolvedValue({ data: [{ organization_id: "staff-school", role: "admin", sections_access: [], expires_at: null }], error: null });
  mocks.courses.mockImplementation(async (org: string) => ({ data: [{ id: `course-${org}`, title: `Course ${org}` }], error: null }));
  mocks.usage.mockImplementation(async (args: { p_file_names: string[] }) => ({
    data: args.p_file_names.map(file_name => ({ file_name, is_used: false, lesson_title: null })), error: null,
  }));
  mocks.invoke.mockResolvedValue({ data: { configured: false }, error: null });
  mocks.rpc.mockImplementation((name: string, args: unknown) => name === "get_media_library_usage_metadata"
    ? mocks.usage(args) : Promise.resolve({ data: false, error: null }));
  mocks.list.mockImplementation(async (bucket: string, prefix: string) => ({
    data: bucket === "course-files" && prefix.startsWith("course-") ? [videoFile()] : [], error: null,
  }));
  mocks.from.mockImplementation((table: string) => {
    const query = {
      select: () => query,
      eq: (_column: string, value: string) => table === "courses" ? mocks.courses(value) : query,
      maybeSingle: () => mocks.profile(),
      or: () => mocks.memberships(),
    };
    // Any browser-side lesson-content request is a regression, including '*'.
    if (!["profiles", "org_staff", "courses"].includes(table)) throw new Error(`Unexpected table ${table}`);
    return query;
  });
});
afterEach(cleanup);

describe("MediaLibraryDialog staff workspace", () => {
  it("loads and selects a file from the active staff school when the user's profile organization is null", async () => {
    render(<MediaLibraryDialog {...defaultProps} />);
    fireEvent.click(await screen.findByText("staff-lesson.mp4"));
    fireEvent.click(screen.getByRole("button", { name: /^Выбрать$/ }));

    expect(mocks.courses).toHaveBeenCalledWith("staff-school");
    expect(mocks.list).toHaveBeenCalledWith("course-files", "course-staff-school");
    expect(mocks.usage).toHaveBeenCalledWith({ p_organization_id: "staff-school", p_file_names: ["staff-lesson.mp4"] });
    expect(mocks.from).not.toHaveBeenCalledWith("lessons");
    expect(defaultProps.onSelect).toHaveBeenCalledWith(expect.stringContaining("/course-files/course-staff-school/staff-lesson.mp4"));
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps the editor's explicit organization instead of reading the current user's profile", async () => {
    render(<MediaLibraryDialog {...defaultProps} organizationId="editor-school" />);
    await screen.findByText("staff-lesson.mp4");
    expect(mocks.courses).toHaveBeenCalledWith("editor-school");
    expect(mocks.from).not.toHaveBeenCalledWith("profiles");
    expect(mocks.memberships).not.toHaveBeenCalled();
    expect(mocks.list).toHaveBeenCalledWith("course-files", "course-editor-school");
  });

  it("explains ambiguous membership instead of displaying an empty library", async () => {
    mocks.memberships.mockResolvedValue({ data: [
      { organization_id: "one", role: "admin", sections_access: [], expires_at: null },
      { organization_id: "two", role: "admin", sections_access: [], expires_at: null },
    ], error: null });
    render(<MediaLibraryDialog {...defaultProps} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("нескольким организациям");
    expect(screen.queryByText("В хранилище пока нет файлов")).not.toBeInTheDocument();
    expect(mocks.list).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^Выбрать$/ })).toBeDisabled();
  });

  it("shows a course query error and supports retry without claiming the library is empty", async () => {
    mocks.courses.mockResolvedValueOnce({ data: null, error: { code: "42501" } });
    render(<MediaLibraryDialog {...defaultProps} organizationId="staff-school" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось загрузить курсы организации");
    expect(screen.queryByText("В хранилище пока нет файлов")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Повторить загрузку" }));

    expect(await screen.findByText("staff-lesson.mp4")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("distinguishes failed storage reads from a genuinely empty library", async () => {
    mocks.list.mockResolvedValue({ data: null, error: new Error("Storage unavailable") });
    render(<MediaLibraryDialog {...defaultProps} organizationId="staff-school" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось загрузить файлы из хранилища");
    expect(screen.queryByText("В хранилище пока нет файлов")).not.toBeInTheDocument();
  });

  it("keeps available files and marks a partial storage failure", async () => {
    mocks.list.mockImplementation(async (bucket: string, prefix: string) => {
      if (bucket === "org-branding") return { data: null, error: new Error("Not available") };
      return { data: bucket === "course-files" && prefix.startsWith("course-") ? [videoFile()] : [], error: null };
    });
    render(<MediaLibraryDialog {...defaultProps} organizationId="staff-school" />);
    fireEvent.click(await screen.findByText("staff-lesson.mp4"));
    expect(screen.getByRole("alert")).toHaveTextContent("список может быть неполным");
    expect(screen.getByRole("button", { name: /^Выбрать$/ })).toBeEnabled();
  });

  it("does not replace another organization's files with a late response from the previous organization", async () => {
    const oldScan = deferred<{ data: ReturnType<typeof videoFile>[]; error: null }>();
    mocks.list.mockImplementation(async (bucket: string, prefix: string) => {
      if (bucket === "course-files" && prefix === "course-old-school") return oldScan.promise;
      return { data: bucket === "course-files" && prefix === "course-new-school" ? [videoFile("current.mp4")] : [], error: null };
    });
    const { rerender } = render(<MediaLibraryDialog {...defaultProps} organizationId="old-school" />);
    await waitFor(() => expect(mocks.list).toHaveBeenCalledWith("course-files", "course-old-school"));
    rerender(<MediaLibraryDialog {...defaultProps} organizationId="new-school" />);
    await screen.findByText("current.mp4");
    await act(async () => { oldScan.resolve({ data: [videoFile("old.mp4")], error: null }); });

    expect(screen.getByText("current.mp4")).toBeInTheDocument();
    expect(screen.queryByText("old.mp4")).not.toBeInTheDocument();
    expect(screen.queryByText("Загрузка файлов...")).not.toBeInTheDocument();
  });

  it("ignores an old failure after closing and reopening the dialog", async () => {
    const oldRead = deferred<{ data: null; error: { code: string } }>();
    mocks.courses.mockReturnValueOnce(oldRead.promise);
    const { rerender } = render(<MediaLibraryDialog {...defaultProps} organizationId="staff-school" />);
    await waitFor(() => expect(mocks.courses).toHaveBeenCalledTimes(1));
    rerender(<MediaLibraryDialog {...defaultProps} open={false} organizationId="staff-school" />);
    rerender(<MediaLibraryDialog {...defaultProps} open organizationId="staff-school" />);
    await screen.findByText("staff-lesson.mp4");
    await act(async () => { oldRead.resolve({ data: null, error: { code: "old-failure" } }); });

    expect(screen.getByText("staff-lesson.mp4")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps usage labels and the existing lesson warning using metadata only", async () => {
    mocks.usage.mockResolvedValue({ data: [
      { file_name: "staff-lesson.mp4", is_used: true, lesson_title: "Existing lesson" },
    ], error: null });
    render(<MediaLibraryDialog {...defaultProps} organizationId="staff-school" />);
    fireEvent.click(await screen.findByText("staff-lesson.mp4"));
    expect(screen.getByText("Existing lesson")).toBeInTheDocument();
    expect(screen.getByText("Используется", { exact: true })).toBeInTheDocument();
    expect(screen.queryByText("1 не используется")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Удалить файл" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Этот файл используется в уроке «Existing lesson»");
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalledWith("lessons");
  });

  it("reports a usage metadata error and retries without marking files unused", async () => {
    mocks.usage.mockResolvedValueOnce({ data: null, error: { code: "42501" } });
    render(<MediaLibraryDialog {...defaultProps} organizationId="staff-school" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("не удалось проверить их использование");
    expect(screen.queryByText("Не используется", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText("В хранилище пока нет файлов")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Выбрать$/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Повторить загрузку" }));
    expect(await screen.findByText("staff-lesson.mp4")).toBeInTheDocument();
    expect(mocks.from).not.toHaveBeenCalledWith("lessons");
  });

  it.each([
    ["missing row", []],
    ["wrong filename", [{ file_name: "different.mp4", is_used: false, lesson_title: null }]],
    ["invalid usage flag", [{ file_name: "staff-lesson.mp4", is_used: null, lesson_title: null }]],
  ])("rejects incomplete or invalid usage metadata: %s", async (_name, data) => {
    mocks.usage.mockResolvedValue({ data, error: null });
    render(<MediaLibraryDialog {...defaultProps} organizationId="staff-school" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("не удалось проверить их использование");
    expect(screen.queryByText("Не используется", { exact: true })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Выбрать$/ })).toBeDisabled();
    expect(mocks.from).not.toHaveBeenCalledWith("lessons");
  });

  it("batches every unique filename without limiting the accessible files", async () => {
    mocks.list.mockImplementation(async (bucket: string, prefix: string) => ({
      data: bucket === "course-files" && prefix.startsWith("course-")
        ? Array.from({ length: 101 }, (_, i) => videoFile(`file-${i}.mp4`)) : [], error: null,
    }));
    render(<MediaLibraryDialog {...defaultProps} organizationId="staff-school" />);
    expect(await screen.findByText("file-100.mp4")).toBeInTheDocument();
    expect(mocks.usage).toHaveBeenCalledTimes(2);
    expect(mocks.usage.mock.calls.map(([args]) => args.p_file_names.length)).toEqual([100, 1]);
    expect(mocks.usage.mock.calls.flatMap(([args]) => args.p_file_names)).toEqual(
      Array.from({ length: 101 }, (_, i) => `file-${i}.mp4`),
    );
    expect(screen.getByText("101 не используется")).toBeInTheDocument();
  });

  it("ignores late usage metadata from a previous organization", async () => {
    const oldUsage = deferred<{ data: { file_name: string; is_used: boolean; lesson_title: string }[]; error: null }>();
    mocks.usage.mockReturnValueOnce(oldUsage.promise);
    const { rerender } = render(<MediaLibraryDialog {...defaultProps} organizationId="old-school" />);
    await waitFor(() => expect(mocks.usage).toHaveBeenCalledTimes(1));
    rerender(<MediaLibraryDialog {...defaultProps} organizationId="new-school" />);
    fireEvent.click(await screen.findByText("staff-lesson.mp4"));
    await act(async () => { oldUsage.resolve({ data: [
      { file_name: "staff-lesson.mp4", is_used: true, lesson_title: "Old school lesson" },
    ], error: null }); });
    expect(screen.queryByText("Old school lesson")).not.toBeInTheDocument();
    expect(screen.getByText("Не используется в уроках")).toBeInTheDocument();
    expect(mocks.usage).toHaveBeenLastCalledWith({ p_organization_id: "new-school", p_file_names: ["staff-lesson.mp4"] });
  });

  it("ignores a late usage failure after closing and reopening", async () => {
    const oldUsage = deferred<{ data: null; error: { code: string } }>();
    mocks.usage.mockReturnValueOnce(oldUsage.promise);
    const { rerender } = render(<MediaLibraryDialog {...defaultProps} organizationId="staff-school" />);
    await waitFor(() => expect(mocks.usage).toHaveBeenCalledTimes(1));
    rerender(<MediaLibraryDialog {...defaultProps} open={false} organizationId="staff-school" />);
    rerender(<MediaLibraryDialog {...defaultProps} open organizationId="staff-school" />);
    await screen.findByText("staff-lesson.mp4");
    await act(async () => { oldUsage.resolve({ data: null, error: { code: "old-failure" } }); });
    expect(screen.getByText("staff-lesson.mp4")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
