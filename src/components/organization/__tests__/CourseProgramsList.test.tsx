import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
  courses: [] as Array<{ id: string; title: string; is_published: boolean }>,
  orders: [] as Array<{ notes: string | null; status: string }>,
  documents: [] as Array<{ course_id: string; file_url: string | null }>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn((column: string) => {
          if (table === "service_orders" && column === "service_id") {
            return Promise.resolve({ data: testState.orders, error: null });
          }
          if (table === "course_documents" && column === "type") {
            return Promise.resolve({ data: testState.documents, error: null });
          }
          return query;
        }),
        in: vi.fn(() => query),
        order: vi.fn(() => Promise.resolve({ data: testState.courses, error: null })),
      };

      return query;
    },
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { CourseProgramsList } from "@/components/organization/CourseProgramsList";

describe("CourseProgramsList", () => {
  beforeEach(() => {
    testState.courses = [];
    testState.orders = [];
    testState.documents = [];
  });

  it("marks a program as added only when its document has a non-blank file URL", async () => {
    testState.courses = [
      { id: "course-null", title: "Курс без файла", is_published: true },
      { id: "course-blank", title: "Курс с пустой ссылкой", is_published: true },
      { id: "course-valid", title: "Курс с программой", is_published: true },
    ];
    testState.documents = [
      { course_id: "course-null", file_url: null },
      { course_id: "course-blank", file_url: "   " },
      { course_id: "course-valid", file_url: "https://files.example/program.pdf" },
    ];

    render(<CourseProgramsList organizationId="org-1" />);

    expect(await screen.findAllByText("Нет программы")).toHaveLength(2);
    expect(screen.getAllByText("Программа добавлена")).toHaveLength(1);
    expect(screen.getByText("Курс с программой")).toBeInTheDocument();
  });

  it("explains that a missing file does not stop learning and is not inserted automatically", async () => {
    render(<CourseProgramsList organizationId="org-1" />);

    expect(await screen.findByText(/Синтагма не останавливает обучение/)).toBeInTheDocument();
    expect(screen.getByText(/файл пока не подставляется в курс, договоры или пакет документов автоматически/)).toBeInTheDocument();
    expect(screen.queryByText(/По законодательству у каждого курса/)).not.toBeInTheDocument();
  });
});
