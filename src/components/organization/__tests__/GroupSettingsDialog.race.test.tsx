import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GroupSettingsDialog } from "@/components/organization/GroupSettingsDialog";

type QueryResult = { data: Record<string, unknown> | null; error: unknown };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const groupRequests = new Map<string, ReturnType<typeof deferred<QueryResult>>>();
const groupScopes: Array<{ id: string; organizationId: string }> = [];

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === "courses") {
        const coursesQuery = {
          select: vi.fn(() => coursesQuery),
          eq: vi.fn(() => coursesQuery),
          order: vi.fn(async () => ({ data: [], error: null })),
        };
        return coursesQuery;
      }

      if (table !== "student_groups") throw new Error(`Unexpected table: ${table}`);
      let id = "";
      let organizationId = "";
      const groupQuery = {
        select: vi.fn(() => groupQuery),
        eq: vi.fn((column: string, value: string) => {
          if (column === "id") id = value;
          if (column === "organization_id") organizationId = value;
          return groupQuery;
        }),
        single: vi.fn(() => {
          groupScopes.push({ id, organizationId });
          const request = groupRequests.get(id);
          if (!request) throw new Error(`Missing request for ${id}`);
          return request.promise;
        }),
      };
      return groupQuery;
    }),
  },
}));

function group(id: string, name: string) {
  return {
    id,
    name,
    color: null,
    start_date: null,
    end_date: null,
    group_number: null,
    program_title: null,
    program_hours: null,
    program_form: null,
    default_price: null,
    training_address: null,
    schedule_text: null,
    instructor_name: null,
    training_dates: [],
    course_id: null,
    max_seats: null,
    curator_id: null,
    strict_order: false,
    limit_access_time: false,
    schedule_access: false,
    block_resubmit: false,
    show_locked_lessons: false,
    enable_channel: false,
    enable_group_chat: false,
    block_student_dialogs: false,
  };
}

describe("GroupSettingsDialog request ordering", () => {
  beforeEach(() => {
    groupRequests.clear();
    groupScopes.length = 0;
  });

  it("keeps group B when the slower group A lookup resolves last", async () => {
    const requestA = deferred<QueryResult>();
    const requestB = deferred<QueryResult>();
    groupRequests.set("group-a", requestA);
    groupRequests.set("group-b", requestB);

    const props = {
      open: true,
      organizationId: "org-1",
      onOpenChange: vi.fn(),
    };
    const { rerender } = render(<GroupSettingsDialog {...props} groupId="group-a" />);

    await waitFor(() => expect(groupScopes).toContainEqual({ id: "group-a", organizationId: "org-1" }));
    rerender(<GroupSettingsDialog {...props} groupId="group-b" />);
    await waitFor(() => expect(groupScopes).toContainEqual({ id: "group-b", organizationId: "org-1" }));

    await act(async () => {
      requestB.resolve({ data: group("group-b", "Группа B"), error: null });
      await requestB.promise;
    });
    expect(await screen.findByDisplayValue("Группа B")).toBeInTheDocument();

    await act(async () => {
      requestA.resolve({ data: group("group-a", "Группа A"), error: null });
      await requestA.promise;
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue("Группа B")).toBeInTheDocument();
      expect(screen.queryByDisplayValue("Группа A")).not.toBeInTheDocument();
    });
  });
});
