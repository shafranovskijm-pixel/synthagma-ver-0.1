import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
  courses: [] as Array<{ id: string; title: string; is_published: boolean }>,
  orders: [] as Array<{ notes: string | null; status: string }>,
  documents: [] as Array<{ id: string; course_id: string; name: string; file_url: string | null; allow_download: boolean }>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        in: vi.fn(() => query),
        order: vi.fn(() => query),
        then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve({ data: table === "courses" ? testState.courses : table === "service_orders" ? testState.orders : testState.documents, error: null }).then(resolve, reject),
      };

      return query;
    },
  },
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "synthetic-actor" } }) }));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock("@/components/organization/programs/ProgramFactsPanel", () => ({ ProgramFactsPanel: ({ canConfigure }: { canConfigure: boolean }) => <div data-testid="program-facts-panel">{canConfigure ? "Редактирование программы" : "Чтение программы"}</div> }));

import { CourseProgramsList } from "@/components/organization/CourseProgramsList";

describe("CourseProgramsList", () => {
  beforeEach(() => {
    testState.courses = [];
    testState.orders = [];
    testState.documents = [];
  });

  it("labels stable program-document metadata neutrally, including frozen files without a live URL", async () => {
    testState.courses = [
      { id: "course-null", title: "Курс без файла", is_published: true },
      { id: "course-blank", title: "Курс с пустой ссылкой", is_published: true },
      { id: "course-valid", title: "Курс с программой", is_published: true },
      { id: "course-absent", title: "Курс без документа", is_published: true },
    ];
    testState.documents = [
      { id: "program-frozen", course_id: "course-null", name: "Программа.pdf", allow_download: false, file_url: null },
      { id: "program-blank", course_id: "course-blank", name: "Программа", allow_download: false, file_url: "   " },
      { id: "program-legacy", course_id: "course-valid", name: "Программа.pdf", allow_download: true, file_url: "https://files.example/program.pdf" },
    ];

    render(<CourseProgramsList organizationId="org-1" />);

    expect(await screen.findAllByText("Нет файла программы")).toHaveLength(1);
    expect(screen.getAllByText("Документ программы добавлен")).toHaveLength(3);
    expect(screen.queryByText("Файл программы добавлен")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Курс с программой")).toBeInTheDocument();
  });

  it("explains that a missing file does not stop learning and is not inserted automatically", async () => {
    render(<CourseProgramsList organizationId="org-1" />);

    expect(await screen.findByText(/Синтагма не останавливает обучение/)).toBeInTheDocument();
    expect(screen.getByText(/не подтверждает сведения программы/)).toBeInTheDocument();
    expect(screen.getByTestId("program-facts-panel")).toHaveTextContent("Чтение программы");
    expect(screen.queryByText(/По законодательству у каждого курса/)).not.toBeInTheDocument();
  });
});
