import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
        in: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: "j-1" }, error: null }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
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
  beforeEach(() => vi.clearAllMocks());

  it("initializes with default state", () => {
    const { result } = renderHook(() => useJournalEditor(defaultProps));

    expect(result.current.loading).toBe(true);
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

  it("generates 7 dates for the week", () => {
    const { result } = renderHook(() => useJournalEditor(defaultProps));
    expect(result.current.dates).toHaveLength(7);
  });

  it("isAttendanceJournal is true for attendance type", () => {
    const { result } = renderHook(() => useJournalEditor(defaultProps));
    expect(result.current.isAttendanceJournal).toBe(true);
  });

  it("isAttendanceJournal is false for grades type", () => {
    const { result } = renderHook(() =>
      useJournalEditor({ ...defaultProps, journalType: "grades" })
    );
    expect(result.current.isAttendanceJournal).toBe(false);
  });

  it("isAttendanceJournal is true for entry_control type", () => {
    const { result } = renderHook(() =>
      useJournalEditor({ ...defaultProps, journalType: "entry_control" })
    );
    expect(result.current.isAttendanceJournal).toBe(true);
  });

  it("can toggle create dialog", () => {
    const { result } = renderHook(() => useJournalEditor(defaultProps));
    act(() => { result.current.setShowCreateDialog(true); });
    expect(result.current.showCreateDialog).toBe(true);
  });

  it("can toggle delete dialog", () => {
    const { result } = renderHook(() => useJournalEditor(defaultProps));
    act(() => { result.current.setShowDeleteDialog(true); });
    expect(result.current.showDeleteDialog).toBe(true);
  });

  it("can update selected course", () => {
    const { result } = renderHook(() => useJournalEditor(defaultProps));
    act(() => { result.current.setSelectedCourse("course-1"); });
    expect(result.current.selectedCourse).toBe("course-1");
  });

  it("can change week start and dates update", () => {
    const { result } = renderHook(() => useJournalEditor(defaultProps));
    const newWeek = new Date(2025, 0, 6); // Monday
    act(() => { result.current.setWeekStart(newWeek); });
    expect(result.current.dates).toHaveLength(7);
  });

  it("getEntryValue returns empty string for missing entry", () => {
    const { result } = renderHook(() => useJournalEditor(defaultProps));
    expect(result.current.getEntryValue("user-1", new Date())).toBe("");
  });

  it("newJournalTitle defaults to journalTitle prop", () => {
    const { result } = renderHook(() => useJournalEditor(defaultProps));
    expect(result.current.newJournalTitle).toBe("Журнал посещаемости");
  });
});
