import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createQueryWrapper } from "@/test/queryWrapper";
import { renderHook, act, waitFor } from "@testing-library/react";

const fixture = vi.hoisted(() => ({ rows: {} as Record<string, Record<string, unknown>[]> }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    // A Supabase builder is thenable and supports repeated eq filters.
    from: vi.fn((table: string) => {
      const query: Record<string, any> = {};
      for (const method of ["select", "eq", "in", "order", "insert", "update", "delete"]) {
        query[method] = vi.fn(() => query);
      }
      query.single = vi.fn(async () => ({ data: fixture.rows[table]?.[0] ?? null, error: null }));
      query.then = (resolve: (result: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve({ data: fixture.rows[table] ?? [], error: null }).then(resolve, reject);
      return query;
    }),
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { useJournalEditor } from "@/hooks/useJournalEditor";

const defaultProps = {
  organizationId: "org-1",
  journalType: "attendance",
  journalTitle: "Журнал посещаемости",
  onClose: vi.fn(),
};

describe("useJournalEditor", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.clearAllMocks();
    fixture.rows = {};
    consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    expect(consoleError.mock.calls.some(args => args.some(value => value instanceof TypeError))).toBe(false);
    consoleError.mockRestore();
  });

  it("initializes with default state", async () => {
    const { result } = renderHook(() => useJournalEditor(defaultProps), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(typeof result.current.loading).toBe("boolean");
    expect(result.current.saving).toBe(false);
    expect(result.current.students).toEqual([]);
    expect(result.current.courses).toEqual([]);
    expect(result.current.selectedCourse).toBe("");
    expect(result.current.journalInstance).toBeNull();
    expect(result.current.showCreateDialog).toBe(false);
    expect(result.current.showDeleteDialog).toBe(false);
    expect(result.current.existingJournals).toEqual([]);
    expect(result.current.selectedJournalId).toBe("");
  });

  it("generates 7 dates for the week", async () => {
    const { result } = renderHook(() => useJournalEditor(defaultProps), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.dates).toHaveLength(7);
  });

  it("isAttendanceJournal is true for attendance type", async () => {
    const { result } = renderHook(() => useJournalEditor(defaultProps), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isAttendanceJournal).toBe(true);
  });

  it("isAttendanceJournal is false for grades type", async () => {
    const { result } = renderHook(() =>
      useJournalEditor({ ...defaultProps, journalType: "grades" })
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isAttendanceJournal).toBe(false);
  });

  it("isAttendanceJournal is true for entry_control type", async () => {
    const { result } = renderHook(() =>
      useJournalEditor({ ...defaultProps, journalType: "entry_control" })
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isAttendanceJournal).toBe(true);
  });

  it("can toggle create dialog", async () => {
    const { result } = renderHook(() => useJournalEditor(defaultProps), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => { result.current.setShowCreateDialog(true); });
    expect(result.current.showCreateDialog).toBe(true);
  });

  it("can toggle delete dialog", async () => {
    const { result } = renderHook(() => useJournalEditor(defaultProps), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => { result.current.setShowDeleteDialog(true); });
    expect(result.current.showDeleteDialog).toBe(true);
  });

  it("can update selected course", async () => {
    const { result } = renderHook(() => useJournalEditor(defaultProps), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => { result.current.setSelectedCourse("course-1"); });
    expect(result.current.selectedCourse).toBe("course-1");
  });

  it("can change week start and dates update", async () => {
    const { result } = renderHook(() => useJournalEditor(defaultProps), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    const newWeek = new Date(2025, 0, 6); // Monday
    act(() => { result.current.setWeekStart(newWeek); });
    expect(result.current.dates).toHaveLength(7);
  });

  it("getEntryValue returns empty string for missing entry", async () => {
    const { result } = renderHook(() => useJournalEditor(defaultProps), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.getEntryValue("user-1", new Date())).toBe("");
  });

  it("newJournalTitle defaults to journalTitle prop", async () => {
    const { result } = renderHook(() => useJournalEditor(defaultProps), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.newJournalTitle).toBe("Журнал посещаемости");
  });
  it("loads persisted values through the complete asynchronous query chain", async () => {
    fixture.rows = {
      courses: [{ id: "course-1", title: "Course" }],
      journal_instances: [{ id: "journal-1", course_id: "course-1", journal_type: "attendance", title: "Saved journal" }],
      enrollments: [{ user_id: "learner-1", course_id: "course-1" }],
      profiles: [{ user_id: "learner-1", full_name: "Learner" }],
      journal_entries: [{ id: "entry-1", journal_id: "journal-1", user_id: "learner-1", entry_date: "2026-10-18", value: "присутствовал" }],
    };
    const { result } = renderHook(() => useJournalEditor(defaultProps), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.getEntryValue("learner-1", new Date(2026, 9, 18))).toBe("присутствовал"));
    expect(result.current.journalInstance?.id).toBe("journal-1");
    expect(result.current.students.map(student => student.user_id)).toEqual(["learner-1"]);
    expect(consoleError).not.toHaveBeenCalled();
  });

});
