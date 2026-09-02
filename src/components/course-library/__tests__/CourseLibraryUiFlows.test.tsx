import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CourseLibraryResource } from "@/api/courseLibrary";

const apiMocks = vi.hoisted(() => ({
  archiveCourseLibraryResource: vi.fn(),
  createCourseLibraryResource: vi.fn(),
  createLibrarySignedUrl: vi.fn(),
  fetchCourseLibrary: vi.fn(),
  updateCourseLibraryResource: vi.fn(),
}));

const toastMocks = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
}));

vi.mock("@/api/courseLibrary", () => apiMocks);

vi.mock("@/hooks/useStaffPermissions", () => ({
  useStaffPermissions: () => ({
    can: (permission: string) => permission === "library.write",
    loading: false,
  }),
}));

vi.mock("sonner", () => ({ toast: toastMocks }));

// Radix Select is already covered by its own library. Rendering it as a native
// select here keeps these tests focused on the SINTAGMA form values and flows.
vi.mock("@/components/ui/select", () => ({
  Select: ({
    children,
    disabled,
    onValueChange,
    value,
  }: {
    children: ReactNode;
    disabled?: boolean;
    onValueChange?: (value: string) => void;
    value?: string;
  }) => (
    <select
      disabled={disabled}
      value={value}
      onChange={(event) => onValueChange?.(event.currentTarget.value)}
    >
      {children}
    </select>
  ),
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <option value={value}>{children}</option>
  ),
  SelectTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectValue: () => null,
}));

import { CourseLibraryManager } from "@/components/course-library/CourseLibraryManager";
import { CourseLibraryReader } from "@/components/course-library/CourseLibraryReader";

const modules = [
  { id: "module-a", title: "Модуль А", orderIndex: 0 },
  { id: "module-b", title: "Модуль Б", orderIndex: 1 },
];

function resource(
  overrides: Partial<CourseLibraryResource> & Pick<CourseLibraryResource, "libraryDocumentId" | "title">,
): CourseLibraryResource {
  return {
    assignmentId: `assignment-${overrides.libraryDocumentId}`,
    libraryDocumentId: overrides.libraryDocumentId,
    courseId: "course-178",
    moduleId: null,
    moduleTitle: null,
    title: overrides.title,
    category: "legal_acts",
    description: "Описание материала",
    sourceName: "МЧС России",
    externalUrl: "https://example.org/material",
    storagePath: null,
    mimeType: null,
    originalFilename: null,
    fileSize: null,
    editionLabel: "Редакция от 01.09.2026",
    lastCheckedAt: "2026-09-03",
    usageBasis: "official_open_source",
    status: "active",
    sortOrder: 0,
    allowDownload: true,
    createdAt: "2026-09-03T00:00:00.000Z",
    updatedAt: "2026-09-03T00:00:00.000Z",
    ...overrides,
  };
}

function getDialogComboboxes() {
  return within(screen.getByRole("dialog")).getAllByRole("combobox");
}

function openCreateDialog() {
  fireEvent.click(screen.getAllByRole("button", { name: "Добавить ресурс" })[0]);
  return screen.getByRole("dialog");
}

function fakePendingWindow() {
  const replace = vi.fn();
  const close = vi.fn();
  const value = {
    close,
    location: { replace },
    opener: {} as Window | null,
  } as unknown as Window;
  return { close, replace, value };
}

describe("CourseLibrary organization UI flows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.archiveCourseLibraryResource.mockResolvedValue(undefined);
    apiMocks.createCourseLibraryResource.mockResolvedValue(undefined);
    apiMocks.createLibrarySignedUrl.mockResolvedValue("https://signed.example.test/material.pdf");
    apiMocks.fetchCourseLibrary.mockResolvedValue({ modules, resources: [] });
    apiMocks.updateCourseLibraryResource.mockResolvedValue(undefined);
  });

  it("adds an external HTTPS resource and assigns it to a selected module", async () => {
    render(
      <CourseLibraryManager
        courseId="course-178"
        courseName="Программа 178 часов"
        organizationId="org-csz"
      />,
    );

    await screen.findByText("Библиотека курса пока пуста");
    const dialog = openCreateDialog();
    fireEvent.change(within(dialog).getByLabelText("Название *"), {
      target: { value: "Приказ МЧС России № 1156" },
    });
    fireEvent.change(within(dialog).getByLabelText("Организация или автор источника *"), {
      target: { value: "МЧС России" },
    });
    fireEvent.change(within(dialog).getByLabelText("HTTPS-ссылка *"), {
      target: { value: "https://mchs.gov.ru/document" },
    });
    fireEvent.change(getDialogComboboxes()[1], { target: { value: "module-a" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Добавить ресурс" }));

    await waitFor(() => expect(apiMocks.createCourseLibraryResource).toHaveBeenCalledWith(
      expect.objectContaining({
        courseId: "course-178",
        externalUrl: "https://mchs.gov.ru/document",
        file: null,
        moduleId: "module-a",
        organizationId: "org-csz",
        sourceName: "МЧС России",
        title: "Приказ МЧС России № 1156",
      }),
    ));
    expect(apiMocks.fetchCourseLibrary).toHaveBeenCalledTimes(2);
  });

  it("adds an internal file and keeps the selected module in the create request", async () => {
    render(
      <CourseLibraryManager
        courseId="course-178"
        courseName="Программа 178 часов"
        organizationId="org-csz"
      />,
    );

    await screen.findByText("Библиотека курса пока пуста");
    const dialog = openCreateDialog();
    fireEvent.change(within(dialog).getByLabelText("Название *"), {
      target: { value: "Методические рекомендации" },
    });
    fireEvent.change(within(dialog).getByLabelText("Организация или автор источника *"), {
      target: { value: "ЦСЗ" },
    });
    const comboboxes = getDialogComboboxes();
    fireEvent.change(comboboxes[1], { target: { value: "module-b" } });
    fireEvent.change(comboboxes[2], { target: { value: "file" } });
    const file = new File(["local material"], "recommendations.pdf", {
      type: "application/pdf",
    });
    const fileInput = within(dialog).getByLabelText("Файл *");
    Object.defineProperty(fileInput, "files", {
      configurable: true,
      value: [file],
    });
    fireEvent.change(fileInput);
    fireEvent.click(within(dialog).getByRole("button", { name: "Добавить ресурс" }));

    await waitFor(() => expect(apiMocks.createCourseLibraryResource).toHaveBeenCalledWith(
      expect.objectContaining({
        externalUrl: null,
        file,
        moduleId: "module-b",
        sourceName: "ЦСЗ",
        title: "Методические рекомендации",
      }),
    ));
  });

  it("edits a resource, changes its module, and archives it without a delete action", async () => {
    const existing = resource({
      libraryDocumentId: "editable",
      moduleId: "module-a",
      moduleTitle: "Модуль А",
      title: "Исходное название",
    });
    apiMocks.fetchCourseLibrary.mockResolvedValue({ modules, resources: [existing] });

    render(
      <CourseLibraryManager
        courseId="course-178"
        courseName="Программа 178 часов"
        organizationId="org-csz"
      />,
    );

    await screen.findByText("Исходное название");
    fireEvent.click(screen.getByRole("button", { name: "Изменить" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Название *"), {
      target: { value: "Уточнённое название" },
    });
    fireEvent.change(getDialogComboboxes()[1], { target: { value: "module-b" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Сохранить" }));

    await waitFor(() => expect(apiMocks.updateCourseLibraryResource).toHaveBeenCalledWith(
      existing,
      expect.objectContaining({
        moduleId: "module-b",
        title: "Уточнённое название",
      }),
    ));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "В архив" }));
    await waitFor(() => expect(apiMocks.archiveCourseLibraryResource).toHaveBeenCalledWith(existing));
    expect(screen.queryByRole("button", { name: /Удалить/u })).not.toBeInTheDocument();
  });

  it("runs CSV export and renders the complete printable list", async () => {
    const listed = resource({
      libraryDocumentId: "listed",
      moduleId: "module-a",
      moduleTitle: "Модуль А",
      title: "Проверяемый официальный материал",
    });
    apiMocks.fetchCourseLibrary.mockResolvedValue({ modules, resources: [listed] });
    const createObjectURL = vi.fn(() => "blob:course-library");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const printDocument = document.implementation.createHTMLDocument("");
    const print = vi.fn();
    const focus = vi.fn();
    const printWindow = {
      document: printDocument,
      focus,
      opener: {} as Window | null,
      print,
    } as unknown as Window;
    const open = vi.spyOn(window, "open").mockReturnValue(printWindow);

    render(
      <CourseLibraryManager
        courseId="course-178"
        courseName="Программа 178 часов"
        organizationId="org-csz"
      />,
    );

    await screen.findByText("Проверяемый официальный материал");
    fireEvent.click(screen.getByRole("button", { name: "CSV" }));
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(anchorClick).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:course-library");

    fireEvent.click(screen.getByRole("button", { name: "Печать" }));
    expect(open).toHaveBeenCalledWith("about:blank", "_blank");
    expect(printWindow.opener).toBeNull();
    expect(focus).toHaveBeenCalledTimes(1);
    expect(print).toHaveBeenCalledTimes(1);
    expect(printDocument.body.textContent).toContain("Электронная библиотека — Программа 178 часов");
    expect(printDocument.body.textContent).toContain("Проверяемый официальный материал");
    expect(printDocument.body.textContent).toContain("Модуль А");
  });
});

describe("CourseLibrary learner UI flows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.createLibrarySignedUrl.mockResolvedValue("https://signed.example.test/material.pdf");
  });

  it("opens an external resource in a new tab and an internal file through a signed URL", async () => {
    const external = resource({
      libraryDocumentId: "external",
      title: "Официальный внешний ресурс",
      externalUrl: "https://mchs.gov.ru/resource",
    });
    const internal = resource({
      libraryDocumentId: "internal",
      title: "Внутренний файл",
      externalUrl: null,
      originalFilename: "material.pdf",
      storagePath: "library/org-csz/material.pdf",
    });
    const externalWindow = fakePendingWindow();
    const internalWindow = fakePendingWindow();
    const open = vi.spyOn(window, "open")
      .mockReturnValueOnce(externalWindow.value)
      .mockReturnValueOnce(internalWindow.value);

    render(
      <CourseLibraryReader
        courseId="course-178"
        previewData={{ modules, resources: [external, internal] }}
      />,
    );

    fireEvent.click(
      within(screen.getByTestId("library-resource-external"))
        .getByRole("button", { name: "Перейти к источнику" }),
    );
    await waitFor(() => expect(externalWindow.replace).toHaveBeenCalledWith(
      "https://mchs.gov.ru/resource",
    ));
    expect(apiMocks.createLibrarySignedUrl).not.toHaveBeenCalled();
    expect(externalWindow.value.opener).toBeNull();

    fireEvent.click(
      within(screen.getByTestId("library-resource-internal"))
        .getByRole("button", { name: "Открыть материал" }),
    );
    await waitFor(() => expect(apiMocks.createLibrarySignedUrl).toHaveBeenCalledWith(
      "library/org-csz/material.pdf",
    ));
    expect(internalWindow.replace).toHaveBeenCalledWith(
      "https://signed.example.test/material.pdf",
    );
    expect(internalWindow.value.opener).toBeNull();
    expect(open).toHaveBeenNthCalledWith(1, "about:blank", "_blank");
    expect(open).toHaveBeenNthCalledWith(2, "about:blank", "_blank");
  });

  it("filters by module while retaining resources assigned to the whole course", () => {
    const courseWide = resource({
      libraryDocumentId: "course-wide",
      title: "Материал всего курса",
    });
    const moduleA = resource({
      libraryDocumentId: "module-a",
      moduleId: "module-a",
      moduleTitle: "Модуль А",
      title: "Материал модуля А",
    });
    const moduleB = resource({
      libraryDocumentId: "module-b",
      moduleId: "module-b",
      moduleTitle: "Модуль Б",
      title: "Материал модуля Б",
    });

    render(
      <CourseLibraryReader
        courseId="course-178"
        previewData={{ modules, resources: [courseWide, moduleA, moduleB] }}
      />,
    );

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "module-b" } });
    expect(screen.getByText("Материал всего курса")).toBeInTheDocument();
    expect(screen.getByText("Материал модуля Б")).toBeInTheDocument();
    expect(screen.queryByText("Материал модуля А")).not.toBeInTheDocument();
  });

  it("closes the pending tab and shows a clear error when a signed URL cannot be created", async () => {
    const internal = resource({
      libraryDocumentId: "unavailable-signed-url",
      title: "Временно недоступный внутренний файл",
      externalUrl: null,
      storagePath: "library/org-csz/unavailable.pdf",
    });
    apiMocks.createLibrarySignedUrl.mockRejectedValue(new Error("Ресурс временно недоступен"));
    const pendingWindow = fakePendingWindow();
    vi.spyOn(window, "open").mockReturnValue(pendingWindow.value);

    render(
      <CourseLibraryReader
        courseId="course-178"
        previewData={{ modules: [], resources: [internal] }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Открыть материал" }));
    await waitFor(() => expect(pendingWindow.close).toHaveBeenCalledTimes(1));
    expect(toastMocks.error).toHaveBeenCalledWith("Ресурс временно недоступен");
    expect(pendingWindow.replace).not.toHaveBeenCalled();
  });
});
