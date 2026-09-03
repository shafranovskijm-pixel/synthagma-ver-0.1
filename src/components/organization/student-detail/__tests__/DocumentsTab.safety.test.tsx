import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentsTab } from "@/components/organization/student-detail/DocumentsTab";

const state = vi.hoisted(() => ({ download: vi.fn(), retry: vi.fn() }));

vi.mock("@/components/organization/student-detail/StudentLaborSafetyXmlCard", () => ({
  StudentLaborSafetyXmlCard: ({ snils, position, onOpenSnils }: {
    snils: string | null; position: string | null; onOpenSnils: () => void;
  }) => (
    <section aria-label="XML по охране труда">
      <button onClick={state.download}>Скачать XML</button>
      <button onClick={onOpenSnils}>Заполнить СНИЛС для XML</button>
      <span data-testid="xml-snils">{snils ?? "Не подтверждено"}</span>
      <span data-testid="xml-position">{position ?? "Не подтверждено"}</span>
    </section>
  ),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/components/ui/SigmaSpinner", () => ({ SigmaSpinner: () => <span>Ожидание</span> }));

const xmlProps = {
  organizationId: "org-1",
  student: { userId: "student-1", fullName: "Елизавета Попова" },
  enrollments: [],
};

const readyData = () => ({
  isLoading: false,
  dataLoadError: null as string | null,
  retryLoadStudentData: state.retry,
  identityDocs: [],
  frdoData: { snils: "112-233-445 95", last_name: "Попова", first_name: "Елизавета", middle_name: "Олеговна", birth_date: "1990-01-01" },
  jobPosition: "Инженер",
  fileInputRef: { current: null },
  saveFrdoField: vi.fn(),
  handleUploadClick: vi.fn(),
  handleFileChange: vi.fn(),
});

describe("student DocumentsTab independent personal-document boundary", () => {
  beforeEach(() => {
    state.download.mockClear();
    state.retry.mockClear();
  });

  it.each(["loading", "error"])("keeps XML accessible during personal-data %s without exposing stale fields or a false empty list", (mode) => {
    const h = {
      ...readyData(),
      isLoading: mode === "loading",
      dataLoadError: mode === "error" ? "Согласия и видео временно недоступны" : null,
      // Deliberately absent: failed data must not be read as a successful empty result.
      identityDocs: undefined,
    };
    render(<DocumentsTab h={h} laborSafetyXml={xmlProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Скачать XML" }));
    expect(state.download).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("xml-snils")).toHaveTextContent("Не подтверждено");
    expect(screen.getByTestId("xml-position")).toHaveTextContent("Не подтверждено");
    expect(screen.queryByText("Загрузить документы")).not.toBeInTheDocument();
    expect(screen.queryByText("Нет загруженных документов")).not.toBeInTheDocument();
    expect(screen.queryByText("Персональные данные (ФРДО)")).not.toBeInTheDocument();
    expect(screen.queryByTestId("student-frdo-snils-input")).not.toBeInTheDocument();
    if (mode === "loading") {
      expect(screen.getByRole("status")).toHaveTextContent("Загрузка личных документов");
    } else {
      expect(screen.getByRole("alert")).toHaveTextContent("Не удалось загрузить личные документы");
      fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
      expect(state.retry).toHaveBeenCalledTimes(1);
    }
  });

  it("mounts the personal form with freshly loaded values after retry", () => {
    const h = readyData();
    const view = render(<DocumentsTab h={{ ...h, dataLoadError: "Не удалось загрузить документы", frdoData: null }} laborSafetyXml={xmlProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    view.rerender(<DocumentsTab h={{ ...h, isLoading: true, frdoData: null }} laborSafetyXml={xmlProps} />);
    expect(screen.getByRole("button", { name: "Скачать XML" })).toBeEnabled();

    view.rerender(<DocumentsTab h={h} laborSafetyXml={xmlProps} />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByTestId("student-frdo-snils-input")).toHaveValue("112-233-445 95");
    expect(screen.getByPlaceholderText("Иванов")).toHaveValue("Попова");
    expect(screen.getByTestId("xml-snils")).toHaveTextContent("112-233-445 95");
    expect(screen.getByText("Загрузить документы")).toBeInTheDocument();
    expect(screen.getByText("Нет загруженных документов")).toBeInTheDocument();
  });

  it("clears old form state across a loading boundary instead of retaining the previous student's edits", () => {
    const h = readyData();
    const view = render(<DocumentsTab h={h} />);
    fireEvent.change(screen.getByPlaceholderText("Иванов"), { target: { value: "Старая правка" } });
    view.rerender(<DocumentsTab h={{ ...h, isLoading: true }} />);
    view.rerender(<DocumentsTab h={{ ...h, frdoData: { ...h.frdoData, last_name: "Билык" } }} />);
    expect(screen.getByPlaceholderText("Иванов")).toHaveValue("Билык");
    expect(screen.queryByDisplayValue("Старая правка")).not.toBeInTheDocument();
  });

  it("routes the XML SNILS action to the retry boundary when unavailable and to the input after recovery", () => {
    const h = readyData();
    const view = render(<DocumentsTab h={{ ...h, dataLoadError: "Ошибка личных данных" }} laborSafetyXml={xmlProps} />);
    const alert = screen.getByRole("alert");
    const scrollError = vi.fn();
    Object.defineProperty(alert, "scrollIntoView", { value: scrollError });
    fireEvent.click(screen.getByRole("button", { name: "Заполнить СНИЛС для XML" }));
    expect(scrollError).toHaveBeenCalledTimes(1);
    expect(alert).toHaveFocus();

    view.rerender(<DocumentsTab h={h} laborSafetyXml={xmlProps} />);
    const input = screen.getByTestId("student-frdo-snils-input");
    const scrollInput = vi.fn();
    Object.defineProperty(input, "scrollIntoView", { value: scrollInput });
    fireEvent.click(screen.getByRole("button", { name: "Заполнить СНИЛС для XML" }));
    expect(scrollInput).toHaveBeenCalledTimes(1);
    expect(input).toHaveFocus();
  });

  it("keeps local retry available without advertising an XML module in consumers that do not provide one", () => {
    render(<DocumentsTab h={{ ...readyData(), dataLoadError: "Ошибка личных данных" }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Не удалось загрузить личные документы");
    expect(screen.queryByText(/Раздел XML по охране труда доступен отдельно/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(state.retry).toHaveBeenCalledTimes(1);
  });
});
